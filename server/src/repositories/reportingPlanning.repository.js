// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingPlanning.repository.js
//
// Read-only rows for two planning tools on the Operations reports page:
// the reorder planner (features/reporting/reorderPlan.js) and the
// workload heatmap (features/reporting/workload.js). Nothing is worked
// out here beyond the sums a query is the right place for.
//
// Days and hours are South African throughout.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const TODAY = `(NOW() AT TIME ZONE 'Africa/Johannesburg')::date`;
const SAST = (col) => `(${col} AT TIME ZONE 'Africa/Johannesburg')`;

/**
 * One row for each active product, with everything the reorder plan
 * needs: what is on hand, what the standing orders take each week, what
 * was really dispatched lately, what is already on order, and how long
 * its supplier takes.
 *
 * `historyDays`: the window for dispatch history.
 */
export const listReorderInputs = async ({ historyDays }) => {
  const { rows } = await pool.query(
    `WITH standing AS (
       -- Lines in the unit the product is stocked in. A line in another
       -- unit cannot be added to it, so it is counted, not converted.
       SELECT ol.product_id,
              SUM(ol.quantity) FILTER (WHERE ol.unit = sl.unit)  AS weekly,
              COUNT(*)         FILTER (WHERE ol.unit <> sl.unit) AS other_unit_lines
         FROM ecd_order_lines ol
         JOIN ecd_centres e    ON e.id = ol.ecd_id AND e.is_active = true
         JOIN stock_levels sl  ON sl.product_id = ol.product_id
        WHERE ol.effective_from <= ${TODAY}
          AND (ol.effective_to IS NULL OR ol.effective_to >= ${TODAY})
        GROUP BY ol.product_id
     ),
     dispatched AS (
       SELECT sm.product_id, SUM(-sm.quantity) AS quantity
         FROM stock_movements sm
        WHERE sm.movement_type = 'dispatched' AND sm.quantity < 0
          AND ${SAST('sm.created_at')}::date > ${TODAY} - $1::int
        GROUP BY sm.product_id
     ),
     on_order AS (
       -- What open orders still owe. An order whose remainder has moved
       -- to a follow-up order is left out, or it would be counted twice.
       SELECT poi.product_id,
              SUM(GREATEST(poi.expected_quantity - COALESCE(r.received, 0), 0)) AS quantity,
              MIN(po.expected_delivery_date) AS next_delivery
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         LEFT JOIN LATERAL (
           SELECT SUM(dni.received_quantity) AS received
             FROM delivery_note_items dni WHERE dni.purchase_order_item_id = poi.id
         ) r ON TRUE
        WHERE po.status IN ('approved', 'in_transit', 'partially_received')
          AND NOT EXISTS (
            SELECT 1 FROM purchase_orders child
             WHERE child.follow_up_of = po.id AND child.status NOT IN ('completed', 'returned'))
        GROUP BY poi.product_id
       HAVING SUM(GREATEST(poi.expected_quantity - COALESCE(r.received, 0), 0)) > 0
     ),
     lead AS (
       -- Median days from the order being raised to its first receipt,
       -- over the last year, and who supplied it most recently.
       SELECT poi.product_id,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (d.first_receipt - po.created_at)) / 86400.0) AS days,
              (ARRAY_AGG(s.name ORDER BY po.created_at DESC))[1] AS supplier_name
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         JOIN suppliers s        ON s.id = po.supplier_id
         JOIN LATERAL (
           SELECT MIN(dn.created_at) AS first_receipt FROM delivery_notes dn WHERE dn.purchase_order_id = po.id
         ) d ON d.first_receipt IS NOT NULL
        WHERE po.created_at > NOW() - INTERVAL '365 days'
        GROUP BY poi.product_id
     )
     SELECT p.id AS product_id, p.name, sl.unit,
            sl.quantity_on_hand AS on_hand, sl.reorder_threshold,
            COALESCE(st.weekly, 0)            AS standing_weekly,
            COALESCE(st.other_unit_lines, 0)  AS other_unit_lines,
            COALESCE(di.quantity, 0)          AS dispatched_recent,
            COALESCE(oo.quantity, 0)          AS on_order,
            oo.next_delivery::text            AS next_delivery,
            le.days                           AS lead_days,
            le.supplier_name
       FROM products p
       JOIN stock_levels sl ON sl.product_id = p.id
       LEFT JOIN standing st   ON st.product_id = p.id
       LEFT JOIN dispatched di ON di.product_id = p.id
       LEFT JOIN on_order oo   ON oo.product_id = p.id
       LEFT JOIN lead le       ON le.product_id = p.id
      WHERE p.is_active = true AND p.archived_at IS NULL
      ORDER BY p.name ASC`,
    [historyDays],
  );
  return rows;
};

/**
 * Recorded work per area, weekday (1 = Monday) and hour of the day,
 * for [from, to]: deliveries received, lines picked, pallets released.
 */
export const listWorkload = async ({ from, to }) => {
  const { rows } = await pool.query(
    `WITH work AS (
       SELECT 'receiving' AS area, ${SAST('dn.created_at')} AS at FROM delivery_notes dn
       UNION ALL
       SELECT 'packing', ${SAST('pe.created_at')} FROM picking_events pe
        WHERE pe.event_type IN ('item_confirmed', 'item_flagged')
       UNION ALL
       SELECT 'gate', ${SAST('de.collected_at')} FROM dispatch_events de
        WHERE de.collected_at IS NOT NULL AND de.status IN ('collected', 'late_collected')
     )
     SELECT area, EXTRACT(ISODOW FROM at)::int AS weekday, EXTRACT(HOUR FROM at)::int AS hour, COUNT(*)::int AS events
       FROM work
      WHERE at::date BETWEEN $1::date AND $2::date
      GROUP BY area, weekday, hour
      ORDER BY area, weekday, hour`,
    [from, to],
  );
  return rows;
};

export default { listReorderInputs, listWorkload };

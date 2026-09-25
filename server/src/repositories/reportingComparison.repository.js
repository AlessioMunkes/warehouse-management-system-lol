// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingComparison.repository.js
//
// Two measures per item, for scatter plots on the Operations page:
// one row per centre, supplier, product or packer with an x and a y.
// Read-only and parameterised, like reporting.repository.js.
//
// The shape is [{ label, x, y, meta }]. The AI can only choose WHICH
// declared comparison to run (reportComparisons.js), never pick its
// own axes, so there is no path from a question to a new join.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { COLLECTED_STATUSES, NOT_COLLECTED_STATUSES } from '../features/reporting/reportCatalog.js';

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

// Every centre with a registered child count that had a slip in the
// period, including the ones that collected nothing — those are the
// dots worth seeing.
const centreCollectionsVsChildren = async ({ dateRange }) => {
  const { rows } = await pool.query(
    `SELECT e.name AS label,
            e.child_count::numeric AS x,
            COUNT(*) FILTER (WHERE de.status = ANY($3::text[]))::int AS y,
            COUNT(*) FILTER (WHERE de.status = ANY($4::text[]))::int AS missed,
            MAX(ps.cohort::text) AS cohort
       FROM ecd_centres e
       JOIN picking_slips ps ON ps.ecd_id = e.id
                            AND ps.dispatch_date BETWEEN $1::date AND $2::date
                            AND ps.status IN ('complete', 'dispatched')
  LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
      WHERE e.child_count IS NOT NULL AND e.child_count > 0
      GROUP BY e.id, e.name, e.child_count
      ORDER BY e.name`,
    [dateRange.from, dateRange.to, COLLECTED_STATUSES, NOT_COLLECTED_STATUSES]
  );
  return rows.map((r) => ({
    label: r.label, x: num(r.x), y: num(r.y),
    meta: { missed: num(r.missed), cohort: r.cohort },
  }));
};

const supplierVolumeVsDiscrepancy = async ({ dateRange }) => {
  const { rows } = await pool.query(
    `SELECT s.name AS label,
            COUNT(*)::int AS x,
            ROUND(100.0 * COUNT(*) FILTER (WHERE COALESCE(dni.discrepancy_quantity, 0) <> 0)
                  / NULLIF(COUNT(*), 0), 1)::numeric AS y,
            COUNT(DISTINCT dn.id)::int AS deliveries
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN suppliers s ON s.id = dn.supplier_id
      WHERE dn.delivery_date BETWEEN $1::date AND $2::date
      GROUP BY s.id, s.name
      ORDER BY s.name`,
    [dateRange.from, dateRange.to]
  );
  return rows.map((r) => ({ label: r.label, x: num(r.x), y: num(r.y), meta: { deliveries: num(r.deliveries) } }));
};

// Weighted price, same as unit_price_trend: one big cheap delivery
// is not outvoted by several small expensive ones.
const productPriceVsQuantity = async ({ dateRange }) => {
  const { rows } = await pool.query(
    `SELECT p.name AS label,
            SUM(dni.received_quantity)::numeric AS x,
            ROUND((SUM(dni.received_quantity * poi.unit_price)
                   / NULLIF(SUM(dni.received_quantity), 0))::numeric, 2) AS y,
            MAX(dni.unit) AS unit
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN purchase_order_items poi ON poi.id = dni.purchase_order_item_id
       JOIN products p ON p.id = dni.product_id
      WHERE dn.delivery_date BETWEEN $1::date AND $2::date
        AND poi.unit_price IS NOT NULL AND dni.received_quantity > 0
      GROUP BY p.id, p.name
      ORDER BY p.name`,
    [dateRange.from, dateRange.to]
  );
  return rows.map((r) => ({ label: r.label, x: num(r.x), y: num(r.y), meta: { unit: r.unit } }));
};

// Staff only (confirmed_by is a users row). Guest packers have no
// user id and are left out rather than lumped into one dot.
const packerWorkloadVsFlags = async ({ dateRange }) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), 'Unnamed') AS label,
            COUNT(*)::int AS x,
            ROUND(100.0 * COUNT(*) FILTER (WHERE psi.status = 'flagged') / NULLIF(COUNT(*), 0), 1)::numeric AS y,
            COUNT(DISTINCT ps.id)::int AS slips
       FROM picking_slip_items psi
       JOIN picking_slips ps ON ps.id = psi.picking_slip_id
       JOIN users u ON u.id = psi.confirmed_by
      WHERE ps.dispatch_date BETWEEN $1::date AND $2::date
        AND psi.status IN ('confirmed', 'flagged')
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY 1`,
    [dateRange.from, dateRange.to]
  );
  return rows.map((r) => ({ label: r.label, x: num(r.x), y: num(r.y), meta: { slips: num(r.slips) } }));
};

export default {
  centreCollectionsVsChildren,
  supplierVolumeVsDiscrepancy,
  productPriceVsQuantity,
  packerWorkloadVsFlags,
};

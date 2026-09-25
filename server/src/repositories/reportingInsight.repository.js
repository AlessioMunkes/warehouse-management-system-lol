// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingInsight.repository.js
//
// The "who to act on" lists behind an operational report: the
// named centres, suppliers, products and packers that make up a
// chart's headline number, with whatever the manager needs to
// pick up the phone. Read-only, parameterised, same rules as
// reporting.repository.js.
//
// OPERATIONAL ONLY
// Nothing here is reached from an impact metric —
// reportingInsight.service.js refuses impactOnly metrics before any
// of these run.
//
// PRIVACY
// Organisation contacts only: an ECD centre's contact person, a
// supplier's contact details, a staff member's first name against
// work assigned to them. Donor, caller and volunteer details stay
// unreachable here exactly as they do in reporting.repository.js —
// there is deliberately no list for donations, Section 18A,
// community requests or volunteer hours.
//
// Every function returns { rows, total }: at most LIST_LIMIT rows,
// most urgent first, plus the true count so the page can say
// "showing the 15 most urgent of 21".
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { NOT_COLLECTED_STATUSES, SAST } from '../features/reporting/reportCatalog.js';
import { OPEN_PO_STATUSES } from '../constants/purchaseOrderStatus.js';

export const LIST_LIMIT = 15;

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

// COUNT(*) OVER () on a grouped query counts groups, not rows, so
// every row carries the full list length before LIMIT cuts it.
const withTotal = (rows) => ({ rows, total: rows[0] ? Number(rows[0].total) : 0 });

// ══ Centres ════════════════════════════════════════════════════
const centresMissingCollections = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to, NOT_COLLECTED_STATUSES];
  const where = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `de.status = ANY($3::text[])`,
  ];
  if (filters.cohort) { params.push(filters.cohort); where.push(`ps.cohort = $${params.length}::cohort_group`); }
  if (filters.ecd_id) { params.push(filters.ecd_id); where.push(`ps.ecd_id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT COALESCE(e.name, ps.beneficiary_name, 'Unknown') AS name,
            MAX(e.contact_name)         AS contact_name,
            MAX(e.contact_phone)        AS contact_phone,
            MAX(e.contact_email)        AS contact_email,
            MAX(ps.cohort::text)        AS cohort,
            COUNT(*)::int               AS missed,
            MAX(ps.dispatch_date)       AS last_missed,
            MAX(e.last_collected_date)  AS last_collected,
            COUNT(*) OVER ()            AS total
       FROM picking_slips ps
       JOIN dispatch_events de ON de.picking_slip_id = ps.id
  LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE ${where.join(' AND ')}
      GROUP BY 1
      ORDER BY missed DESC, last_missed DESC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows.map((r) => ({ ...r, missed: num(r.missed) })));
};

// ══ Suppliers ══════════════════════════════════════════════════
const suppliersWithOpenDiscrepancies = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [
    `dn.delivery_date BETWEEN $1::date AND $2::date`,
    `COALESCE(dni.discrepancy_quantity, 0) <> 0`,
    `dni.discrepancy_resolved = false`,
  ];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`dn.supplier_id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT s.name, s.contact_name, s.contact_phone, s.contact_email,
            COUNT(*)::int                                          AS open_lines,
            COUNT(*) FILTER (WHERE dni.discrepancy_quantity < 0)::int AS short_lines,
            MIN(dn.delivery_date)                                  AS oldest,
            COUNT(*) OVER ()                                       AS total
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN suppliers s ON s.id = dn.supplier_id
      WHERE ${where.join(' AND ')}
      GROUP BY s.id, s.name, s.contact_name, s.contact_phone, s.contact_email
      ORDER BY open_lines DESC, oldest ASC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows);
};

// At least three lines before a supplier is listed: one bad line out
// of one is 100% and says nothing about reliability.
const unreliableSuppliers = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [`dn.delivery_date BETWEEN $1::date AND $2::date`];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`dn.supplier_id = $${params.length}`); }
  if (filters.product_id)  { params.push(filters.product_id);  where.push(`dni.product_id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT t.*, COUNT(*) OVER () AS total FROM (
       SELECT s.name, s.contact_name, s.contact_phone, s.contact_email,
              COUNT(*)::int AS lines,
              COUNT(*) FILTER (WHERE COALESCE(dni.discrepancy_quantity, 0) <> 0)::int AS off_lines,
              ROUND(100.0 * COUNT(*) FILTER (WHERE COALESCE(dni.discrepancy_quantity, 0) <> 0)
                    / NULLIF(COUNT(*), 0), 1)::numeric AS rate
         FROM delivery_note_items dni
         JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
         JOIN suppliers s ON s.id = dn.supplier_id
        WHERE ${where.join(' AND ')}
        GROUP BY s.id, s.name, s.contact_name, s.contact_phone, s.contact_email
     ) t
     WHERE lines >= 3 AND off_lines > 0
     ORDER BY rate DESC, off_lines DESC
     LIMIT $${params.length}`,
    params
  );
  // The window sits on the outer query so the total counts suppliers
  // that passed the three-line rule, not every supplier grouped.
  return withTotal(rows.map((r) => ({ ...r, rate: num(r.rate) })));
};

// Who the money goes to. Concentration is the risk worth seeing: one
// supplier taking most of the spend is a single point of failure.
const supplierSpendShare = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [
    `dn.delivery_date BETWEEN $1::date AND $2::date`,
    `poi.unit_price IS NOT NULL`,
  ];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`dn.supplier_id = $${params.length}`); }
  if (filters.product_id)  { params.push(filters.product_id);  where.push(`dni.product_id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT s.name, s.contact_name, s.contact_phone, s.contact_email,
            ROUND(SUM(dni.received_quantity * poi.unit_price)::numeric, 2) AS spend,
            COUNT(DISTINCT dn.id)::int AS deliveries,
            ROUND(100.0 * SUM(dni.received_quantity * poi.unit_price)
                  / NULLIF(SUM(SUM(dni.received_quantity * poi.unit_price)) OVER (), 0), 1) AS share,
            COUNT(*) OVER () AS total
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN purchase_order_items poi ON poi.id = dni.purchase_order_item_id
       JOIN suppliers s ON s.id = dn.supplier_id
      WHERE ${where.join(' AND ')}
      GROUP BY s.id, s.name, s.contact_name, s.contact_phone, s.contact_email
      ORDER BY spend DESC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows.map((r) => ({ ...r, spend: num(r.spend), share: num(r.share) })));
};

// First price paid in the period against the latest, per product.
// Only rises are listed: a price that fell needs no phone call.
const productPriceRises = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [
    `dn.delivery_date BETWEEN $1::date AND $2::date`,
    `poi.unit_price IS NOT NULL`,
    `dni.received_quantity > 0`,
  ];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`dn.supplier_id = $${params.length}`); }
  if (filters.product_id)  { params.push(filters.product_id);  where.push(`dni.product_id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `WITH fl AS (
       SELECT p.name AS product,
              (array_agg(poi.unit_price ORDER BY dn.delivery_date ASC,  dni.id ASC))[1]  AS first_price,
              (array_agg(poi.unit_price ORDER BY dn.delivery_date DESC, dni.id DESC))[1] AS last_price,
              (array_agg(dn.supplier_id ORDER BY dn.delivery_date DESC, dni.id DESC))[1] AS last_supplier_id,
              COUNT(*) AS lines
         FROM delivery_note_items dni
         JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
         JOIN purchase_order_items poi ON poi.id = dni.purchase_order_item_id
         JOIN products p ON p.id = dni.product_id
        WHERE ${where.join(' AND ')}
        GROUP BY p.id, p.name
     )
     SELECT fl.product AS name, fl.first_price, fl.last_price,
            ROUND(100.0 * (fl.last_price - fl.first_price) / NULLIF(fl.first_price, 0), 1) AS rise_pct,
            s.name AS supplier, s.contact_name, s.contact_phone, s.contact_email,
            COUNT(*) OVER () AS total
       FROM fl
  LEFT JOIN suppliers s ON s.id = fl.last_supplier_id
      WHERE fl.lines >= 2 AND fl.last_price > fl.first_price
      ORDER BY rise_pct DESC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows.map((r) => ({
    ...r, first_price: num(r.first_price), last_price: num(r.last_price), rise_pct: num(r.rise_pct),
  })));
};

// ══ Stock ══════════════════════════════════════════════════════
// Each low item carries who last supplied it and whether an open
// purchase order already covers it — the difference between "order
// this" and "chase the order you already placed".
const lowStockToReorder = async ({ filters = {} }) => {
  const params = [OPEN_PO_STATUSES];
  const where = [
    `p.is_active = true`, `sl.reorder_threshold > 0`,
    `sl.quantity_on_hand <= sl.reorder_threshold`,
  ];
  if (filters.programme_id) { params.push(filters.programme_id); where.push(`p.programme_id = $${params.length}`); }
  if (filters.product_id)   { params.push(filters.product_id);   where.push(`p.id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT p.name, sl.quantity_on_hand::numeric AS on_hand,
            sl.reorder_threshold::numeric AS threshold, sl.unit,
            ls.supplier, ls.contact_name, ls.contact_phone, ls.contact_email, ls.last_delivery,
            op.open_orders,
            COUNT(*) OVER () AS total
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
  LEFT JOIN LATERAL (
              SELECT s.name AS supplier, s.contact_name, s.contact_phone, s.contact_email,
                     dn.delivery_date AS last_delivery
                FROM delivery_note_items dni
                JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
                JOIN suppliers s ON s.id = dn.supplier_id
               WHERE dni.product_id = p.id
               ORDER BY dn.delivery_date DESC
               LIMIT 1
            ) ls ON true
  LEFT JOIN LATERAL (
              SELECT COUNT(DISTINCT po.id)::int AS open_orders
                FROM purchase_order_items poi
                JOIN purchase_orders po ON po.id = poi.purchase_order_id
               WHERE poi.product_id = p.id AND po.status = ANY($1::text[])
            ) op ON true
      WHERE ${where.join(' AND ')}
      ORDER BY (sl.quantity_on_hand - sl.reorder_threshold) ASC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows.map((r) => ({
    ...r, on_hand: num(r.on_hand), threshold: num(r.threshold), open_orders: num(r.open_orders),
  })));
};

// Same source as expiryWarning.repository.js: the receiving line's
// own expiry date, not per-batch stock (which does not exist yet).
const stockNearExpiry = async ({ withinDays = 14 } = {}) => {
  const { rows } = await pool.query(
    `SELECT p.name, dni.expiry_date, dni.received_quantity::numeric AS quantity, dni.unit,
            (dni.expiry_date - CURRENT_DATE)::int AS days_left,
            COUNT(*) OVER () AS total
       FROM delivery_note_items dni
       JOIN products p ON p.id = dni.product_id
      WHERE dni.expiry_date IS NOT NULL
        AND dni.expiry_date >= CURRENT_DATE
        AND dni.expiry_date <= CURRENT_DATE + $1::int
      ORDER BY dni.expiry_date ASC
      LIMIT $2`,
    [withinDays, LIST_LIMIT]
  );
  return withTotal(rows.map((r) => ({ ...r, quantity: num(r.quantity) })));
};

const countVarianceByProduct = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [`sc.count_date BETWEEN $1::date AND $2::date`, `scl.variance IS NOT NULL`, `scl.variance <> 0`];
  if (filters.product_id) { params.push(filters.product_id); where.push(`scl.product_id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT p.name,
            SUM(ABS(scl.variance))::numeric AS variance,
            SUM(scl.variance)::numeric      AS net_variance,
            COUNT(*)::int                   AS counts_off,
            MAX(sc.count_date)              AS last_count,
            COUNT(*) OVER ()                AS total
       FROM stock_count_lines scl
       JOIN stock_counts sc ON sc.id = scl.stock_count_id
       JOIN products p ON p.id = scl.product_id
      WHERE ${where.join(' AND ')}
      GROUP BY p.id, p.name
      ORDER BY variance DESC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows.map((r) => ({ ...r, variance: num(r.variance), net_variance: num(r.net_variance) })));
};

const manualAdjustmentsByProduct = async ({ dateRange, filters = {} }) => {
  const d = `((sm.created_at AT TIME ZONE '${SAST}')::date)`;
  const params = [dateRange.from, dateRange.to];
  const where = [`${d} BETWEEN $1::date AND $2::date`, `sm.movement_type = 'adjustment'`];
  if (filters.product_id)   { params.push(filters.product_id);   where.push(`sm.product_id = $${params.length}`); }
  if (filters.programme_id) { params.push(filters.programme_id); where.push(`p.programme_id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT p.name, COUNT(*)::int AS adjustments,
            SUM(sm.quantity)::numeric       AS net_quantity,
            SUM(ABS(sm.quantity))::numeric  AS moved,
            COUNT(*) OVER ()                AS total
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
      WHERE ${where.join(' AND ')}
      GROUP BY p.id, p.name
      ORDER BY adjustments DESC, moved DESC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows.map((r) => ({ ...r, net_quantity: num(r.net_quantity), moved: num(r.moved) })));
};

// ══ Decanting ══════════════════════════════════════════════════
const wastageByProduct = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [`dr.week_of BETWEEN $1::date AND $2::date`];
  if (filters.product_id) { params.push(filters.product_id); where.push(`dl.product_id = $${params.length}`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT t.*, COUNT(*) OVER () AS total FROM (
       SELECT COALESCE(p.name, 'Unknown product') AS name,
              SUM(dl.wastage_kg)::numeric AS wastage_kg,
              SUM(dl.packed_kg)::numeric  AS packed_kg,
              ROUND(100.0 * SUM(dl.wastage_kg) / NULLIF(SUM(dl.packed_kg), 0), 1)::numeric AS rate,
              string_agg(DISTINCT u.first_name, ', ') AS recorded_by
         FROM decanting_lines dl
         JOIN decanting_records dr ON dr.id = dl.decanting_id
    LEFT JOIN products p ON p.id = dl.product_id
    LEFT JOIN users u ON u.id = dr.recorded_by
        WHERE ${where.join(' AND ')}
        GROUP BY p.name
     ) t
     WHERE wastage_kg > 0
     ORDER BY wastage_kg DESC
     LIMIT $${params.length}`,
    params
  );
  return withTotal(rows.map((r) => ({
    ...r, wastage_kg: num(r.wastage_kg), packed_kg: num(r.packed_kg), rate: num(r.rate),
  })));
};

// ══ Picking and packers ════════════════════════════════════════
// The most common flag reason per product says WHY, which is what
// decides whether this is a supplier call or a stock-count job.
const flaggedProducts = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [`ps.dispatch_date BETWEEN $1::date AND $2::date`, `psi.status = 'flagged'`];
  if (filters.product_id) { params.push(filters.product_id); where.push(`psi.product_id = $${params.length}`); }
  if (filters.cohort)     { params.push(filters.cohort);     where.push(`ps.cohort = $${params.length}::cohort_group`); }
  params.push(LIST_LIMIT);

  const { rows } = await pool.query(
    `SELECT p.name, COUNT(*)::int AS flags,
            mode() WITHIN GROUP (ORDER BY NULLIF(TRIM(psi.flag_reason), '')) AS top_reason,
            string_agg(DISTINCT u.first_name, ', ') AS flagged_by,
            COUNT(*) OVER () AS total
       FROM picking_slip_items psi
       JOIN picking_slips ps ON ps.id = psi.picking_slip_id
       JOIN products p ON p.id = psi.product_id
  LEFT JOIN users u ON u.id = psi.confirmed_by
      WHERE ${where.join(' AND ')}
      GROUP BY p.id, p.name
      ORDER BY flags DESC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows);
};

// Pallets whose dispatch date has come and gone while the slip is
// still open, per packer. Workload, not blame: an overloaded packer
// and an unassigned slip look the same from the gate.
const overdueSlipsByPacker = async () => {
  const today = `((NOW() AT TIME ZONE '${SAST}')::date)`;
  const { rows } = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), 'Unassigned') AS name,
            COUNT(*)::int            AS open_slips,
            MIN(ps.dispatch_date)    AS oldest,
            string_agg(DISTINCT COALESCE(e.name, ps.beneficiary_name), ', ') AS centres,
            COUNT(*) OVER ()         AS total
       FROM picking_slips ps
  LEFT JOIN users u ON u.id = ps.assigned_to
  LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE ps.status IN ('pending', 'in_progress')
        AND ps.dispatch_date < ${today}
      GROUP BY 1
      ORDER BY open_slips DESC, oldest ASC
      LIMIT $1`,
    [LIST_LIMIT]
  );
  return withTotal(rows);
};

// Open purchase orders past their promised date, oldest first, with
// the supplier's contact details.
const overdueOrders = async ({ filters = {} }) => {
  const today = `((NOW() AT TIME ZONE '${SAST}')::date)`;
  const params = [OPEN_PO_STATUSES];
  const where = [`po.status = ANY($1::text[])`, `po.expected_delivery_date < ${today}`];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`po.supplier_id = $${params.length}`); }
  params.push(LIST_LIMIT);
  const { rows } = await pool.query(
    `SELECT po.po_number, po.status, po.expected_delivery_date AS expected,
            (${today} - po.expected_delivery_date)::int AS days_late,
            s.name AS supplier, s.contact_name, s.contact_phone, s.contact_email,
            (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id)::int AS lines,
            COUNT(*) OVER () AS total
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
      WHERE ${where.join(' AND ')}
      ORDER BY po.expected_delivery_date ASC
      LIMIT $${params.length}`,
    params
  );
  return withTotal(rows);
};

// At least two collections before a centre is listed, so one late
// pallet is not a 100% "problem".
const centresCollectingLate = async ({ dateRange, filters = {} }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [`ps.dispatch_date BETWEEN $1::date AND $2::date`, `de.status IN ('collected', 'late_collected')`];
  if (filters.cohort) { params.push(filters.cohort); where.push(`ps.cohort = $${params.length}::cohort_group`); }
  if (filters.ecd_id) { params.push(filters.ecd_id); where.push(`ps.ecd_id = $${params.length}`); }
  params.push(LIST_LIMIT);
  const { rows } = await pool.query(
    `SELECT t.*, COUNT(*) OVER () AS total FROM (
       SELECT COALESCE(e.name, ps.beneficiary_name, 'Unknown') AS name,
              MAX(e.contact_name) AS contact_name, MAX(e.contact_phone) AS contact_phone,
              MAX(e.contact_email) AS contact_email, MAX(ps.cohort::text) AS cohort,
              COUNT(*)::int AS collected,
              COUNT(*) FILTER (WHERE de.status = 'late_collected')::int AS late,
              ROUND(100.0 * COUNT(*) FILTER (WHERE de.status = 'late_collected') / COUNT(*), 1)::numeric AS rate
         FROM picking_slips ps
         JOIN dispatch_events de ON de.picking_slip_id = ps.id
    LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
        WHERE ${where.join(' AND ')}
        GROUP BY 1
     ) t
     WHERE collected >= 2 AND late > 0
     ORDER BY rate DESC, late DESC
     LIMIT $${params.length}`,
    params
  );
  return withTotal(rows.map((r) => ({ ...r, rate: num(r.rate) })));
};

export default {
  LIST_LIMIT,
  overdueOrders,
  centresCollectingLate,
  centresMissingCollections,
  suppliersWithOpenDiscrepancies,
  unreliableSuppliers,
  supplierSpendShare,
  productPriceRises,
  lowStockToReorder,
  stockNearExpiry,
  countVarianceByProduct,
  manualAdjustmentsByProduct,
  wastageByProduct,
  flaggedProducts,
  overdueSlipsByPacker,
};

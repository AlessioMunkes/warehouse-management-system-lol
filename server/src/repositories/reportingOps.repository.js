// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingOps.repository.js
//
// SQL for the second wave of operational metrics: purchase-order
// timeliness, picking throughput, gate loading, late collections,
// standing-order demand, stock value and expiry, decanting accuracy,
// adjustment reasons, community response times, donation routing and
// volunteer event attendance.
//
// Same rules as reporting.repository.js, which re-exports these so
// reporting.service.js finds every repoFn in one place:
//   - every value is a $n parameter; the only interpolated SQL comes
//     from a closed map keyed on a validated dimension id
//   - each function returns [{ label, value, meta? }]
//   - timestamptz columns go through sastDate()
//   - no donor, caller or volunteer names — volunteer attendance is
//     by EVENT, never by person
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { COLLECTED_STATUSES, SAST } from '../features/reporting/reportCatalog.js';
import { OPEN_PO_STATUSES } from '../constants/purchaseOrderStatus.js';

const sastDate = (col) => `((${col} AT TIME ZONE '${SAST}')::date)`;
const TODAY = `((NOW() AT TIME ZONE '${SAST}')::date)`;
const bucketMonth = (d) => `to_char(${d}, 'YYYY-MM')`;
const bucketWeek  = (d) => `to_char(${d}, 'IYYY-"W"IW')`;
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const rows2series = (rows) => rows.map((r) => ({ label: r.label, value: num(r.value) }));

const pick = (map, dimension) => {
  const expr = map[dimension];
  if (!expr) throw new Error(`Unsupported dimension: ${dimension}`);
  return expr;
};
const isTime = (d) => d === 'month' || d === 'week' || d === 'none';
const groupBy = (dimension, expr) => (dimension === 'none' ? '' : `GROUP BY ${expr}`);
const orderBy = (dimension, dir = 'DESC') => (isTime(dimension) ? '1' : `2 ${dir} NULLS LAST, 1`);

// ══ Purchase orders ════════════════════════════════════════════
// First delivery per PO. A PO delivered in instalments is judged on
// when the first goods arrived.
const PO_FIRST_DELIVERY = `
  SELECT po.id, po.supplier_id, po.expected_delivery_date AS expected,
         ${sastDate('po.created_at')} AS raised,
         (SELECT MIN(dn.delivery_date) FROM delivery_notes dn WHERE dn.purchase_order_id = po.id) AS first_delivery
    FROM purchase_orders po
   WHERE po.status <> 'returned'`;

// On time = first delivery on or before the expected date. A PO whose
// expected date has passed with nothing delivered counts as late; one
// still in the future with nothing delivered is not judged yet.
const poOnTimeRate = async ({ dimension, filters, dateRange }) => {
  const expr = pick({ none: `'Total'`, month: bucketMonth('p.expected'), supplier: 's.name' }, dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [`p.expected BETWEEN $1::date AND $2::date`, `(p.first_delivery IS NOT NULL OR p.expected < ${TODAY})`];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`p.supplier_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(100.0 * COUNT(*) FILTER (WHERE p.first_delivery <= p.expected) / NULLIF(COUNT(*), 0), 1)::numeric AS value,
            COUNT(*)::int AS orders
       FROM (${PO_FIRST_DELIVERY}) p
       JOIN suppliers s ON s.id = p.supplier_id
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${orderBy(dimension, 'ASC')}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { orders: r.orders } }));
};

const supplierLeadTime = async ({ dimension, filters, dateRange }) => {
  const expr = pick({ none: `'Total'`, month: bucketMonth('p.raised'), supplier: 's.name' }, dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [`p.raised BETWEEN $1::date AND $2::date`, `p.first_delivery IS NOT NULL`, `p.first_delivery >= p.raised`];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`p.supplier_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(AVG(p.first_delivery - p.raised)::numeric, 1) AS value,
            ROUND(AVG(s.expected_lead_time_days)::numeric, 1) AS agreed,
            COUNT(*)::int AS orders
       FROM (${PO_FIRST_DELIVERY}) p
       JOIN suppliers s ON s.id = p.supplier_id
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${orderBy(dimension)}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { orders: r.orders, agreedDays: r.agreed === null ? null : num(r.agreed) } }));
};

const overduePurchaseOrders = async ({ dimension, filters, limit }) => {
  const expr = pick({ none: `'Total'`, supplier: 's.name' }, dimension);
  const params = [OPEN_PO_STATUSES];
  const where = [`po.status = ANY($1::text[])`, `po.expected_delivery_date < ${TODAY}`];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`po.supplier_id = $${params.length}`); }
  params.push(limit ?? 10);
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, COUNT(*)::numeric AS value,
            MAX(${TODAY} - po.expected_delivery_date)::int AS worst_days
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${dimension === 'none' ? '1' : '2 DESC, 1'}
      LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { worstDaysLate: r.worst_days } }));
};

const purchaseOrderPipeline = async ({ dimension, filters, dateRange }) => {
  const d = sastDate('po.created_at');
  const expr = pick({ po_status: 'po.status', supplier: 's.name', month: bucketMonth(d) }, dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [`${d} BETWEEN $1::date AND $2::date`];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`po.supplier_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, COUNT(*)::numeric AS value
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr} ORDER BY ${orderBy(dimension)}`,
    params
  );
  return rows2series(rows);
};

// ══ Picking ════════════════════════════════════════════════════
// Hours from a packer starting a slip to completing it. Slips with no
// start (completed in one step) have no duration and are left out.
const pickingTurnaround = async ({ dimension, filters, dateRange }) => {
  const expr = pick({
    none: `'Total'`, month: bucketMonth('ps.dispatch_date'), week: bucketWeek('ps.dispatch_date'), cohort: 'ps.cohort::text',
  }, dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `ps.started_at IS NOT NULL`, `ps.completed_at IS NOT NULL`, `ps.completed_at > ps.started_at`,
  ];
  if (filters.cohort) { params.push(filters.cohort); where.push(`ps.cohort = $${params.length}::cohort_group`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(AVG(EXTRACT(EPOCH FROM (ps.completed_at - ps.started_at)) / 3600.0)::numeric, 1) AS value,
            COUNT(*)::int AS slips
       FROM picking_slips ps
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${orderBy(dimension)}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { slips: r.slips } }));
};

// Live: the fortnight around today — last week's stragglers and the
// next two weeks' pallets.
const slipPipeline = async ({ dimension, filters }) => {
  const expr = pick({ slip_status: 'ps.status', cohort: 'ps.cohort::text' }, dimension);
  const params = [];
  const where = [`ps.dispatch_date BETWEEN ${TODAY} - 7 AND ${TODAY} + 14`];
  if (filters.cohort) { params.push(filters.cohort); where.push(`ps.cohort = $${params.length}::cohort_group`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, COUNT(*)::numeric AS value
       FROM picking_slips ps
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr} ORDER BY 2 DESC, 1`,
    params
  );
  return rows2series(rows);
};

// ══ Dispatch ═══════════════════════════════════════════════════
const gateLoadVariance = async ({ dimension, filters, dateRange }) => {
  const expr = pick({ none: `'Total'`, month: bucketMonth('ps.dispatch_date'), product: 'p.name' }, dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [`ps.dispatch_date BETWEEN $1::date AND $2::date`];
  if (filters.product_id) { params.push(filters.product_id); where.push(`del.product_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(100.0 * COUNT(*) FILTER (WHERE del.loaded_quantity <> del.packed_quantity) / NULLIF(COUNT(*), 0), 1)::numeric AS value,
            COUNT(*)::int AS lines
       FROM dispatch_event_lines del
       JOIN dispatch_events de ON de.id = del.dispatch_event_id
       JOIN picking_slips ps ON ps.id = de.picking_slip_id
       JOIN products p ON p.id = del.product_id
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${orderBy(dimension)}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { lines: r.lines } }));
};

const lateCollectionRate = async ({ dimension, filters, dateRange }) => {
  const expr = pick({
    none: `'Total'`, month: bucketMonth('ps.dispatch_date'), cohort: 'ps.cohort::text',
    ecd_centre: `COALESCE(e.name, ps.beneficiary_name)`,
  }, dimension);
  const params = [dateRange.from, dateRange.to, COLLECTED_STATUSES];
  const where = [`ps.dispatch_date BETWEEN $1::date AND $2::date`, `de.status = ANY($3::text[])`];
  if (filters.cohort) { params.push(filters.cohort); where.push(`ps.cohort = $${params.length}::cohort_group`); }
  if (filters.ecd_id) { params.push(filters.ecd_id); where.push(`ps.ecd_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(100.0 * COUNT(*) FILTER (WHERE de.status = 'late_collected') / NULLIF(COUNT(*), 0), 1)::numeric AS value,
            COUNT(*)::int AS collections
       FROM picking_slips ps
       JOIN dispatch_events de ON de.picking_slip_id = ps.id
  LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${orderBy(dimension)}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { collections: r.collections } }));
};

// ══ Stock ══════════════════════════════════════════════════════
// Active standing orders, kilogram lines only — mixing kg and crates
// would be a meaningless total.
const standingOrderDemand = async ({ dimension, filters, limit }) => {
  const expr = pick({ product: 'p.name', ecd_centre: 'e.name', none: `'Total'` }, dimension);
  const params = [];
  const where = [
    `e.is_active = true`, `ol.unit = 'kg'`,
    `ol.effective_from <= ${TODAY}`, `(ol.effective_to IS NULL OR ol.effective_to >= ${TODAY})`,
  ];
  if (filters.product_id) { params.push(filters.product_id); where.push(`ol.product_id = $${params.length}`); }
  if (filters.cohort)     { params.push(filters.cohort);     where.push(`e.cohort = $${params.length}::cohort_group`); }
  params.push(limit ?? 10);
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, SUM(ol.quantity)::numeric AS value
       FROM ecd_order_lines ol
       JOIN ecd_centres e ON e.id = ol.ecd_id
       JOIN products p ON p.id = ol.product_id
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${dimension === 'none' ? '1' : '2 DESC, 1'}
      LIMIT $${params.length}`,
    params
  );
  return rows2series(rows);
};

const stockValue = async ({ dimension, filters }) => {
  const expr = pick({
    none: `'Total'`, product: 'p.name',
    product_category: `COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorised')`,
    storage_type: `COALESCE(p.storage_type, 'unknown')`,
  }, dimension);
  const params = [];
  const where = [`p.is_active = true`, `p.unit_cost IS NOT NULL`, `sl.quantity_on_hand > 0`];
  if (filters.programme_id) { params.push(filters.programme_id); where.push(`p.programme_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, ROUND(SUM(sl.quantity_on_hand * p.unit_cost)::numeric, 2) AS value
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${dimension === 'none' ? '1' : '2 DESC, 1'}
      ${dimension === 'product' ? 'LIMIT 25' : ''}`,
    params
  );
  return rows2series(rows);
};

// Receiving lines whose expiry falls in the next 30 days, by week or
// product. Same source and the same "recorded, not per-batch" limit
// as expiryWarning.repository.js.
const expiringStock = async ({ dimension }) => {
  const expr = pick({ week: bucketWeek('dni.expiry_date'), product: 'p.name' }, dimension);
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, COUNT(*)::numeric AS value
       FROM delivery_note_items dni
       JOIN products p ON p.id = dni.product_id
      WHERE dni.expiry_date BETWEEN ${TODAY} AND ${TODAY} + 30
      GROUP BY ${expr} ORDER BY ${dimension === 'week' ? '1' : '2 DESC, 1'}`
  );
  return rows2series(rows);
};

const adjustmentReasons = async ({ dimension, filters, dateRange }) => {
  const d = sastDate('sm.created_at');
  const expr = pick({
    reason: `COALESCE(NULLIF(LOWER(TRIM(sm.reason)), ''), 'no reason recorded')`,
    month: bucketMonth(d),
  }, dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [`${d} BETWEEN $1::date AND $2::date`, `sm.movement_type = 'adjustment'`];
  if (filters.product_id) { params.push(filters.product_id); where.push(`sm.product_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, COUNT(*)::numeric AS value
       FROM stock_movements sm
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr} ORDER BY ${dimension === 'month' ? '1' : '2 DESC, 1'}
      ${dimension === 'reason' ? 'LIMIT 15' : ''}`,
    params
  );
  return rows2series(rows);
};

// ══ Decanting ══════════════════════════════════════════════════
const decantingMarginRate = async ({ dimension, filters, dateRange }) => {
  const expr = pick({
    none: `'Total'`, week: bucketWeek('dr.week_of'), month: bucketMonth('dr.week_of'),
    product: `COALESCE(p.name, 'Unknown product')`,
  }, dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [`dr.week_of BETWEEN $1::date AND $2::date`];
  if (filters.product_id) { params.push(filters.product_id); where.push(`dl.product_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(100.0 * COUNT(*) FILTER (WHERE dl.within_margin) / NULLIF(COUNT(*), 0), 1)::numeric AS value,
            SUM(dl.total_bags)::int AS bags
       FROM decanting_lines dl
       JOIN decanting_records dr ON dr.id = dl.decanting_id
  LEFT JOIN products p ON p.id = dl.product_id
      WHERE ${where.join(' AND ')}
      ${groupBy(dimension, expr)} ORDER BY ${orderBy(dimension, 'ASC')}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { bags: r.bags } }));
};

// ══ Community, donations, volunteers (aggregate only) ═════════
const communityResponseTime = async ({ dimension, dateRange }) => {
  const d = sastDate('cr.requested_at');
  const expr = pick({ none: `'Total'`, month: bucketMonth(d), outcome: 'cr.outcome::text' }, dimension);
  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(AVG(EXTRACT(EPOCH FROM (cr.resolved_at - cr.requested_at)) / 3600.0)::numeric, 1) AS value,
            COUNT(*)::int AS requests
       FROM community_requests cr
      WHERE ${d} BETWEEN $1::date AND $2::date
        AND cr.resolved_at IS NOT NULL AND cr.resolved_at >= cr.requested_at
      ${groupBy(dimension, expr)} ORDER BY ${orderBy(dimension)}`,
    [dateRange.from, dateRange.to]
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { requests: r.requests } }));
};

const donationRouting = async ({ dimension, dateRange }) => {
  const d = sastDate('di.created_at');
  // category_flow: "recipe_food|allocated", drawn as a flow diagram
  // (donation category on the left, where the items ended up on the
  // right).
  const expr = pick({
    routing_status: 'di.routing_status', month: bucketMonth(d),
    category_flow: `COALESCE(dn.donation_category, 'uncategorised') || '|' || di.routing_status`,
  }, dimension);
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, COUNT(*)::numeric AS value
       FROM donation_items di
       JOIN donations dn ON dn.id = di.donation_id
      WHERE ${d} BETWEEN $1::date AND $2::date
      GROUP BY ${expr} ORDER BY ${dimension === 'month' ? '1' : '2 DESC, 1'}`,
    [dateRange.from, dateRange.to]
  );
  return rows2series(rows);
};

// Checked in / confirmed bookings, by event. Event names only — the
// booking's volunteer names are never selected.
const volunteerEventAttendance = async ({ dimension, dateRange }) => {
  const d = sastDate('ts.start_time');
  const expr = pick({ none: `'Total'`, month: bucketMonth(d), event: 'ev.event_name' }, dimension);
  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.checked_in) / NULLIF(COUNT(*), 0), 1)::numeric AS value,
            COUNT(*)::int AS bookings
       FROM volunteer_bookings vb
       JOIN event_timeslots ts ON ts.timeslot_id = vb.timeslot_id
       JOIN love_activism_events ev ON ev.event_id = ts.event_id
  LEFT JOIN attendance a ON a.booking_id = vb.booking_id
      WHERE ${d} BETWEEN $1::date AND $2::date
        AND vb.booking_status = 'CONFIRMED'
        AND ts.start_time < NOW()
      ${groupBy(dimension, expr)} ORDER BY ${orderBy(dimension, 'ASC')}`,
    [dateRange.from, dateRange.to]
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { bookings: r.bookings } }));
};

// ══ Stock flow (waterfall) ════════════════════════════════════
// Opening + received + donated − dispatched ± adjustments = closing.
// Anchored on today's stock_levels and walked back through the
// movements, so it holds even though the ledger did not start at
// zero: closing = on hand now − everything after the period; opening
// = on hand now − everything from the start of the period. Kilogram
// products only — kilograms and crates cannot be added.
const FLOW_STEPS = [
  ['received', 'Received'], ['donated', 'Donated'], ['dispatched', 'Dispatched'], ['adjustment', 'Adjustments'],
];
const stockFlow = async ({ filters, dateRange }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [`sl.unit = 'kg'`];
  if (filters.product_id)   { params.push(filters.product_id);   where.push(`p.id = $${params.length}`); }
  if (filters.programme_id) { params.push(filters.programme_id); where.push(`p.programme_id = $${params.length}`); }
  const d = sastDate('sm.created_at');
  const { rows: [r] } = await pool.query(
    `WITH prod AS (
       SELECT p.id, sl.quantity_on_hand FROM products p JOIN stock_levels sl ON sl.product_id = p.id
        WHERE ${where.join(' AND ')}
     ), mv AS (
       SELECT sm.movement_type, sm.quantity, ${d} AS day FROM stock_movements sm JOIN prod ON prod.id = sm.product_id
     )
     SELECT (SELECT COALESCE(SUM(quantity_on_hand), 0) FROM prod)                           AS now,
            COALESCE(SUM(quantity) FILTER (WHERE day >= $1::date), 0)                          AS since_start,
            COALESCE(SUM(quantity) FILTER (WHERE day > $2::date), 0)                           AS after_end,
            ${FLOW_STEPS.map(([t], i) => `COALESCE(SUM(quantity) FILTER (WHERE day BETWEEN $1::date AND $2::date AND movement_type = '${t}'), 0) AS s${i}`).join(', ')},
            COUNT(*) FILTER (WHERE day BETWEEN $1::date AND $2::date)                          AS moves
       FROM mv`,
    params
  );
  const now = num(r.now);
  const opening = now - num(r.since_start);
  const closing = now - num(r.after_end);
  const steps = FLOW_STEPS.map(([, label], i) => ({ label, value: num(r[`s${i}`]), meta: { kind: 'change' } }));
  // Anything the four types above do not cover still has to add up.
  const other = closing - opening - steps.reduce((s, x) => s + x.value, 0);
  if (Math.abs(other) > 0.0005) steps.push({ label: 'Other movements', value: other, meta: { kind: 'change' } });
  if (!num(r.moves) && !now) return [];
  return [
    { label: 'Opening stock', value: opening, meta: { kind: 'total' } },
    ...steps.filter((x) => x.value !== 0),
    { label: 'Closing stock', value: closing, meta: { kind: 'total' } },
  ];
};

// ══ Days of cover ═════════════════════════════════════════════
// On hand ÷ the average daily dispatch over the last 90 days. A
// product not dispatched in that window never runs out at this rate
// and is left out. Most urgent first.
const COVER_WINDOW_DAYS = 90;
const daysOfCover = async ({ filters, limit }) => {
  const params = [COVER_WINDOW_DAYS];
  const where = [`p.is_active = true`];
  if (filters.programme_id) { params.push(filters.programme_id); where.push(`p.programme_id = $${params.length}`); }
  params.push(limit ?? 10);
  const { rows } = await pool.query(
    `WITH out AS (
       SELECT sm.product_id, SUM(-sm.quantity) / $1::numeric AS per_day
         FROM stock_movements sm
        WHERE sm.movement_type = 'dispatched' AND sm.quantity < 0
          AND ${sastDate('sm.created_at')} > ${TODAY} - $1::int
        GROUP BY sm.product_id
     )
     SELECT p.name AS label, GREATEST(sl.quantity_on_hand, 0)::numeric AS on_hand, sl.unit, out.per_day,
            ROUND(GREATEST(sl.quantity_on_hand, 0) / out.per_day, 1)::numeric AS value,
            to_char(${TODAY} + FLOOR(GREATEST(sl.quantity_on_hand, 0) / out.per_day)::int, 'YYYY-MM-DD') AS run_out
       FROM out JOIN products p ON p.id = out.product_id
       JOIN stock_levels sl ON sl.product_id = p.id
      WHERE out.per_day > 0 AND ${where.join(' AND ')}
      ORDER BY value ASC, p.name LIMIT $${params.length}`,
    params
  );
  return rows.map((x) => ({
    label: x.label, value: num(x.value),
    meta: { onHand: num(x.on_hand), perDay: Number(num(x.per_day).toFixed(2)), stockUnit: x.unit, runOut: x.run_out },
  }));
};

export default {
  stockFlow, daysOfCover,
  poOnTimeRate, supplierLeadTime, overduePurchaseOrders, purchaseOrderPipeline,
  pickingTurnaround, slipPipeline, gateLoadVariance, lateCollectionRate,
  standingOrderDemand, stockValue, expiringStock, adjustmentReasons,
  decantingMarginRate, communityResponseTime, donationRouting, volunteerEventAttendance,
};

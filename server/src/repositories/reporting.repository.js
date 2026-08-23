// ─────────────────────────────────────────────────────────────
// server/src/repositories/reporting.repository.js
//
// All SQL for Reporting and Analytics. Read-only — nothing here
// writes and nothing opens a transaction.
//
// Every query is parameterised. The only values interpolated into
// SQL text are chosen by a switch on a validated dimension id, never
// taken from the request. That is what makes it safe to point a
// language model at this feature.
//
// SHARED SHAPE
// Every function returns [{ label, value }] — one row per bucket,
// ordered for display. One chart component renders all eighteen
// metrics because of this; do not add a second shape without
// updating ReportChart at the same time.
//
// TIMEZONE — READ BEFORE ADDING A QUERY
// Render runs UTC. Filtering a timestamptz against a plain date
// silently misfiles anything recorded between midnight and 02:00
// SAST. DATE columns (dispatch_date, delivery_date, week_of,
// count_date) are safe as-is. timestamptz columns (donations.
// received_at, stock_movements.created_at, community_requests.
// requested_at, volunteers.signed_in_at) MUST go through
// sastDate(). The first six metrics predate this rule because they
// only ever touched DATE columns.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import {
  COLLECTED_STATUSES, NOT_COLLECTED_STATUSES, IMPACT_BENEFICIARY_KINDS, SAST,
} from '../features/reporting/reportCatalog.js';

// Converts a timestamptz to the calendar date it fell on in Cape Town.
const sastDate = (col) => `((${col} AT TIME ZONE '${SAST}')::date)`;

// Month/week buckets over an already-converted date.
const bucketMonth = (dateExpr) => `to_char(${dateExpr}, 'YYYY-MM')`;
const bucketWeek  = (dateExpr) => `to_char(${dateExpr}, 'IYYY-"W"IW')`;

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const rows2series = (rows) => rows.map((r) => ({ label: r.label, value: num(r.value) }));

// ══ Dispatch-side dimension map ════════════════════════════════
// Closed map. An unrecognised key throws rather than defaulting: a
// silent fallback to "total" would answer a different question than
// the one asked and nobody would notice.
const slipDimension = (dimension) => {
  switch (dimension) {
    case 'none':        return { expr: `'Total'`,                               group: null };
    case 'month':       return { expr: bucketMonth('ps.dispatch_date'),         group: bucketMonth('ps.dispatch_date') };
    case 'week':        return { expr: bucketWeek('ps.dispatch_date'),          group: bucketWeek('ps.dispatch_date') };
    case 'cohort':      return { expr: `ps.cohort::text`,                       group: `ps.cohort` };
    case 'ecd_centre':  return { expr: `COALESCE(e.name, ps.beneficiary_name)`, group: `COALESCE(e.name, ps.beneficiary_name)` };
    case 'beneficiary': return { expr: `ps.beneficiary_kind::text`,             group: `ps.beneficiary_kind` };
    case 'product':     return { expr: `p.name`,                                group: `p.name` };
    case 'programme':   return { expr: `COALESCE(pr.name, 'Unassigned')`,       group: `pr.name` };
    default: throw new Error(`Unsupported dimension: ${dimension}`);
  }
};

const slipFilters = (filters, params) => {
  const clauses = [];
  if (filters.cohort)           { params.push(filters.cohort);           clauses.push(`ps.cohort = $${params.length}::cohort_group`); }
  if (filters.beneficiary_kind) { params.push(filters.beneficiary_kind); clauses.push(`ps.beneficiary_kind = $${params.length}::beneficiary_type`); }
  if (filters.ecd_id)           { params.push(filters.ecd_id);           clauses.push(`ps.ecd_id = $${params.length}`); }
  if (filters.product_id)       { params.push(filters.product_id);       clauses.push(`del.product_id = $${params.length}`); }
  if (filters.programme_id)     { params.push(filters.programme_id);     clauses.push(`p.programme_id = $${params.length}`); }
  return clauses;
};

// NFR-20, applied in SQL rather than the UI so the AI layer cannot
// route around it by requesting an unfiltered spec.
const impactClause = (params) => {
  params.push(IMPACT_BENEFICIARY_KINDS);
  return `ps.beneficiary_kind = ANY($${params.length}::beneficiary_type[])`;
};

const orderFor = (dimension) =>
  dimension === 'none' || dimension === 'month' || dimension === 'week' ? '1' : '2 DESC, 1';

// ══ Impact ═════════════════════════════════════════════════════
// SUM(DISTINCT child_count) would be a bug: two 40-child centres
// would collapse into one 40. The inner DISTINCT is on (bucket,
// centre id, count), so each centre contributes once per bucket and
// centres sharing a headcount both count.
const childrenReached = async ({ dimension, filters, dateRange }) => {
  const dim = slipDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `de.status = ANY($${params.push(COLLECTED_STATUSES)}::text[])`,
    `e.child_count IS NOT NULL`, `e.child_count > 0`,
    impactClause(params), ...slipFilters(filters, params),
  ];
  const { rows } = await pool.query(
    `SELECT bucket AS label, SUM(child_count)::numeric AS value
       FROM (SELECT DISTINCT ${dim.expr} AS bucket, e.id, e.child_count
               FROM picking_slips ps
               JOIN dispatch_events de ON de.picking_slip_id = ps.id
               JOIN ecd_centres e ON e.id = ps.ecd_id
              WHERE ${where.join(' AND ')}) t
      GROUP BY bucket ORDER BY ${dimension === 'none' ? 'bucket' : 'value DESC, bucket'}`,
    params
  );
  return rows2series(rows);
};

// loaded_quantity, not packed_quantity: the gate re-count is the one
// place a human counts the goods twice, and it reflects what left.
// unit = 'kg' only — summing kilograms and crates is meaningless,
// and the service reports how many lines were skipped.
const dispatchedKgQuery = async ({ dimension, filters, dateRange, impactOnly }) => {
  const dim = slipDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `de.status = ANY($${params.push(COLLECTED_STATUSES)}::text[])`,
    `del.unit = 'kg'`,
  ];
  if (impactOnly) where.push(impactClause(params));
  where.push(...slipFilters(filters, params));

  const { rows } = await pool.query(
    `SELECT ${dim.expr} AS label, SUM(del.loaded_quantity)::numeric AS value
       FROM picking_slips ps
       JOIN dispatch_events de ON de.picking_slip_id = ps.id
       JOIN dispatch_event_lines del ON del.dispatch_event_id = de.id
       JOIN products p ON p.id = del.product_id
  LEFT JOIN programmes pr ON pr.id = p.programme_id
  LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE ${where.join(' AND ')}
      ${dim.group ? `GROUP BY ${dim.group}` : ''}
      ORDER BY ${orderFor(dimension)}`,
    params
  );
  return rows2series(rows);
};

const dispatchVolume = (spec) => dispatchedKgQuery({ ...spec, impactOnly: false });
// Kilograms here; the service applies the meals factor so the raw
// measurement stays inspectable and a factor change needs no re-query.
const mealsEnabled   = (spec) => dispatchedKgQuery({ ...spec, impactOnly: true });

// Denominator is every slip that reached the gate. Cancelled slips
// are excluded — a cancelled pallet was never a collection anyone
// failed to make. Pending and in-progress are excluded too: not yet
// offered.
const collectionCompliance = async ({ dimension, filters, dateRange }) => {
  const dim = slipDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `ps.status IN ('complete', 'dispatched')`,
    ...slipFilters(filters, params),
  ];
  const idx = params.push(COLLECTED_STATUSES);
  const { rows } = await pool.query(
    `SELECT ${dim.expr} AS label,
            ROUND(100.0 * COUNT(*) FILTER (WHERE de.status = ANY($${idx}::text[]))
                  / NULLIF(COUNT(*), 0), 1)::numeric AS value
       FROM picking_slips ps
  LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
  LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE ${where.join(' AND ')}
      ${dim.group ? `GROUP BY ${dim.group}` : ''}
      ORDER BY ${dimension === 'none' || dimension === 'month' ? '1' : '2 ASC, 1'}`,
    params
  );
  // Ascending on ranked views: worst performers first, because those
  // are the ones anyone acts on.
  return rows2series(rows);
};

// A count of misses in the window, not a true consecutive streak. A
// streak needs a definition of "scheduled but absent", and a centre
// with no slip generated has no row to be absent from.
const repeatNonCollections = async ({ filters, dateRange, limit }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `de.status = ANY($${params.push(NOT_COLLECTED_STATUSES)}::text[])`,
    ...slipFilters(filters, params),
  ];
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT COALESCE(e.name, ps.beneficiary_name, 'Unknown') AS label,
            COUNT(*)::numeric AS value, MAX(ps.dispatch_date) AS last_missed
       FROM picking_slips ps
       JOIN dispatch_events de ON de.picking_slip_id = ps.id
  LEFT JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE ${where.join(' AND ')}
      GROUP BY 1 ORDER BY value DESC, last_missed DESC LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { lastMissed: r.last_missed } }));
};

// ══ Decanting ══════════════════════════════════════════════════
// wastage_kg and packed_kg are stored on the line, so this is a
// straight ratio. NULLIF guards a week where nothing was packed.
const decantingWastage = async ({ dimension, filters, dateRange }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [`dr.week_of BETWEEN $1::date AND $2::date`];
  if (filters.product_id) { params.push(filters.product_id); where.push(`dl.product_id = $${params.length}`); }

  const expr = {
    none:    `'Total'`,
    week:    bucketWeek('dr.week_of'),
    month:   bucketMonth('dr.week_of'),
    product: `COALESCE(p.name, 'Unknown product')`,
  }[dimension];
  if (!expr) throw new Error(`Unsupported dimension: ${dimension}`);

  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(100.0 * SUM(dl.wastage_kg) / NULLIF(SUM(dl.packed_kg), 0), 2)::numeric AS value,
            SUM(dl.wastage_kg)::numeric AS wastage_kg, SUM(dl.packed_kg)::numeric AS packed_kg
       FROM decanting_lines dl
       JOIN decanting_records dr ON dr.id = dl.decanting_id
  LEFT JOIN products p ON p.id = dl.product_id
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr} ORDER BY ${dimension === 'product' ? '2 DESC NULLS LAST, 1' : '1'}`,
    params
  );
  return rows.map((r) => ({
    label: r.label, value: num(r.value),
    meta: { wastageKg: num(r.wastage_kg), packedKg: num(r.packed_kg) },
  }));
};

const countNonKgLines = async ({ dateRange }) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM picking_slips ps
       JOIN dispatch_events de ON de.picking_slip_id = ps.id
       JOIN dispatch_event_lines del ON del.dispatch_event_id = de.id
      WHERE ps.dispatch_date BETWEEN $1::date AND $2::date
        AND de.status = ANY($3::text[]) AND del.unit <> 'kg'`,
    [dateRange.from, dateRange.to, COLLECTED_STATUSES]
  );
  return rows[0]?.n ?? 0;
};

// ══ Receiving ══════════════════════════════════════════════════
// delivery_notes.delivery_date is a DATE, so no zone conversion.
const receivingDimension = (dimension) => {
  switch (dimension) {
    case 'none':     return { expr: `'Total'`,                       group: null };
    case 'month':    return { expr: bucketMonth('dn.delivery_date'), group: bucketMonth('dn.delivery_date') };
    case 'week':     return { expr: bucketWeek('dn.delivery_date'),  group: bucketWeek('dn.delivery_date') };
    case 'supplier': return { expr: `s.name`,                        group: `s.name` };
    case 'product':  return { expr: `p.name`,                        group: `p.name` };
    default: throw new Error(`Unsupported dimension: ${dimension}`);
  }
};

const receivingFilters = (filters, params) => {
  const clauses = [];
  if (filters.supplier_id) { params.push(filters.supplier_id); clauses.push(`dn.supplier_id = $${params.length}`); }
  if (filters.product_id)  { params.push(filters.product_id);  clauses.push(`dni.product_id = $${params.length}`); }
  return clauses;
};

// received_weight_kg where recorded, falling back to quantity when
// the line is already measured in kilograms. Lines in crates or
// punnets with no weight contribute nothing rather than being summed
// into a kilogram total.
const goodsReceived = async ({ dimension, filters, dateRange }) => {
  const dim = receivingDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [
    `dn.delivery_date BETWEEN $1::date AND $2::date`,
    `(dni.received_weight_kg IS NOT NULL OR dni.unit = 'kg')`,
    ...receivingFilters(filters, params),
  ];
  const { rows } = await pool.query(
    `SELECT ${dim.expr} AS label,
            SUM(COALESCE(dni.received_weight_kg, dni.received_quantity))::numeric AS value
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN suppliers s ON s.id = dn.supplier_id
       JOIN products p ON p.id = dni.product_id
      WHERE ${where.join(' AND ')}
      ${dim.group ? `GROUP BY ${dim.group}` : ''}
      ORDER BY ${orderFor(dimension)}`,
    params
  );
  return rows2series(rows);
};

// A line is discrepant if received differs from expected in EITHER
// direction. An over-delivery is as much a reconciliation problem as
// a short one, and treating only shortfalls as errors would flatter
// a supplier who consistently over-ships.
const receivingDiscrepancyRate = async ({ dimension, filters, dateRange }) => {
  const dim = receivingDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [
    `dn.delivery_date BETWEEN $1::date AND $2::date`,
    ...receivingFilters(filters, params),
  ];
  const { rows } = await pool.query(
    `SELECT ${dim.expr} AS label,
            ROUND(100.0 * COUNT(*) FILTER (
              WHERE COALESCE(dni.discrepancy_quantity, 0) <> 0
            ) / NULLIF(COUNT(*), 0), 1)::numeric AS value,
            COUNT(*)::int AS total_lines
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN suppliers s ON s.id = dn.supplier_id
       JOIN products p ON p.id = dni.product_id
      WHERE ${where.join(' AND ')}
      ${dim.group ? `GROUP BY ${dim.group}` : ''}
      ORDER BY ${dimension === 'none' || dimension === 'month' ? '1' : '2 DESC, 1'}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { lines: r.total_lines } }));
};

const unresolvedDiscrepancies = async ({ filters, dateRange, limit }) => {
  const params = [dateRange.from, dateRange.to];
  const where = [
    `dn.delivery_date BETWEEN $1::date AND $2::date`,
    `COALESCE(dni.discrepancy_quantity, 0) <> 0`,
    `dni.discrepancy_resolved = false`,
  ];
  if (filters.supplier_id) { params.push(filters.supplier_id); where.push(`dn.supplier_id = $${params.length}`); }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT s.name AS label, COUNT(*)::numeric AS value, MAX(dn.delivery_date) AS latest
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN suppliers s ON s.id = dn.supplier_id
      WHERE ${where.join(' AND ')}
      GROUP BY s.name ORDER BY value DESC, latest DESC LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { latest: r.latest } }));
};

// Received quantity times the PO line price. The join to
// purchase_order_items is INNER on purpose: a received line with no
// linked PO has no price, and inventing one would produce a spend
// figure that looks complete and is not. The catalog caveat says so.
const procurementSpend = async ({ dimension, filters, dateRange }) => {
  const dim = receivingDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where = [
    `dn.delivery_date BETWEEN $1::date AND $2::date`,
    `poi.unit_price IS NOT NULL`,
    ...receivingFilters(filters, params),
  ];
  const { rows } = await pool.query(
    `SELECT ${dim.expr} AS label,
            ROUND(SUM(dni.received_quantity * poi.unit_price)::numeric, 2) AS value
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN purchase_order_items poi ON poi.id = dni.purchase_order_item_id
       JOIN suppliers s ON s.id = dn.supplier_id
       JOIN products p ON p.id = dni.product_id
      WHERE ${where.join(' AND ')}
      ${dim.group ? `GROUP BY ${dim.group}` : ''}
      ORDER BY ${orderFor(dimension)}`,
    params
  );
  return rows2series(rows);
};

// ══ Donations ══════════════════════════════════════════════════
// received_at is timestamptz — sastDate() is mandatory here.
// NO DONOR DIMENSION. donor_name, donor_contact and
// donor_tax_reference are deliberately unreachable from this query.
// Aggregate reporting only; see the note in reportCatalog.js.
const donationValue = async ({ dimension, filters, dateRange }) => {
  const d = sastDate('dn.received_at');
  const expr = {
    none:      `'Total'`,
    month:     bucketMonth(d),
    category:  `dn.category::text`,
    programme: `COALESCE(pr.name, 'Unassigned')`,
  }[dimension];
  if (!expr) throw new Error(`Unsupported dimension: ${dimension}`);

  const params = [dateRange.from, dateRange.to];
  const where = [`${d} BETWEEN $1::date AND $2::date`];
  if (filters.donation_category) { params.push(filters.donation_category); where.push(`dn.category = $${params.length}::donation_category`); }
  if (filters.programme_id)      { params.push(filters.programme_id);      where.push(`dn.programme_id = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT ${expr} AS label, ROUND(SUM(dn.estimated_value_zar)::numeric, 2) AS value
       FROM donations dn
  LEFT JOIN programmes pr ON pr.id = dn.programme_id
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr} ORDER BY ${dimension === 'none' || dimension === 'month' ? '1' : '2 DESC, 1'}`,
    params
  );
  return rows2series(rows);
};

const section18aPipeline = async ({ dimension, dateRange }) => {
  const d = sastDate('dn.received_at');
  const expr = dimension === 'month' ? bucketMonth(d) : `dn.section_18a_status`;
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, COUNT(*)::numeric AS value
       FROM donations dn
      WHERE ${d} BETWEEN $1::date AND $2::date
      GROUP BY ${expr} ORDER BY ${dimension === 'month' ? '1' : '2 DESC, 1'}`,
    [dateRange.from, dateRange.to]
  );
  return rows2series(rows);
};

// ══ Stock (snapshots) ══════════════════════════════════════════
// No date range at all. stock_levels holds one row per product with
// the current position, so "as at a past date" is not answerable
// without replaying stock_movements — a different, much heavier
// query that nobody has asked for.
const stockOnHand = async ({ dimension, filters, limit }) => {
  const params = [];
  const where = [`sl.quantity_on_hand > 0`, `p.is_active = true`];
  if (filters.product_id)   { params.push(filters.product_id);   where.push(`sl.product_id = $${params.length}`); }
  if (filters.programme_id) { params.push(filters.programme_id); where.push(`p.programme_id = $${params.length}`); }

  if (dimension === 'none') {
    const { rows } = await pool.query(
      `SELECT 'Products in stock' AS label, COUNT(*)::numeric AS value
         FROM stock_levels sl JOIN products p ON p.id = sl.product_id
        WHERE ${where.join(' AND ')}`,
      params
    );
    return rows2series(rows);
  }

  params.push(limit ?? 10);
  const { rows } = await pool.query(
    `SELECT p.name AS label, sl.quantity_on_hand::numeric AS value, sl.unit
       FROM stock_levels sl JOIN products p ON p.id = sl.product_id
      WHERE ${where.join(' AND ')}
      ORDER BY sl.quantity_on_hand DESC LIMIT $${params.length}`,
    params
  );
  // The unit rides along per row: stock_levels stores kilograms,
  // crates and punnets side by side, so a single axis label would be
  // a lie. ReportChart shows it against each bar.
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { unit: r.unit } }));
};

// Negative value = how far below the reorder threshold. Ordered most
// urgent first. reorder_threshold defaults to 0, so products nobody
// has set a level for never appear — correct, but worth knowing when
// the list looks shorter than expected.
const lowStockItems = async ({ filters, limit }) => {
  const params = [];
  const where = [
    `p.is_active = true`, `sl.reorder_threshold > 0`,
    `sl.quantity_on_hand <= sl.reorder_threshold`,
  ];
  if (filters.programme_id) { params.push(filters.programme_id); where.push(`p.programme_id = $${params.length}`); }
  params.push(limit ?? 10);

  const { rows } = await pool.query(
    `SELECT p.name AS label,
            (sl.quantity_on_hand - sl.reorder_threshold)::numeric AS value,
            sl.quantity_on_hand::numeric AS on_hand,
            sl.reorder_threshold::numeric AS threshold, sl.unit
       FROM stock_levels sl JOIN products p ON p.id = sl.product_id
      WHERE ${where.join(' AND ')}
      ORDER BY (sl.quantity_on_hand - sl.reorder_threshold) ASC LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({
    label: r.label, value: num(r.value),
    meta: { onHand: num(r.on_hand), threshold: num(r.threshold), unit: r.unit },
  }));
};

// created_at is timestamptz — sastDate() mandatory.
const stockMovementVolume = async ({ dimension, filters, dateRange }) => {
  const d = sastDate('sm.created_at');
  const expr = {
    movement_type: `sm.movement_type`,
    month:         bucketMonth(d),
    week:          bucketWeek(d),
    product:       `p.name`,
    programme:     `COALESCE(pr.name, 'Unassigned')`,
  }[dimension];
  if (!expr) throw new Error(`Unsupported dimension: ${dimension}`);

  const params = [dateRange.from, dateRange.to];
  const where = [`${d} BETWEEN $1::date AND $2::date`];
  if (filters.movement_type) { params.push(filters.movement_type); where.push(`sm.movement_type = $${params.length}`); }
  if (filters.product_id)    { params.push(filters.product_id);    where.push(`sm.product_id = $${params.length}`); }
  if (filters.programme_id)  { params.push(filters.programme_id);  where.push(`p.programme_id = $${params.length}`); }

  // ABS: movements are signed (a pick is negative), and this reports
  // throughput, so a busy day of picks and receipts must not net to
  // near zero.
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, SUM(ABS(sm.quantity))::numeric AS value
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
  LEFT JOIN programmes pr ON pr.id = p.programme_id
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr} ORDER BY ${dimension === 'month' || dimension === 'week' ? '1' : '2 DESC, 1'}`,
    params
  );
  return rows2series(rows);
};

// count_date is a DATE. ABS again: over- and under-counts must not
// cancel, or a product miscounted both ways would look perfect.
const stockCountVariance = async ({ dimension, filters, dateRange, limit }) => {
  const expr = dimension === 'month' ? bucketMonth('sc.count_date') : `p.name`;
  const params = [dateRange.from, dateRange.to];
  const where = [`sc.count_date BETWEEN $1::date AND $2::date`, `scl.variance IS NOT NULL`];
  if (filters.product_id) { params.push(filters.product_id); where.push(`scl.product_id = $${params.length}`); }

  const isRanked = dimension !== 'month';
  if (isRanked) params.push(limit ?? 10);

  const { rows } = await pool.query(
    `SELECT ${expr} AS label, SUM(ABS(scl.variance))::numeric AS value,
            COUNT(*) FILTER (WHERE scl.variance <> 0)::int AS lines_off
       FROM stock_count_lines scl
       JOIN stock_counts sc ON sc.id = scl.stock_count_id
       JOIN products p ON p.id = scl.product_id
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr}
      ORDER BY ${isRanked ? '2 DESC, 1' : '1'}
      ${isRanked ? `LIMIT $${params.length}` : ''}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { linesOff: r.lines_off } }));
};

// ══ Picking ════════════════════════════════════════════════════
// Denominator is lines that were actually worked (confirmed or
// flagged). Pending lines have not been touched, so counting them
// would depress the rate purely by how much work is outstanding.
const pickingFlagRate = async ({ dimension, filters, dateRange }) => {
  const expr = {
    none:    `'Total'`,
    month:   bucketMonth('ps.dispatch_date'),
    product: `p.name`,
    cohort:  `ps.cohort::text`,
  }[dimension];
  if (!expr) throw new Error(`Unsupported dimension: ${dimension}`);

  const params = [dateRange.from, dateRange.to];
  const where = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `psi.status IN ('confirmed', 'flagged')`,
  ];
  if (filters.product_id) { params.push(filters.product_id); where.push(`psi.product_id = $${params.length}`); }
  if (filters.cohort)     { params.push(filters.cohort);     where.push(`ps.cohort = $${params.length}::cohort_group`); }

  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(100.0 * COUNT(*) FILTER (WHERE psi.status = 'flagged')
                  / NULLIF(COUNT(*), 0), 1)::numeric AS value,
            COUNT(*)::int AS worked
       FROM picking_slip_items psi
       JOIN picking_slips ps ON ps.id = psi.picking_slip_id
       JOIN products p ON p.id = psi.product_id
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr} ORDER BY ${dimension === 'none' || dimension === 'month' ? '1' : '2 DESC, 1'}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { lines: r.worked } }));
};

// ══ Community requests ═════════════════════════════════════════
// requested_at is timestamptz. No caller_name or caller_contact
// reachable here — same rule as donations.
const communityRequestOutcomes = async ({ dimension, dateRange }) => {
  const d = sastDate('cr.requested_at');
  const expr = dimension === 'month' ? bucketMonth(d) : `cr.outcome::text`;
  const { rows } = await pool.query(
    `SELECT ${expr} AS label, COUNT(*)::numeric AS value
       FROM community_requests cr
      WHERE ${d} BETWEEN $1::date AND $2::date
      GROUP BY ${expr} ORDER BY ${dimension === 'month' ? '1' : '2 DESC, 1'}`,
    [dateRange.from, dateRange.to]
  );
  return rows2series(rows);
};

// ══ Volunteers ═════════════════════════════════════════════════
// Aggregate hours only. full_name is never selected, grouped by, or
// filtered on — this must not become a per-volunteer timesheet.
// Sessions with no sign-out are excluded rather than counted as
// zero: a volunteer who forgot to sign out worked an unknown number
// of hours, not none.
const volunteerHours = async ({ dimension, dateRange }) => {
  const d = sastDate('v.signed_in_at');
  const expr = {
    none:  `'Total'`,
    month: bucketMonth(d),
    week:  bucketWeek(d),
  }[dimension];
  if (!expr) throw new Error(`Unsupported dimension: ${dimension}`);

  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(SUM(EXTRACT(EPOCH FROM (v.signed_out_at - v.signed_in_at)) / 3600.0)::numeric, 1) AS value,
            COUNT(*)::int AS sessions
       FROM volunteers v
      WHERE ${d} BETWEEN $1::date AND $2::date
        AND v.signed_out_at IS NOT NULL
        AND v.signed_out_at > v.signed_in_at
      GROUP BY ${expr} ORDER BY 1`,
    [dateRange.from, dateRange.to]
  );
  return rows.map((r) => ({ label: r.label, value: num(r.value), meta: { sessions: r.sessions } }));
};

// ══ Impact factors ═════════════════════════════════════════════
// Latest factor whose effective_from has passed. Versioning by date
// means a figure quoted to a funder in June does not silently change
// when the factor is revised in August.
const getFactor = async (key) => {
  const { rows } = await pool.query(
    `SELECT value, unit, source_note FROM reporting_factors
      WHERE factor_key = $1 AND effective_from <= CURRENT_DATE
      ORDER BY effective_from DESC LIMIT 1`,
    [key]
  );
  return rows[0] ? { ...rows[0], value: Number(rows[0].value) } : null;
};

export default {
  childrenReached, mealsEnabled, dispatchVolume, collectionCompliance,
  repeatNonCollections, decantingWastage,
  goodsReceived, receivingDiscrepancyRate, unresolvedDiscrepancies, procurementSpend,
  donationValue, section18aPipeline,
  stockOnHand, lowStockItems, stockMovementVolume, stockCountVariance,
  pickingFlagRate, communityRequestOutcomes, volunteerHours,
  countNonKgLines, getFactor,
};

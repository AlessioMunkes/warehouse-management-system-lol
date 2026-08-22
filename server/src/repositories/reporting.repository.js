// ─────────────────────────────────────────────────────────────
// server/src/repositories/reporting.repository.js
//
// All SQL for Reporting and Analytics. Read-only — nothing here
// writes, and nothing here opens a transaction.
//
// Every query is parameterised. The only values ever interpolated
// into SQL text are chosen by a switch on a validated dimension id,
// never taken from the request. That is what makes it safe to point
// a language model at this feature later.
//
// SHARED SHAPE
// Every function returns [{ label, value }] — one row per bucket,
// already ordered for display. The service adds totals and meta.
// Keeping the shape uniform is what lets one chart component render
// all six metrics with no per-metric branching on the client.
//
// DATE HANDLING
// Range filters run against DATE columns (picking_slips.dispatch_date,
// decanting_records.week_of), not timestamptz, so there is no
// UTC-vs-SAST hazard in this file. Do not "improve" any of these to
// use created_at without revisiting that.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import {
  COLLECTED_STATUSES,
  NOT_COLLECTED_STATUSES,
  IMPACT_BENEFICIARY_KINDS,
} from '../features/reporting/reportCatalog.js';

// ── Dimension → SQL fragment ──────────────────────────────────
// A closed map. An unrecognised key throws rather than defaulting,
// because a silent fallback to "total" would answer a different
// question than the one asked and nobody would notice.
const slipDimension = (dimension) => {
  switch (dimension) {
    case 'none':        return { expr: `'Total'`,                                  group: null };
    case 'month':       return { expr: `to_char(ps.dispatch_date, 'YYYY-MM')`,     group: `to_char(ps.dispatch_date, 'YYYY-MM')` };
    case 'week':        return { expr: `to_char(ps.dispatch_date, 'IYYY-"W"IW')`,  group: `to_char(ps.dispatch_date, 'IYYY-"W"IW')` };
    case 'cohort':      return { expr: `ps.cohort::text`,                          group: `ps.cohort` };
    case 'ecd_centre':  return { expr: `COALESCE(e.name, ps.beneficiary_name)`,    group: `COALESCE(e.name, ps.beneficiary_name)` };
    case 'beneficiary': return { expr: `ps.beneficiary_kind::text`,                group: `ps.beneficiary_kind` };
    case 'product':     return { expr: `p.name`,                                   group: `p.name` };
    case 'programme':   return { expr: `COALESCE(pr.name, 'Unassigned')`,          group: `pr.name` };
    default: throw new Error(`Unsupported dimension: ${dimension}`);
  }
};

// ── Shared WHERE builder ──────────────────────────────────────
// Returns { clauses, params }. The caller seeds params with the
// date range, so filter placeholders continue from there.
const slipFilters = (filters, params) => {
  const clauses = [];
  if (filters.cohort) {
    params.push(filters.cohort);
    clauses.push(`ps.cohort = $${params.length}::cohort_group`);
  }
  if (filters.beneficiary_kind) {
    params.push(filters.beneficiary_kind);
    clauses.push(`ps.beneficiary_kind = $${params.length}::beneficiary_type`);
  }
  if (filters.ecd_id) {
    params.push(filters.ecd_id);
    clauses.push(`ps.ecd_id = $${params.length}`);
  }
  if (filters.product_id) {
    params.push(filters.product_id);
    clauses.push(`del.product_id = $${params.length}`);
  }
  if (filters.programme_id) {
    params.push(filters.programme_id);
    clauses.push(`p.programme_id = $${params.length}`);
  }
  return clauses;
};

// NFR-20. Applied in SQL rather than in the UI so the AI layer
// cannot route around it by requesting an unfiltered spec.
const impactClause = (params) => {
  params.push(IMPACT_BENEFICIARY_KINDS);
  return `ps.beneficiary_kind = ANY($${params.length}::beneficiary_type[])`;
};

// ── Children reached ──────────────────────────────────────────
// The distinct-centre rule is the whole point of this metric and
// the easiest thing to get wrong. SUM(DISTINCT child_count) would
// be a bug: two centres of 40 children would collapse into one 40.
// The inner SELECT DISTINCT is on (bucket, centre id, count), so
// each centre contributes once per bucket and centres sharing a
// headcount still both count.
const childrenReached = async ({ dimension, filters, dateRange }) => {
  const dim    = slipDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where  = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `de.status = ANY($${params.push(COLLECTED_STATUSES)}::text[])`,
    `e.child_count IS NOT NULL`,
    `e.child_count > 0`,
    impactClause(params),
    ...slipFilters(filters, params),
  ];

  const { rows } = await pool.query(
    `SELECT bucket AS label, SUM(child_count)::numeric AS value
       FROM (
         SELECT DISTINCT ${dim.expr} AS bucket, e.id, e.child_count
           FROM picking_slips  ps
           JOIN dispatch_events de ON de.picking_slip_id = ps.id
           JOIN ecd_centres     e  ON e.id = ps.ecd_id
          WHERE ${where.join(' AND ')}
       ) t
      GROUP BY bucket
      ORDER BY ${dimension === 'none' ? 'bucket' : 'value DESC, bucket'}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: Number(r.value) }));
};

// ── Dispatched kilograms ──────────────────────────────────────
// loaded_quantity, not packed_quantity — see the note at the top of
// dispatch.repository.js. Restricted to unit = 'kg': mixing units
// into one sum would produce a meaningless number, and the service
// reports how many lines were skipped so the omission is visible
// rather than silent.
const dispatchedKgQuery = async ({ dimension, filters, dateRange, impactOnly }) => {
  const dim    = slipDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where  = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `de.status = ANY($${params.push(COLLECTED_STATUSES)}::text[])`,
    `del.unit = 'kg'`,
  ];
  if (impactOnly) where.push(impactClause(params));
  where.push(...slipFilters(filters, params));

  const { rows } = await pool.query(
    `SELECT ${dim.expr} AS label, SUM(del.loaded_quantity)::numeric AS value
       FROM picking_slips        ps
       JOIN dispatch_events      de  ON de.picking_slip_id = ps.id
       JOIN dispatch_event_lines del ON del.dispatch_event_id = de.id
       JOIN products             p   ON p.id = del.product_id
  LEFT JOIN programmes          pr  ON pr.id = p.programme_id
  LEFT JOIN ecd_centres         e   ON e.id = ps.ecd_id
      WHERE ${where.join(' AND ')}
      ${dim.group ? `GROUP BY ${dim.group}` : ''}
      ORDER BY ${dimension === 'none' ? '1' : (dimension === 'month' || dimension === 'week' ? '1' : '2 DESC, 1')}`,
    params
  );
  return rows.map((r) => ({ label: r.label, value: Number(r.value) }));
};

const dispatchVolume = (spec) => dispatchedKgQuery({ ...spec, impactOnly: false });

// ── Meals enabled ─────────────────────────────────────────────
// Kilograms × a factor read from reporting_factors. The factor is
// applied in the service, not here, so the raw kilograms stay
// inspectable and one bad factor cannot corrupt a cached result.
const mealsEnabled = (spec) => dispatchedKgQuery({ ...spec, impactOnly: true });

// ── Collection compliance ─────────────────────────────────────
// Denominator is every slip that reached the gate: 'complete' or
// 'dispatched'. Cancelled slips are excluded — a cancelled pallet
// was never a collection anyone failed to make. Slips still pending
// or in progress are excluded too; they have not been offered yet.
const collectionCompliance = async ({ dimension, filters, dateRange }) => {
  const dim    = slipDimension(dimension);
  const params = [dateRange.from, dateRange.to];
  const where  = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `ps.status IN ('complete', 'dispatched')`,
    ...slipFilters(filters, params),
  ];
  const collectedIdx = params.push(COLLECTED_STATUSES);

  const { rows } = await pool.query(
    `SELECT ${dim.expr} AS label,
            ROUND(
              100.0 * COUNT(*) FILTER (
                WHERE de.status = ANY($${collectedIdx}::text[])
              ) / NULLIF(COUNT(*), 0)
            , 1)::numeric AS value
       FROM picking_slips   ps
  LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
  LEFT JOIN ecd_centres     e  ON e.id = ps.ecd_id
      WHERE ${where.join(' AND ')}
      ${dim.group ? `GROUP BY ${dim.group}` : ''}
      ORDER BY ${dimension === 'none' || dimension === 'month' ? '1' : '2 ASC, 1'}`,
    params
  );
  // Ascending for ranked views: the worst performers belong at the
  // top, because those are the ones anyone acts on.
  return rows.map((r) => ({ label: r.label, value: Number(r.value) }));
};

// ── Repeat non-collections ────────────────────────────────────
// Deliberately a count of misses in the window rather than a true
// consecutive streak. A streak needs a definition of "scheduled but
// absent" that the current schema cannot express — a centre with no
// slip generated has no row to be absent from. Counting actual
// not_collected events is defensible, computable, and answers the
// question a manager is really asking.
const repeatNonCollections = async ({ filters, dateRange, limit }) => {
  const params = [dateRange.from, dateRange.to];
  const where  = [
    `ps.dispatch_date BETWEEN $1::date AND $2::date`,
    `de.status = ANY($${params.push(NOT_COLLECTED_STATUSES)}::text[])`,
    ...slipFilters(filters, params),
  ];
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT COALESCE(e.name, ps.beneficiary_name, 'Unknown') AS label,
            COUNT(*)::numeric                                AS value,
            MAX(ps.dispatch_date)                            AS last_missed
       FROM picking_slips   ps
       JOIN dispatch_events de ON de.picking_slip_id = ps.id
  LEFT JOIN ecd_centres     e  ON e.id = ps.ecd_id
      WHERE ${where.join(' AND ')}
      GROUP BY COALESCE(e.name, ps.beneficiary_name, 'Unknown')
      ORDER BY value DESC, last_missed DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({
    label: r.label,
    value: Number(r.value),
    meta: { lastMissed: r.last_missed },
  }));
};

// ── Decanting wastage ─────────────────────────────────────────
// wastage_kg and packed_kg are stored on the line, so this is a
// straight ratio with no derivation. NULLIF guards a week where
// nothing was packed — without it, a zero denominator would surface
// as a division error rather than an empty bucket.
const decantingWastage = async ({ dimension, filters, dateRange }) => {
  const params = [dateRange.from, dateRange.to];
  const where  = [`dr.week_of BETWEEN $1::date AND $2::date`];
  if (filters.product_id) {
    params.push(filters.product_id);
    where.push(`dl.product_id = $${params.length}`);
  }

  const expr = {
    none:    `'Total'`,
    week:    `to_char(dr.week_of, 'IYYY-"W"IW')`,
    month:   `to_char(dr.week_of, 'YYYY-MM')`,
    product: `COALESCE(p.name, 'Unknown product')`,
  }[dimension];
  if (!expr) throw new Error(`Unsupported dimension: ${dimension}`);

  const { rows } = await pool.query(
    `SELECT ${expr} AS label,
            ROUND(100.0 * SUM(dl.wastage_kg) / NULLIF(SUM(dl.packed_kg), 0), 2)::numeric AS value,
            SUM(dl.wastage_kg)::numeric AS wastage_kg,
            SUM(dl.packed_kg)::numeric  AS packed_kg
       FROM decanting_lines   dl
       JOIN decanting_records dr ON dr.id = dl.decanting_id
  LEFT JOIN products         p  ON p.id = dl.product_id
      WHERE ${where.join(' AND ')}
      GROUP BY ${expr}
      ORDER BY ${dimension === 'product' ? '2 DESC NULLS LAST, 1' : '1'}`,
    params
  );
  return rows.map((r) => ({
    label: r.label,
    value: r.value === null ? 0 : Number(r.value),
    meta: { wastageKg: Number(r.wastage_kg), packedKg: Number(r.packed_kg) },
  }));
};

// ── Skipped non-kilogram lines ────────────────────────────────
// Reported alongside weight metrics so "we excluded 12 lines
// measured in crates" is visible on screen instead of quietly
// shrinking the total.
const countNonKgLines = async ({ dateRange }) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM picking_slips        ps
       JOIN dispatch_events      de  ON de.picking_slip_id = ps.id
       JOIN dispatch_event_lines del ON del.dispatch_event_id = de.id
      WHERE ps.dispatch_date BETWEEN $1::date AND $2::date
        AND de.status = ANY($3::text[])
        AND del.unit <> 'kg'`,
    [dateRange.from, dateRange.to, COLLECTED_STATUSES]
  );
  return rows[0]?.n ?? 0;
};

// ── Impact factors ────────────────────────────────────────────
// Latest factor whose effective_from has passed. Versioning by date
// means historical reports keep the factor that was in force at the
// time, so a figure quoted to a funder in June does not silently
// change when the factor is revised in August.
const getFactor = async (key) => {
  const { rows } = await pool.query(
    `SELECT value, unit, source_note
       FROM reporting_factors
      WHERE factor_key = $1
        AND effective_from <= CURRENT_DATE
      ORDER BY effective_from DESC
      LIMIT 1`,
    [key]
  );
  return rows[0] ? { ...rows[0], value: Number(rows[0].value) } : null;
};

export default {
  childrenReached,
  mealsEnabled,
  dispatchVolume,
  collectionCompliance,
  repeatNonCollections,
  decantingWastage,
  countNonKgLines,
  getFactor,
};

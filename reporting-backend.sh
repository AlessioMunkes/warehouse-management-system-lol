#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# reporting-backend.sh
#
# Reporting and Analytics — backend (deterministic layer only).
# No AI code in this script. The catalog, queries and endpoint come
# first so the AI layer has something correct to delegate to.
#
# Run from the repo root:
#     bash reporting-backend.sh
#
# Writes:
#   server/src/features/reporting/reportCatalog.js
#   server/src/features/reporting/specValidator.js
#   server/src/features/reporting/reportCache.js
#   server/src/repositories/reporting.repository.js
#   server/src/services/reporting.service.js
#   server/src/controllers/reporting.controller.js
#   server/src/routes/reporting.routes.js
#   server/database/migrations/001_reporting_factors.sql
#   server/__tests__/reporting.spec.test.js
#
# Patches server/index.js to register the router (idempotent).
# Does NOT run the migration — apply that yourself in Supabase.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ ! -f server/index.js ]; then
  echo "ERROR: run this from the repo root (server/index.js not found)." >&2
  exit 1
fi

mkdir -p server/src/features/reporting server/database/migrations

# ═════════════════════════════════════════════════════════════
echo "→ server/src/features/reporting/reportCatalog.js"
cat > server/src/features/reporting/reportCatalog.js <<'EOF'
// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reportCatalog.js
//
// The semantic layer. Every question this feature can answer is
// declared here, once. Nothing else may invent a metric.
//
// Three consumers read this file and cannot drift apart:
//   1. specValidator.js       — rejects anything not declared here
//   2. reporting.repository   — the pre-written parameterised SQL
//   3. (later) the AI tool schema, generated from these same entries
//
// Adding a metric is a single-file change plus one repository
// function. That matters for handover: there is no internal
// technical custodian at Ladles of Love, so the list of things the
// system reports on has to be readable by a non-developer.
//
// WHY NO TEXT-TO-SQL
// When the AI layer lands it returns { metric, dimension, filters,
// dateRange } and nothing else. It cannot name a table or a column.
// Anything undeclared fails validateSpec() and never reaches pg.
// That is also the POPIA answer — donor PII is not reachable from
// any declared metric, so it cannot leave via this feature.
// ─────────────────────────────────────────────────────────────

// ── Enum values (confirmed from pg_enum, 22 Aug 2026) ─────────
export const COHORTS = ['week1', 'week2'];

// beneficiary_type. NFR-20 limits impact reporting to ECDs and soup
// kitchens; dignity_kitchen and community are excluded. Any metric
// with impactOnly:true has this applied in SQL, not just in the UI,
// so the AI layer cannot route around it.
export const BENEFICIARY_KINDS = ['ecd', 'dignity_kitchen', 'soup_kitchen', 'community'];
export const IMPACT_BENEFICIARY_KINDS = ['ecd', 'soup_kitchen'];

// dispatch_events.status — a CHECK constraint, not an enum.
// delivery_receipts.outcome is a DIFFERENT vocabulary (collected /
// partial / not_collected) but that table is referenced nowhere in
// the server, so dispatch_events is the source of truth. If anyone
// revives delivery_receipts, this decision has to be revisited.
export const COLLECTED_STATUSES     = ['collected', 'late_collected'];
export const NOT_COLLECTED_STATUSES = ['not_collected'];

// ── Guard rails ───────────────────────────────────────────────
// Two years max. Stops a malformed range becoming a full scan on a
// free-tier instance with no read replica to absorb it.
export const MAX_RANGE_DAYS = 730;

// ~120 centres will not fit on a phone screen, and a 120-bar chart
// is not a chart.
export const MAX_RANK_LIMIT     = 25;
export const DEFAULT_RANK_LIMIT = 10;

// ── Dimensions ────────────────────────────────────────────────
export const DIMENSIONS = {
  none:        { id: 'none',        label: 'Total',            chart: 'number' },
  month:       { id: 'month',       label: 'Month',            chart: 'line'   },
  week:        { id: 'week',        label: 'Week',             chart: 'line'   },
  cohort:      { id: 'cohort',      label: 'Cohort',           chart: 'bar'    },
  ecd_centre:  { id: 'ecd_centre',  label: 'ECD centre',       chart: 'hbar'   },
  product:     { id: 'product',     label: 'Product',          chart: 'hbar'   },
  programme:   { id: 'programme',   label: 'Programme',        chart: 'bar'    },
  beneficiary: { id: 'beneficiary', label: 'Beneficiary type', chart: 'bar'    },
};

// ── Filters ───────────────────────────────────────────────────
// values present = closed set, checked against the list.
// values null   = an integer id, shape-checked and bound as $n.
export const FILTERS = {
  cohort:           { label: 'Cohort',           values: COHORTS },
  beneficiary_kind: { label: 'Beneficiary type', values: BENEFICIARY_KINDS },
  programme_id:     { label: 'Programme',        values: null },
  product_id:       { label: 'Product',          values: null },
  ecd_id:           { label: 'ECD centre',       values: null },
};

// Every one of these renders as plain SVG with no charting
// dependency, and every one has a table equivalent for ACC-01/03.
export const CHART_TYPES = ['number', 'line', 'bar', 'hbar'];

// ── Cache tiers ───────────────────────────────────────────────
// Render's free tier sleeps, so an in-process cache is cold on each
// wake and only earns its keep inside one session. The useful split
// is by mutability: a range that ended before today is closed and
// those rows will not change; a range including today must stay
// fresh enough that recording a collection and re-asking shows it.
export const CACHE_TTL = {
  HISTORIC: 60 * 60 * 1000,
  LIVE:          60 * 1000,
};

// ── The metrics ───────────────────────────────────────────────
// `description` is written in business English because it becomes
// the AI grounding text. If a manager would not recognise the
// sentence, the model will not map a question onto it.
//
// `caveat` renders under the chart. Any metric resting on an
// assumption a marker could challenge carries one.
export const METRICS = {

  children_reached: {
    id: 'children_reached',
    label: 'Children reached',
    description:
      'How many children received food. Counts each centre that actually ' +
      'collected once, using its registered child count. Because centres ' +
      'collect fortnightly, a centre collecting twice in a month is still ' +
      'counted once — a headcount, not a total of collections.',
    repoFn: 'childrenReached',
    unit: 'children',
    dimensions: ['none', 'month', 'cohort', 'ecd_centre'],
    filters: ['cohort', 'ecd_id'],
    defaultChart: 'number',
    impactOnly: true,
    // ecd_centres.child_count is NULLABLE and donation.repository.js
    // already guards it. Centres with no count are excluded rather
    // than counted as zero, so the figure means "children we can
    // account for" rather than a silent undercount.
    caveat: 'Excludes centres with no registered child count.',
  },

  meals_enabled: {
    id: 'meals_enabled',
    label: 'Meals enabled',
    description:
      'Estimated meals from the food that left the warehouse. Unlike children ' +
      'reached this counts every collection, so a centre collecting twice ' +
      'contributes twice. Converted from kilograms using a factor the manager ' +
      'can edit.',
    repoFn: 'mealsEnabled',
    unit: 'meals',
    dimensions: ['none', 'month', 'week', 'cohort', 'beneficiary'],
    filters: ['cohort', 'beneficiary_kind', 'programme_id'],
    defaultChart: 'line',
    impactOnly: true,
    // The factor lives in reporting_factors, not in code, because a
    // funder will question the number and it must be adjustable and
    // citable without a developer.
    factorKey: 'kg_to_meals',
    caveat: 'Estimate based on the kilograms-to-meals factor on record.',
  },

  dispatch_volume: {
    id: 'dispatch_volume',
    label: 'Food dispatched',
    description:
      'Kilograms that physically left the warehouse, counted at the gate from ' +
      'what staff loaded onto the vehicle — not what was packed onto the ' +
      'pallet earlier in the week.',
    repoFn: 'dispatchVolume',
    unit: 'kg',
    dimensions: ['none', 'month', 'week', 'cohort', 'product', 'programme', 'ecd_centre'],
    filters: ['cohort', 'beneficiary_kind', 'programme_id', 'product_id', 'ecd_id'],
    defaultChart: 'line',
    // loaded_quantity, not packed_quantity: the gate re-count is the
    // only place a human counts the goods twice, and it is the count
    // that reflects what actually left.
    caveat: 'Gate-loaded quantities, kilogram lines only.',
  },

  collection_compliance: {
    id: 'collection_compliance',
    label: 'Collection compliance',
    description:
      'The percentage of prepared pallets that were actually collected. Late ' +
      'collections count as collected — the food reached children, it just ' +
      'arrived after four in the afternoon.',
    repoFn: 'collectionCompliance',
    unit: '%',
    dimensions: ['none', 'month', 'cohort', 'ecd_centre'],
    filters: ['cohort', 'beneficiary_kind', 'ecd_id'],
    defaultChart: 'bar',
    caveat: 'Late collections count as collected. Cancelled slips excluded.',
  },

  repeat_non_collections: {
    id: 'repeat_non_collections',
    label: 'Repeat non-collections',
    description:
      'Which centres keep missing collections, ranked by how many they have ' +
      'missed. Use this to find centres needing a follow-up call. This is the ' +
      'report to run when asked which ECDs are a problem.',
    repoFn: 'repeatNonCollections',
    unit: 'missed collections',
    dimensions: ['ecd_centre'],
    filters: ['cohort'],
    defaultChart: 'hbar',
    ranked: true,
    caveat: 'Missed collections within the selected period.',
  },

  decanting_wastage: {
    id: 'decanting_wastage',
    label: 'Decanting wastage',
    description:
      'Food lost when bulk sacks are broken down into family bags, as a share ' +
      'of what was packed. Rising wastage on one product usually points at a ' +
      'process or supplier problem.',
    repoFn: 'decantingWastage',
    unit: '%',
    dimensions: ['none', 'week', 'month', 'product'],
    filters: ['product_id'],
    defaultChart: 'line',
    // decanting_lines carries wastage_kg and packed_kg directly, so
    // this needs no derivation and no factor.
    caveat: 'Wastage as a share of packed weight.',
  },
};

export const METRIC_IDS = Object.keys(METRICS);

export const getMetric = (id) =>
  Object.prototype.hasOwnProperty.call(METRICS, id) ? METRICS[id] : null;

// ── Plain-English restatement ─────────────────────────────────
// Rendered above every chart so the manager sees which question was
// actually answered and catches a wrong reading before acting on
// the number. This is the trust mechanism, not decoration.
export const describeSpec = (spec) => {
  const metric = getMetric(spec?.metric);
  if (!metric) return '';

  const parts = [metric.label];

  if (spec.dimension && spec.dimension !== 'none') {
    parts.push(`by ${DIMENSIONS[spec.dimension].label.toLowerCase()}`);
  }

  const applied = Object.entries(spec.filters || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${FILTERS[k]?.label?.toLowerCase() ?? k}: ${v}`);
  if (applied.length) parts.push(`(${applied.join(', ')})`);

  if (spec.dateRange?.from && spec.dateRange?.to) {
    parts.push(`${spec.dateRange.from} to ${spec.dateRange.to}`);
  }

  return parts.join(', ');
};

export default {
  METRICS, METRIC_IDS, DIMENSIONS, FILTERS, CHART_TYPES,
  COHORTS, BENEFICIARY_KINDS, IMPACT_BENEFICIARY_KINDS,
  COLLECTED_STATUSES, NOT_COLLECTED_STATUSES,
  MAX_RANGE_DAYS, MAX_RANK_LIMIT, DEFAULT_RANK_LIMIT, CACHE_TTL,
  getMetric, describeSpec,
};
EOF

# ═════════════════════════════════════════════════════════════
echo "→ server/src/features/reporting/specValidator.js"
cat > server/src/features/reporting/specValidator.js <<'EOF'
// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/specValidator.js
//
// Turns an untrusted object into a spec the repository will accept,
// or throws. Everything it allows is derived from reportCatalog.js,
// so the validator cannot fall behind the catalog.
//
// No Zod. The catalog already is the schema, and a dependency whose
// only job is to restate it would be a second source of truth to
// keep in sync — plus one more thing to explain at handover.
//
// This is the security boundary for the AI layer that comes later:
// a model that hallucinates a metric, widens a range, or is talked
// into naming a table by a prompt injection fails here, before pg
// is ever touched.
// ─────────────────────────────────────────────────────────────
import {
  METRICS, DIMENSIONS, FILTERS, CHART_TYPES,
  MAX_RANGE_DAYS, MAX_RANK_LIMIT, DEFAULT_RANK_LIMIT,
  getMetric,
} from './reportCatalog.js';

// Same fail() shape the other services use, so the controllers can
// keep reading err.status.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Date-only parsing, deliberately. Every range filter in this
// feature runs against a DATE column (picking_slips.dispatch_date,
// decanting_records.week_of), never a timestamptz, so there is no
// UTC-vs-SAST hazard here at all — unlike the gate board, which had
// to use todayString() precisely because Render runs UTC.
const parseISODate = (value, field) => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw fail(400, `${field} must be a date in YYYY-MM-DD format.`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw fail(400, `${field} is not a real date.`);
  }
  return dt;
};

const asPositiveInt = (value, field) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw fail(400, `${field} must be a positive whole number.`);
  }
  return n;
};

// ── validateSpec ──────────────────────────────────────────────
// Returns a NEW normalised object. The input is never mutated and
// never passed through — anything not explicitly copied here cannot
// reach the repository, so an attacker-supplied extra key is
// dropped rather than ignored-but-present.
export const validateSpec = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw fail(400, 'A report request is required.');
  }

  // ── metric ──
  const metric = getMetric(input.metric);
  if (!metric) {
    const names = Object.values(METRICS).map((m) => m.label).join(', ');
    throw fail(400, `Unknown report. Available reports: ${names}.`);
  }

  // ── dimension ──
  const dimension = input.dimension ?? metric.dimensions[0];
  if (!metric.dimensions.includes(dimension)) {
    const allowed = metric.dimensions
      .map((d) => DIMENSIONS[d].label.toLowerCase())
      .join(', ');
    throw fail(400, `"${metric.label}" cannot be broken down that way. Try: ${allowed}.`);
  }

  // ── date range ──
  const range = input.dateRange;
  if (!range || typeof range !== 'object') {
    throw fail(400, 'A date range is required.');
  }
  const from = parseISODate(range.from, 'Start date');
  const to   = parseISODate(range.to,   'End date');
  if (from > to) throw fail(400, 'The start date must be on or before the end date.');

  const days = Math.round((to - from) / 86_400_000);
  if (days > MAX_RANGE_DAYS) {
    throw fail(400, `Date range too wide. The maximum is ${MAX_RANGE_DAYS} days.`);
  }

  // ── filters ──
  // Only filters the metric declares. A filter that exists in the
  // catalog but not on this metric is rejected rather than silently
  // dropped, so a wrong AI spec surfaces as an error we can log
  // instead of a quietly different answer.
  const filters = {};
  for (const [key, raw] of Object.entries(input.filters || {})) {
    if (raw === null || raw === undefined || raw === '') continue;

    if (!metric.filters.includes(key)) {
      throw fail(400, `"${metric.label}" cannot be filtered by ${key}.`);
    }
    const def = FILTERS[key];
    if (!def) throw fail(400, `Unknown filter: ${key}.`);

    if (def.values) {
      if (!def.values.includes(raw)) {
        throw fail(400, `${def.label} must be one of: ${def.values.join(', ')}.`);
      }
      filters[key] = raw;
    } else {
      filters[key] = asPositiveInt(raw, def.label);
    }
  }

  // ── chart type ──
  const chartType = input.chartType ?? metric.defaultChart;
  if (!CHART_TYPES.includes(chartType)) {
    throw fail(400, `Unknown chart type: ${chartType}.`);
  }

  // ── rank limit ──
  let limit = null;
  if (metric.ranked) {
    limit = input.limit === undefined || input.limit === null
      ? DEFAULT_RANK_LIMIT
      : asPositiveInt(input.limit, 'Limit');
    if (limit > MAX_RANK_LIMIT) limit = MAX_RANK_LIMIT;
  }

  return {
    metric: metric.id,
    dimension,
    filters,
    dateRange: { from: range.from, to: range.to },
    chartType,
    limit,
  };
};

export default { validateSpec };
EOF

# ═════════════════════════════════════════════════════════════
echo "→ server/src/features/reporting/reportCache.js"
cat > server/src/features/reporting/reportCache.js <<'EOF'
// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reportCache.js
//
// In-process TTL cache. Not Redis, and deliberately not lru-cache.
//
// Render's free tier sleeps on inactivity, so ANY in-process cache
// is cold on every wake — it cannot be a cross-session latency
// strategy, only a within-session one. At that job, against six
// metrics and a handful of ranges, a Map with timestamps is the
// whole requirement, and it is one less dependency to explain to
// whoever maintains this after handover.
//
// The TTL split is by mutability, not by metric. A date range that
// ended before today is closed — the fortnightly cycle is done and
// those rows will not change — so it can be held for an hour. A
// range including today gets sixty seconds, because a manager who
// records a collection and re-asks must see it.
// ─────────────────────────────────────────────────────────────
import { CACHE_TTL } from './reportCatalog.js';

const store = new Map();

// Hard ceiling. Six metrics × dimensions × ranges will not approach
// this in practice; it exists so a scripted client cannot grow the
// map without bound on a 512 MB instance.
const MAX_ENTRIES = 200;

// Key from the NORMALISED spec, never the raw request or the user's
// question text — two differently-worded questions that resolve to
// the same spec should share a cache entry. Object.keys are sorted
// so filter ordering cannot produce two keys for one query.
export const cacheKey = (spec) => JSON.stringify({
  m: spec.metric,
  d: spec.dimension,
  f: Object.keys(spec.filters).sort().map((k) => [k, spec.filters[k]]),
  r: [spec.dateRange.from, spec.dateRange.to],
  l: spec.limit,
});

// A range is historic only once it has fully ended. `todayISO` is
// passed in rather than read here so the caller owns date
// resolution and tests can pin it.
export const ttlFor = (spec, todayISO) =>
  spec.dateRange.to < todayISO ? CACHE_TTL.HISTORIC : CACHE_TTL.LIVE;

export const get = (key) => {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  // Refresh insertion order so the eviction below drops genuinely
  // cold entries rather than merely old ones.
  store.delete(key);
  store.set(key, hit);
  return hit.value;
};

export const set = (key, value, ttlMs) => {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

// Called after any write that could change a reported number. Cheap
// and blunt on purpose: correctness beats a partial invalidation
// scheme nobody will maintain.
export const clear = () => store.clear();

export const size = () => store.size;

export default { cacheKey, ttlFor, get, set, clear, size };
EOF

# ═════════════════════════════════════════════════════════════
echo "→ server/src/repositories/reporting.repository.js"
cat > server/src/repositories/reporting.repository.js <<'EOF'
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
EOF

# ═════════════════════════════════════════════════════════════
echo "→ server/src/services/reporting.service.js"
cat > server/src/services/reporting.service.js <<'EOF'
// ─────────────────────────────────────────────────────────────
// server/src/services/reporting.service.js
//
// Validate → cache lookup → repository → shape → cache store.
//
// The AI layer, when it lands, calls runReport() with a spec it
// produced. It gets no privileged path: same validator, same cache,
// same queries. That is the design — the model chooses WHICH
// question, never HOW it is answered.
// ─────────────────────────────────────────────────────────────
import repo             from '../repositories/reporting.repository.js';
import cache            from '../features/reporting/reportCache.js';
import { validateSpec } from '../features/reporting/specValidator.js';
import {
  METRICS, DIMENSIONS, getMetric, describeSpec,
} from '../features/reporting/reportCatalog.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// SAST date string. Render runs UTC, so a naive toISOString() would
// roll the day over at 02:00 local and put "today" in the past for
// two hours every night — the same bug the gate board hit.
const todayISO = () => {
  const sast = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return sast.toISOString().slice(0, 10);
};

// ── The catalog, for the UI's dropdowns ───────────────────────
// The client builds its whole report builder from this, so a metric
// added on the server appears in the UI with no client change.
const getCatalog = () => ({
  metrics: Object.values(METRICS).map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    unit: m.unit,
    defaultChart: m.defaultChart,
    ranked: Boolean(m.ranked),
    caveat: m.caveat,
    dimensions: m.dimensions.map((d) => ({ id: d, label: DIMENSIONS[d].label })),
    filters: m.filters,
  })),
});

// ── runReport ─────────────────────────────────────────────────
const runReport = async (input) => {
  const spec   = validateSpec(input);
  const metric = getMetric(spec.metric);

  const key = cache.cacheKey(spec);
  const hit = cache.get(key);
  if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };

  const fn = repo[metric.repoFn];
  if (typeof fn !== 'function') {
    // Catalog and repository out of sync — a developer error, not a
    // user one, so it is a 500 and it says which entry is broken.
    throw fail(500, `Report "${metric.label}" is not implemented (${metric.repoFn}).`);
  }

  let series = await fn(spec);

  // Factor-based metrics convert here rather than in SQL so the raw
  // measurement stays inspectable and a factor change does not
  // require re-running the query.
  const meta = {
    unit: metric.unit,
    caveat: metric.caveat,
    cached: false,
  };

  if (metric.factorKey) {
    const factor = await repo.getFactor(metric.factorKey);
    if (!factor) {
      throw fail(
        503,
        `"${metric.label}" needs the ${metric.factorKey} factor, which has not been set up yet.`
      );
    }
    series = series.map((row) => ({ ...row, value: Math.round(row.value * factor.value) }));
    meta.factor = { key: metric.factorKey, value: factor.value, note: factor.source_note };
  }

  // Weight metrics report what they excluded, so a total shrunk by
  // unit mismatches is visible on screen rather than silently wrong.
  if (metric.unit === 'kg' || metric.factorKey) {
    const skipped = await repo.countNonKgLines(spec);
    if (skipped > 0) meta.excludedLines = skipped;
  }

  // Percentages average; everything else sums. A summed compliance
  // percentage would be nonsense, and the client should never have
  // to know which is which.
  const total = series.length === 0
    ? 0
    : metric.unit === '%'
      ? Number((series.reduce((s, r) => s + r.value, 0) / series.length).toFixed(1))
      : series.reduce((s, r) => s + r.value, 0);

  const payload = {
    spec,
    // The restatement the manager reads above the chart. Generated
    // server-side so the AI path and the dropdown path cannot
    // describe the same spec two different ways.
    description: describeSpec(spec),
    chartType: spec.chartType,
    series,
    total,
    meta,
  };

  cache.set(key, payload, cache.ttlFor(spec, todayISO()));
  return payload;
};

export default { getCatalog, runReport, todayISO };
EOF

# ═════════════════════════════════════════════════════════════
echo "→ server/src/controllers/reporting.controller.js"
cat > server/src/controllers/reporting.controller.js <<'EOF'
// ─────────────────────────────────────────────────────────────
// server/src/controllers/reporting.controller.js
//
// Thin HTTP layer. All logic lives in reporting.service.js, which
// attaches .status to everything it throws — same convention as
// dispatch.controller.js and picking.controller.js.
// ─────────────────────────────────────────────────────────────
import reportingService from '../services/reporting.service.js';

// GET /api/reporting/catalog
// The client builds its dropdowns from this, so adding a metric on
// the server surfaces in the UI with no client change.
const getCatalog = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: reportingService.getCatalog() });
  } catch (err) {
    console.error('[getCatalog]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to load the report catalog.',
    });
  }
};

// POST /api/reporting/report
// Body: { metric, dimension?, filters?, dateRange:{from,to}, chartType?, limit? }
// Returns: { spec, description, chartType, series, total, meta }
//
// POST rather than GET because the spec is a nested object, and a
// query string encoding of it would be both unreadable in logs and
// awkward to validate. Nothing here writes.
const runReport = async (req, res) => {
  try {
    const report = await reportingService.runReport(req.body);
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    console.error('[runReport]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to run the report.',
    });
  }
};

export default { getCatalog, runReport };
EOF

# ═════════════════════════════════════════════════════════════
echo "→ server/src/routes/reporting.routes.js"
cat > server/src/routes/reporting.routes.js <<'EOF'
// ─────────────────────────────────────────────────────────────
// server/src/routes/reporting.routes.js
//
// Manager and admin only. There is no worker view of reporting:
// aggregate figures across all beneficiaries are management
// information, and the task pages already give workers what they
// need for their own job.
//
// Note the role list is MANAGER/ADMIN with no FINANCE. The finance
// role was dropped — users.role only accepts warehouse_worker,
// manager and admin, so a finance user cannot exist.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import reportingController          from '../controllers/reporting.controller.js';

const router = express.Router();

const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];

router.get('/catalog', auth, requireRole(...MANAGERS_UP), reportingController.getCatalog);
router.post('/report', auth, requireRole(...MANAGERS_UP), reportingController.runReport);

export default router;
EOF

# ═════════════════════════════════════════════════════════════
echo "→ server/database/migrations/001_reporting_factors.sql"
cat > server/database/migrations/001_reporting_factors.sql <<'EOF'
-- ─────────────────────────────────────────────────────────────
-- 001_reporting_factors.sql
--
-- Conversion factors for impact reporting.
--
-- These live in a table rather than in code because a funder or a
-- board member will question the numbers, and Grizel must be able
-- to adjust them and cite a source without a developer. source_note
-- is not decoration — it is what makes a figure defensible.
--
-- effective_from versions them. Historical reports keep the factor
-- that was in force at the time, so a figure quoted in June does
-- not silently change when the factor is revised in August.
--
-- Apply in the Supabase SQL editor. The seed values below are
-- PLACEHOLDERS — replace them with figures Ladles of Love actually
-- stands behind before anything reaches a funder.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reporting_factors (
  id             SERIAL       PRIMARY KEY,
  factor_key     VARCHAR(50)  NOT NULL,
  value          NUMERIC      NOT NULL CHECK (value > 0),
  unit           VARCHAR(50)  NOT NULL,
  source_note    TEXT,
  effective_from DATE         NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (factor_key, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_reporting_factors_lookup
  ON reporting_factors (factor_key, effective_from DESC);

INSERT INTO reporting_factors (factor_key, value, unit, source_note, effective_from)
VALUES
  ('kg_to_meals', 2.5, 'meals per kg',
   'PLACEHOLDER — confirm with Ladles of Love before publishing any figure.',
   '2026-01-01')
ON CONFLICT (factor_key, effective_from) DO NOTHING;

-- Indexes supporting the reporting queries. dispatch_date is the
-- range column for four of the six metrics and is unindexed on a
-- table that grows every week.
CREATE INDEX IF NOT EXISTS idx_picking_slips_dispatch_date
  ON picking_slips (dispatch_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_slip_status
  ON dispatch_events (picking_slip_id, status);
CREATE INDEX IF NOT EXISTS idx_decanting_records_week_of
  ON decanting_records (week_of);

INSERT INTO schema_migrations (id, notes)
VALUES ('001_reporting_factors', 'Reporting and Analytics: impact factors + reporting indexes')
ON CONFLICT (id) DO NOTHING;
EOF

# ═════════════════════════════════════════════════════════════
echo "→ server/__tests__/reporting.spec.test.js"
cat > server/__tests__/reporting.spec.test.js <<'EOF'
// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.spec.test.js
//
// The validator is the security boundary for the AI layer, so it is
// tested without mocks and without a database. Every assertion here
// is a thing a hallucinating or prompt-injected model might try.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { validateSpec } from '../src/features/reporting/specValidator.js';
import {
  METRIC_IDS, MAX_RANGE_DAYS, MAX_RANK_LIMIT, describeSpec,
} from '../src/features/reporting/reportCatalog.js';

const range = { from: '2026-06-01', to: '2026-08-01' };

describe('validateSpec — accepts valid specs', () => {
  it('fills in the default dimension and chart type', () => {
    const spec = validateSpec({ metric: 'children_reached', dateRange: range });
    expect(spec.metric).toBe('children_reached');
    expect(spec.dimension).toBe('none');
    expect(spec.chartType).toBe('number');
  });

  it('defaults ranked metrics to a limit', () => {
    const spec = validateSpec({ metric: 'repeat_non_collections', dateRange: range });
    expect(spec.limit).toBe(10);
  });

  it('caps an oversized limit rather than rejecting it', () => {
    const spec = validateSpec({ metric: 'repeat_non_collections', dateRange: range, limit: 5000 });
    expect(spec.limit).toBe(MAX_RANK_LIMIT);
  });

  it('every catalog metric validates with its own defaults', () => {
    for (const id of METRIC_IDS) {
      expect(() => validateSpec({ metric: id, dateRange: range })).not.toThrow();
    }
  });
});

describe('validateSpec — rejects what the AI layer might invent', () => {
  it('rejects an unknown metric', () => {
    expect(() => validateSpec({ metric: 'total_donor_emails', dateRange: range }))
      .toThrow(/Unknown report/);
  });

  it('rejects a dimension the metric does not declare', () => {
    expect(() => validateSpec({ metric: 'decanting_wastage', dimension: 'ecd_centre', dateRange: range }))
      .toThrow(/cannot be broken down/);
  });

  it('rejects a filter the metric does not declare', () => {
    expect(() => validateSpec({ metric: 'decanting_wastage', dateRange: range, filters: { cohort: 'week1' } }))
      .toThrow(/cannot be filtered/);
  });

  it('rejects a cohort value outside the enum', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: range, filters: { cohort: 'tuesday' } }))
      .toThrow(/must be one of/);
  });

  it('rejects a reversed date range', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: { from: '2026-08-01', to: '2026-06-01' } }))
      .toThrow(/on or before/);
  });

  it('rejects a range wider than the cap', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: { from: '2000-01-01', to: '2026-01-01' } }))
      .toThrow(new RegExp(String(MAX_RANGE_DAYS)));
  });

  it('rejects a non-existent calendar date', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: { from: '2026-02-30', to: '2026-03-01' } }))
      .toThrow(/not a real date/);
  });

  it('rejects SQL in a date field', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: { from: "2026-01-01'; DROP TABLE users;--", to: '2026-02-01' } }))
      .toThrow(/YYYY-MM-DD/);
  });

  it('rejects a non-integer id filter', () => {
    expect(() => validateSpec({ metric: 'dispatch_volume', dateRange: range, filters: { ecd_id: '3 OR 1=1' } }))
      .toThrow(/whole number/);
  });

  it('drops undeclared keys instead of passing them through', () => {
    const spec = validateSpec({ metric: 'dispatch_volume', dateRange: range, rawSql: 'SELECT 1' });
    expect(spec.rawSql).toBeUndefined();
  });
});

describe('describeSpec', () => {
  it('restates a spec in plain English', () => {
    const spec = validateSpec({
      metric: 'repeat_non_collections',
      dateRange: range,
      filters: { cohort: 'week1' },
    });
    const text = describeSpec(spec);
    expect(text).toContain('Repeat non-collections');
    expect(text).toContain('week1');
    expect(text).toContain('2026-06-01');
  });
});
EOF

# ═════════════════════════════════════════════════════════════
# Register the router in server/index.js — idempotent.
# ═════════════════════════════════════════════════════════════
echo "→ patching server/index.js"
if grep -q "reporting.routes.js" server/index.js; then
  echo "   already registered, skipping"
else
  node - <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'server/index.js';
let s = readFileSync(p, 'utf8');

s = s.replace(
  "import dispatchRouter    from './src/routes/dispatch.routes.js';",
  "import dispatchRouter    from './src/routes/dispatch.routes.js';\nimport reportingRouter   from './src/routes/reporting.routes.js';"
);

s = s.replace(
  "app.use('/api/donations',  donationRouter);",
  "app.use('/api/donations',  donationRouter);\napp.use('/api/reporting',  reportingRouter);"
);

writeFileSync(p, s);
console.log('   registered /api/reporting');
NODE
fi

echo
echo "─────────────────────────────────────────────"
echo "Backend written."
echo
echo "Next:"
echo "  1. Apply server/database/migrations/001_reporting_factors.sql in Supabase"
echo "  2. cd server && npx vitest run reporting.spec"
echo "  3. npm run dev, then POST /api/reporting/report as a manager"
echo "─────────────────────────────────────────────"
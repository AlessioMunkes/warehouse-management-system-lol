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

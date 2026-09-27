// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/drillDown.js
//
// Click a bar, get the report behind it. Two kinds of drill:
//
//   a thing  (a supplier, product, centre, cohort…) → the same report
//            over time, filtered to that thing: "Bokomo's discrepancy
//            rate month by month".
//   a month  → the same report week by week inside that month.
//
// The plan is worked out here from the catalog, so the page only
// offers a drill that will run. A name is turned into an id by the
// service (lookupTable), since chart rows carry names, not ids; a
// fixed value (cohort, movement type) is used as it is.
// ─────────────────────────────────────────────────────────────

// Breakdown → the filter that narrows to one of its bars.
export const DRILL_FILTERS = {
  supplier:      { filter: 'supplier_id',       lookupTable: 'suppliers' },
  product:       { filter: 'product_id',        lookupTable: 'products' },
  ecd_centre:    { filter: 'ecd_id',            lookupTable: 'ecd_centres' },
  programme:     { filter: 'programme_id',      lookupTable: 'programmes' },
  location:      { filter: 'location_id',       lookupTable: 'storage_locations' },
  cohort:        { filter: 'cohort' },
  beneficiary:   { filter: 'beneficiary_kind' },
  movement_type: { filter: 'movement_type' },
  category:      { filter: 'donation_category' },
};

const MONTH = /^(\d{4})-(\d{2})$/;
const iso = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => (new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000;

const timeDimensionFor = (metric, dateRange) => {
  const short = dateRange && daysBetween(dateRange.from, dateRange.to) <= 62;
  if (short && metric.dimensions.includes('week')) return 'week';
  if (metric.dimensions.includes('month')) return 'month';
  if (metric.dimensions.includes('week')) return 'week';
  return null;
};

/** Can this report's bars be drilled into at all? */
export const canDrill = (metric, dimension) => {
  if (!metric || metric.temporal !== 'range') return false;
  if (dimension === 'month') return metric.dimensions.includes('week');
  const d = DRILL_FILTERS[dimension];
  return Boolean(d && metric.filters.includes(d.filter) && timeDimensionFor(metric, null));
};

/**
 * What to run for a click on `label`. Returns null when there is no
 * drill. The result's `lookup` (if any) must be resolved to an id and
 * put in filters[filter] before the spec runs.
 */
export const planDrill = (metric, spec, label) => {
  if (!canDrill(metric, spec.dimension) || typeof label !== 'string' || !label) return null;
  const base = { metric: spec.metric, filters: { ...(spec.filters ?? {}) } };

  if (spec.dimension === 'month') {
    const m = MONTH.exec(label);
    if (!m) return null;
    const first = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0));
    const from = spec.dateRange?.from && spec.dateRange.from > iso(first) ? spec.dateRange.from : iso(first);
    const to = spec.dateRange?.to && spec.dateRange.to < iso(last) ? spec.dateRange.to : iso(last);
    return { spec: { ...base, dimension: 'week', dateRange: { from, to } }, title: `${label}, week by week` };
  }

  const d = DRILL_FILTERS[spec.dimension];
  const dimension = timeDimensionFor(metric, spec.dateRange);
  const next = { ...base, dimension, dateRange: spec.dateRange };
  if (d.lookupTable) return { spec: next, filter: d.filter, lookup: { table: d.lookupTable, name: label }, title: `${label}, over time` };
  next.filters[d.filter] = label;
  return { spec: next, title: `${label}, over time` };
};

export default { DRILL_FILTERS, canDrill, planDrill };

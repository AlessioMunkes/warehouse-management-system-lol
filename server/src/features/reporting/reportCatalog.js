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

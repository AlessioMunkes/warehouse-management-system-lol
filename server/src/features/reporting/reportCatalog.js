// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reportCatalog.js
//
// The semantic layer. Every question this feature can answer is
// declared here, once. Nothing else may invent a metric.
//
// Consumers, which cannot drift apart because all derive from here:
//   specValidator.js      — rejects anything undeclared
//   reporting.repository  — the pre-written parameterised SQL
//   ai/toolSchema.js      — what the model is allowed to ask for
//
// Adding a metric is one entry plus one repository function. That
// matters for handover: the list of things the system reports on has
// to be readable by someone who is not a developer.
//
// PRIVACY IS ENFORCED HERE, NOT IN THE UI
// donations.donor_name / donor_contact / donor_tax_reference and
// volunteers.full_name are NOT reachable as a dimension or a filter
// from any metric, and must not become reachable. Donation and
// volunteer reporting is aggregate-only by design — a "donations by
// donor" breakdown would turn this feature into a donor database
// with an AI front end. If someone asks for it, that is a POPIA
// conversation, not a catalog edit.
// ─────────────────────────────────────────────────────────────

// The storage-area vocabulary is shared with the delivery service,
// which validates put-away locations against it, so it is declared
// once in constants/ and re-exported here to keep this catalog's flat
// shape for its own consumers.
import { STORAGE_AREAS }  from '../../constants/storageAreas.js';
import { MOVEMENT_TYPES } from '../../constants/movementTypes.js';

// The storage-area vocabulary is shared with the delivery service,
// which validates put-away locations against it, so it is declared
// once in constants/ and re-exported here to keep this catalog's flat
// shape for its own consumers.
import { STORAGE_AREAS } from '../../constants/storageAreas.js';

// ── Enum values (confirmed from pg_enum, 22 Aug 2026) ─────────
export const COHORTS = ['week1', 'week2'];
export const BENEFICIARY_KINDS = ['ecd', 'dignity_kitchen', 'soup_kitchen', 'community'];
// NFR-20: impact reporting covers ECDs and soup kitchens only.
export const IMPACT_BENEFICIARY_KINDS = ['ecd', 'soup_kitchen'];
export const DONATION_CATEGORIES = ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'];
export const REQUEST_OUTCOMES = ['pending', 'fulfilled', 'partially_fulfilled', 'declined', 'referred'];
export { STORAGE_AREAS };

// CHECK constraints, not enums — confirmed from the live schema.
export const COLLECTED_STATUSES     = ['collected', 'late_collected'];
export const NOT_COLLECTED_STATUSES = ['not_collected'];
export { MOVEMENT_TYPES };
export const S18A_STATUSES = [
  'not_evaluated', 'not_qualifying', 'qualifying_pending_donor', 'queued', 'issued', 'failed',
];

// ── Guard rails ───────────────────────────────────────────────
export const MAX_RANGE_DAYS     = 730;
export const MAX_RANK_LIMIT     = 25;
export const DEFAULT_RANK_LIMIT = 10;

// Timestamptz columns must be converted before comparing to a date.
// Render runs UTC; the warehouse does not.
export const SAST = 'Africa/Johannesburg';

// ── Dimensions ────────────────────────────────────────────────
export const DIMENSIONS = {
  none:           { id: 'none',           label: 'Total',             chart: 'number' },
  month:          { id: 'month',          label: 'Month',             chart: 'line'   },
  week:           { id: 'week',           label: 'Week',              chart: 'line'   },
  cohort:         { id: 'cohort',         label: 'Cohort',            chart: 'bar'    },
  ecd_centre:     { id: 'ecd_centre',     label: 'ECD centre',        chart: 'hbar'   },
  product:        { id: 'product',        label: 'Product',           chart: 'hbar'   },
  programme:      { id: 'programme',      label: 'Programme',         chart: 'bar'    },
  beneficiary:    { id: 'beneficiary',    label: 'Beneficiary type',  chart: 'bar'    },
  supplier:       { id: 'supplier',       label: 'Supplier',          chart: 'hbar'   },
  location:       { id: 'location',       label: 'Storage location',  chart: 'hbar'   },
  movement_type:  { id: 'movement_type',  label: 'Movement type',     chart: 'bar'    },
  category:       { id: 'category',       label: 'Category',          chart: 'bar'    },
  outcome:        { id: 'outcome',        label: 'Outcome',           chart: 'bar'    },
  s18a_status:    { id: 's18a_status',    label: 'Certificate status',chart: 'bar'    },
};

// ── Filters ───────────────────────────────────────────────────
// values present = closed set. values null = integer id, bound as $n.
export const FILTERS = {
  cohort:            { label: 'Cohort',           values: COHORTS },
  beneficiary_kind:  { label: 'Beneficiary type', values: BENEFICIARY_KINDS },
  movement_type:     { label: 'Movement type',    values: MOVEMENT_TYPES },
  donation_category: { label: 'Donation category',values: DONATION_CATEGORIES },
  storage_area:      { label: 'Storage area',     values: STORAGE_AREAS },
  programme_id:      { label: 'Programme',        values: null },
  product_id:        { label: 'Product',          values: null },
  ecd_id:            { label: 'ECD centre',       values: null },
  supplier_id:       { label: 'Supplier',         values: null },
  location_id:       { label: 'Storage location', values: null },
};

export const CHART_TYPES = ['number', 'line', 'bar', 'hbar'];

// ── Cache tiers ───────────────────────────────────────────────
// Render's free tier sleeps, so an in-process cache is cold on each
// wake and only earns its keep inside one session. Split by
// mutability: a range that ended before today is closed and cannot
// change; anything touching today, and every snapshot, stays short.
export const CACHE_TTL = {
  HISTORIC: 60 * 60 * 1000,
  LIVE:          60 * 1000,
  SNAPSHOT:      30 * 1000,
};

// ── The metrics ───────────────────────────────────────────────
// `description` becomes the AI grounding text, so it is written in
// business English. If a manager would not recognise the sentence,
// the model will not map a question onto it.
//
// `temporal`: 'range' needs two dates; 'snapshot' is right now and
// ignores them entirely.
export const METRICS = {

  // ══ Impact ═════════════════════════════════════════════════
  children_reached: {
    id: 'children_reached', label: 'Children reached', temporal: 'range',
    description:
      'How many children received food. Counts each centre that actually collected ' +
      'once, using its registered child count. Because centres collect fortnightly, ' +
      'a centre collecting twice in a month is still counted once — a headcount, ' +
      'not a total of collections.',
    repoFn: 'childrenReached', unit: 'children',
    dimensions: ['none', 'month', 'cohort', 'ecd_centre'],
    filters: ['cohort', 'ecd_id'],
    defaultChart: 'number', impactOnly: true,
    // child_count is NULLABLE. Centres with no count are excluded
    // rather than counted as zero, so the figure means "children we
    // can account for" rather than a silent undercount.
    caveat: 'Excludes centres with no registered child count.',
  },

  meals_enabled: {
    id: 'meals_enabled', label: 'Meals enabled', temporal: 'range',
    description:
      'Estimated meals from food that left the warehouse. Unlike children reached ' +
      'this counts every collection, so a centre collecting twice contributes ' +
      'twice. Converted from kilograms using a factor the manager can edit.',
    repoFn: 'mealsEnabled', unit: 'meals',
    dimensions: ['none', 'month', 'week', 'cohort', 'beneficiary'],
    filters: ['cohort', 'beneficiary_kind', 'programme_id'],
    defaultChart: 'line', impactOnly: true, factorKey: 'kg_to_meals',
    caveat: 'Estimate based on the kilograms-to-meals factor on record.',
  },

  // ══ Dispatch ═══════════════════════════════════════════════
  dispatch_volume: {
    id: 'dispatch_volume', label: 'Food dispatched', temporal: 'range',
    description:
      'Kilograms that physically left the warehouse, counted at the gate from what ' +
      'staff loaded onto the vehicle — not what was packed onto the pallet earlier ' +
      'in the week.',
    repoFn: 'dispatchVolume', unit: 'kg',
    dimensions: ['none', 'month', 'week', 'cohort', 'product', 'programme', 'ecd_centre', 'beneficiary'],
    filters: ['cohort', 'beneficiary_kind', 'programme_id', 'product_id', 'ecd_id'],
    defaultChart: 'line',
    caveat: 'Gate-loaded quantities, kilogram lines only.',
  },

  collection_compliance: {
    id: 'collection_compliance', label: 'Collection compliance', temporal: 'range',
    description:
      'The percentage of prepared pallets that were actually collected. Late ' +
      'collections count as collected — the food reached children, it just arrived ' +
      'after four in the afternoon.',
    repoFn: 'collectionCompliance', unit: '%',
    dimensions: ['none', 'month', 'cohort', 'ecd_centre'],
    filters: ['cohort', 'beneficiary_kind', 'ecd_id'],
    defaultChart: 'bar',
    caveat: 'Late collections count as collected. Cancelled slips excluded.',
  },

  repeat_non_collections: {
    id: 'repeat_non_collections', label: 'Repeat non-collections', temporal: 'range',
    description:
      'Which centres keep missing collections, ranked by how many they have missed. ' +
      'Use this to find centres needing a follow-up call. This is the report to run ' +
      'when asked which ECDs are a problem.',
    repoFn: 'repeatNonCollections', unit: 'missed collections',
    dimensions: ['ecd_centre'], filters: ['cohort'],
    defaultChart: 'hbar', ranked: true,
    caveat: 'Missed collections within the selected period.',
  },

  // ══ Decanting ══════════════════════════════════════════════
  decanting_wastage: {
    id: 'decanting_wastage', label: 'Decanting wastage', temporal: 'range',
    description:
      'Food lost when bulk sacks are broken down into family bags, as a share of ' +
      'what was packed. Rising wastage on one product usually points at a process ' +
      'or supplier problem.',
    repoFn: 'decantingWastage', unit: '%',
    dimensions: ['none', 'week', 'month', 'product'], filters: ['product_id'],
    defaultChart: 'line',
    caveat: 'Wastage as a share of packed weight.',
  },

  // ══ Receiving ══════════════════════════════════════════════
  goods_received: {
    id: 'goods_received', label: 'Goods received', temporal: 'range',
    description:
      'How much stock came in from suppliers, by weight. Counted from what was ' +
      'actually received and signed for at the door, not what the purchase order ' +
      'said was coming.',
    repoFn: 'goodsReceived', unit: 'kg',
    dimensions: ['none', 'month', 'week', 'supplier', 'product'],
    filters: ['supplier_id', 'product_id'],
    defaultChart: 'line',
    caveat: 'Received weights where recorded in kilograms.',
  },

  receiving_discrepancy_rate: {
    id: 'receiving_discrepancy_rate', label: 'Delivery discrepancy rate', temporal: 'range',
    description:
      'How often what a supplier delivered did not match what was ordered, as a ' +
      'percentage of their delivery lines. This is the supplier reliability report — ' +
      'run it when asked which suppliers are a problem or who short-delivers.',
    repoFn: 'receivingDiscrepancyRate', unit: '%',
    // supplier first: this is the supplier-reliability report, and a
    // single overall discrepancy rate is not something anyone acts on.
    dimensions: ['supplier', 'none', 'month', 'product'],
    filters: ['supplier_id', 'product_id'],
    defaultChart: 'hbar',
    caveat: 'A line counts as discrepant if received differs from expected in either direction.',
  },

  unresolved_discrepancies: {
    id: 'unresolved_discrepancies', label: 'Unresolved discrepancies', temporal: 'range',
    description:
      'Delivery lines where the quantity did not match and nobody has closed it off ' +
      'yet, ranked by supplier. This is a to-do list, not a trend.',
    repoFn: 'unresolvedDiscrepancies', unit: 'open lines',
    dimensions: ['supplier'], filters: ['supplier_id'],
    defaultChart: 'hbar', ranked: true,
    caveat: 'Lines with a quantity discrepancy still marked unresolved.',
  },

  procurement_spend: {
    id: 'procurement_spend', label: 'Procurement spend', temporal: 'range',
    description:
      'What was spent on bought-in stock, in rands. Calculated from the quantity ' +
      'actually received multiplied by the price on the purchase order line.',
    repoFn: 'procurementSpend', unit: 'ZAR',
    dimensions: ['none', 'month', 'supplier', 'product'],
    filters: ['supplier_id', 'product_id'],
    defaultChart: 'line',
    // Lines received without a linked PO item have no price, so they
    // contribute nothing. Stated rather than hidden — an incomplete
    // spend figure presented as complete is worse than no figure.
    caveat: 'Excludes received lines with no purchase order price on record.',
  },

  // ══ Donations ══════════════════════════════════════════════
  donation_value: {
    id: 'donation_value', label: 'Donation value received', temporal: 'range',
    description:
      'The estimated rand value of donations received. Aggregate only — this report ' +
      'cannot be broken down by donor.',
    repoFn: 'donationValue', unit: 'ZAR',
    dimensions: ['none', 'month', 'category', 'programme'],
    filters: ['donation_category', 'programme_id'],
    defaultChart: 'line',
    caveat: 'Values are as estimated at intake.',
  },

  section18a_pipeline: {
    id: 'section18a_pipeline', label: 'Section 18A certificates', temporal: 'range',
    description:
      'Where donations sit in the Section 18A tax certificate process — how many are ' +
      'issued, queued, waiting on donor details, or failed. This is the compliance ' +
      'view. Aggregate only, no donor names.',
    repoFn: 'section18aPipeline', unit: 'donations',
    dimensions: ['s18a_status', 'month'], filters: [],
    defaultChart: 'bar',
    caveat: 'Counts donations by certificate status, not certificate value.',
  },

  // ══ Stock ══════════════════════════════════════════════════
  stock_on_hand: {
    id: 'stock_on_hand', label: 'Stock on hand', temporal: 'snapshot',
    description:
      'What is in the warehouse right now. This is a live figure — it has no date ' +
      'range and ignores any period asked for.',
    repoFn: 'stockOnHand', unit: 'units',
    dimensions: ['product', 'none'], filters: ['product_id', 'programme_id'],
    defaultChart: 'hbar', ranked: true,
    // stock_levels stores a unit per product and they are not all
    // kilograms, so summing across products would be meaningless.
    // Breaking down by product is the honest default.
    caveat: 'Quantities are in each product\u2019s own unit and are not comparable across products.',
  },

  low_stock_items: {
    id: 'low_stock_items', label: 'Items at or below reorder level', temporal: 'snapshot',
    description:
      'Products that have hit their reorder threshold and need ordering. A live ' +
      'figure with no date range. Run this when asked what is running low or what ' +
      'needs reordering.',
    repoFn: 'lowStockItems', unit: 'units below threshold',
    dimensions: ['product'], filters: ['programme_id'],
    defaultChart: 'hbar', ranked: true, threshold: 0,
    caveat: 'Shows how far below the reorder threshold each product is.',
  },

  stock_movement_volume: {
    id: 'stock_movement_volume', label: 'Stock movements', temporal: 'range',
    description:
      'How much stock moved and why — received, picked, dispatched, decanted, ' +
      'donated, written off as wastage, or manually adjusted. Use this to see ' +
      'warehouse throughput or to check how much was adjusted by hand.',
    repoFn: 'stockMovementVolume', unit: 'units',
    dimensions: ['movement_type', 'month', 'week', 'product', 'programme'],
    filters: ['movement_type', 'product_id', 'programme_id'],
    defaultChart: 'bar',
    caveat: 'Mixed units across products; compare within a product rather than across.',
  },

  stock_count_variance: {
    id: 'stock_count_variance', label: 'Stock count variance', temporal: 'range',
    description:
      'The gap between what the system said was in the warehouse and what was ' +
      'physically counted. Persistent variance on one product means stock is going ' +
      'missing or being recorded wrongly.',
    repoFn: 'stockCountVariance', unit: 'units',
    dimensions: ['product', 'month'], filters: ['product_id'],
    defaultChart: 'hbar', ranked: true,
    caveat: 'Absolute variance, so over- and under-counts do not cancel out.',
  },

  // ══ Picking ════════════════════════════════════════════════
  picking_flag_rate: {
    id: 'picking_flag_rate', label: 'Picking flag rate', temporal: 'range',
    description:
      'How often packers flagged a line instead of confirming it, usually because ' +
      'stock was short or the product was wrong. A high rate on one product points ' +
      'at a supply problem upstream.',
    repoFn: 'pickingFlagRate', unit: '%',
    // product first: a flag rate is only useful once you know which
    // product is causing it.
    dimensions: ['product', 'none', 'month', 'cohort'],
    filters: ['product_id', 'cohort'],
    defaultChart: 'hbar',
    caveat: 'Flagged lines as a share of all lines that were worked.',
  },

  // ══ Community requests ═════════════════════════════════════
  community_request_outcomes: {
    id: 'community_request_outcomes', label: 'Community requests', temporal: 'range',
    description:
      'Walk-in and phone-in requests for food from the public, and what happened to ' +
      'them — pending, fulfilled, partially fulfilled, or declined (BR-28). ' +
      'Aggregate only, no caller details.',
    repoFn: 'communityRequestOutcomes', unit: 'requests',
    dimensions: ['outcome', 'month'], filters: [],
    defaultChart: 'bar',
    caveat: 'Counts requests logged in the period.',
  },

  // ══ Volunteers ═════════════════════════════════════════════
  volunteer_hours: {
    id: 'volunteer_hours', label: 'Volunteer hours', temporal: 'range',
    description:
      'Hours contributed by volunteers on site. Aggregate only — this report cannot ' +
      'be broken down by individual volunteer.',
    repoFn: 'volunteerHours', unit: 'hours',
    dimensions: ['month', 'week', 'none'], filters: [],
    defaultChart: 'line',
    // Sessions with no sign-out have no duration. Counting them as
    // zero would understate; excluding them and saying so is honest.
    caveat: 'Excludes sessions where the volunteer never signed out.',
  },
};

export const METRIC_IDS = Object.keys(METRICS);

export const getMetric = (id) =>
  Object.prototype.hasOwnProperty.call(METRICS, id) ? METRICS[id] : null;

export const isSnapshot = (metric) => metric?.temporal === 'snapshot';

// ── Plain-English restatement ─────────────────────────────────
// Rendered above every chart so the manager sees which question was
// actually answered. The trust mechanism, not decoration.
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

  if (isSnapshot(metric)) parts.push('as it stands now');
  else if (spec.dateRange?.from) parts.push(`${spec.dateRange.from} to ${spec.dateRange.to}`);

  return parts.join(', ');
};

export default {
  METRICS, METRIC_IDS, DIMENSIONS, FILTERS, CHART_TYPES,
  COHORTS, BENEFICIARY_KINDS, IMPACT_BENEFICIARY_KINDS,
  DONATION_CATEGORIES, REQUEST_OUTCOMES, STORAGE_AREAS,
  MOVEMENT_TYPES, S18A_STATUSES,
  COLLECTED_STATUSES, NOT_COLLECTED_STATUSES,
  MAX_RANGE_DAYS, MAX_RANK_LIMIT, DEFAULT_RANK_LIMIT, CACHE_TTL, SAST,
  getMetric, isSnapshot, describeSpec,
};

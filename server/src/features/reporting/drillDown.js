// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/drillDown.js
//
// Drill-down: click a bar, see what is behind it.
//
// A click offers every way the catalog can open that bar up, and each
// one is an ordinary report spec that goes through validateSpec and the
// same queries as any other. Nothing here runs SQL.
//
//   a month            → that month week by week or day by day, or by any category
//                        the report breaks down by, inside that month
//   a week             → day by day, or by any category, inside that week
//   a day              → by any category, on that day
//   a supplier, product, centre, programme, cohort…
//                      → that one item over time, or split by any other
//                        category the report has (a supplier's products,
//                        a centre's products, a product's suppliers)
//   a product on a live report (stock on hand, low stock, days of
//   cover, stock value, expiring stock)
//                      → that product's stock movements; a live figure
//                        has no "over time" of its own, so the drill
//                        crosses to the report that does
//
// The drilled report carries the same options again, so a manager can
// keep going: supplier → its products → one product by month → by week.
//
// A category can only be opened where the report can FILTER by it
// (the catalog's `filters`). Statuses and product groupings filter by
// their own text; a free-text reason does not drill.
//
// The last level is not a chart at all: the records behind the figure
// (features/reporting/records.js), offered on every report.
// ─────────────────────────────────────────────────────────────
import { DIMENSIONS } from './reportCatalog.js';

// The filter that narrows a report to one bar of this dimension.
// `lookupTable` means the filter takes an id, resolved from the bar's name.
export const DRILL_FILTERS = {
  supplier:      { filter: 'supplier_id',       lookupTable: 'suppliers' },
  product:       { filter: 'product_id',        lookupTable: 'products' },
  ecd_centre:    { filter: 'ecd_id',            lookupTable: 'ecd_centres' },
  programme:     { filter: 'programme_id',      lookupTable: 'programmes' },
  location:      { filter: 'location_id',       lookupTable: 'storage_locations' },
  // One member of staff, found by the full name the bar shows.
  staff:         { filter: 'staff_id',          lookupTable: 'users' },
  cohort:        { filter: 'cohort' },
  beneficiary:   { filter: 'beneficiary_kind' },
  movement_type: { filter: 'movement_type' },
  category:      { filter: 'donation_category' },
  // Statuses and product groupings: the bar's own text is the filter.
  po_status:        { filter: 'po_status' },
  slip_status:      { filter: 'slip_status' },
  outcome:          { filter: 'outcome' },
  s18a_status:      { filter: 's18a_status' },
  routing_status:   { filter: 'routing_status' },
  product_category: { filter: 'product_category' },
  storage_type:     { filter: 'storage_type' },
};

// A live report's bar, opened in a report that has history.
// `days` is how far back the target looks.
const ACROSS = {
  'stock_on_hand:product':          { metric: 'stock_movement_volume', dimension: 'movement_type', filter: 'product_id', lookupTable: 'products', days: 90, label: 'Movements, last 90 days' },
  'low_stock_items:product':        { metric: 'stock_movement_volume', dimension: 'movement_type', filter: 'product_id', lookupTable: 'products', days: 90, label: 'Movements, last 90 days' },
  'days_of_cover:product':          { metric: 'stock_movement_volume', dimension: 'week',          filter: 'product_id', lookupTable: 'products', days: 90, label: 'Movements week by week' },
  'stock_value:product':            { metric: 'stock_movement_volume', dimension: 'movement_type', filter: 'product_id', lookupTable: 'products', days: 90, label: 'Movements, last 90 days' },
  'expiring_stock:product':         { metric: 'stock_movement_volume', dimension: 'movement_type', filter: 'product_id', lookupTable: 'products', days: 90, label: 'Movements, last 90 days' },
  'standing_order_demand:product':  { metric: 'dispatch_volume',       dimension: 'month',         filter: 'product_id', lookupTable: 'products', days: 180, label: 'Dispatched, last 6 months' },
  'standing_order_demand:ecd_centre': { metric: 'dispatch_volume',     dimension: 'product',       filter: 'ecd_id',     lookupTable: 'ecd_centres', days: 180, label: 'What it collected, last 6 months' },
  'repeat_non_collections:ecd_centre': { metric: 'collection_compliance', dimension: 'month', filter: 'ecd_id', lookupTable: 'ecd_centres', days: 180, label: 'Its collections, last 6 months' },
  'unresolved_discrepancies:supplier': { metric: 'receiving_discrepancy_rate', dimension: 'product', filter: 'supplier_id', lookupTable: 'suppliers', days: 180, label: 'Its discrepancies by product, last 6 months' },
  'overdue_purchase_orders:supplier': { metric: 'purchase_order_pipeline', dimension: 'po_status', filter: 'supplier_id', lookupTable: 'suppliers', days: 180, label: 'Its orders by status, last 6 months' },
};

const MONTH = /^(\d{4})-(\d{2})$/;
const WEEK = /^(\d{4})-W(\d{2})$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = new Set(['month', 'week', 'day']);
const iso = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => (new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000;

// Breakdowns a drill can land on: one plain category. Not a total, not
// a two-way grid, not a diagram.
const isCategory = (d) => !TIME.has(d) && d !== 'none' && d !== 'weekday'
  && !/^(month_|week_|hour_|group_month|flow$|category_flow$)/.test(d);

const timeDimensionFor = (metric, dateRange) => {
  const span = dateRange ? daysBetween(dateRange.from, dateRange.to) : null;
  // A fortnight or less reads best day by day.
  if (span !== null && span <= 14 && metric.dimensions.includes('day')) return 'day';
  const short = span !== null && span <= 62;
  if (short && metric.dimensions.includes('week')) return 'week';
  if (metric.dimensions.includes('month')) return 'month';
  if (metric.dimensions.includes('week')) return 'week';
  return null;
};

// Monday to Sunday of an ISO week ("2026-W41").
const weekRange = (year, week) => {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (week - 1) * 7 * 86400000);
  return { from: iso(monday), to: iso(new Date(monday.getTime() + 6 * 86400000)) };
};

// The dates a time bar covers, kept inside the report's own range.
const bucketRange = (dimension, label, dateRange) => {
  let range = null;
  const m = MONTH.exec(label);
  const w = WEEK.exec(label);
  if (dimension === 'month' && m) {
    range = { from: iso(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))), to: iso(new Date(Date.UTC(Number(m[1]), Number(m[2]), 0))) };
  } else if (dimension === 'week' && w) {
    range = weekRange(Number(w[1]), Number(w[2]));
  } else if (dimension === 'day' && DAY.test(label)) {
    range = { from: label, to: label };
  }
  if (!range) return null;
  return {
    from: dateRange?.from && dateRange.from > range.from ? dateRange.from : range.from,
    to: dateRange?.to && dateRange.to < range.to ? dateRange.to : range.to,
  };
};

const by = (d) => `By ${(DIMENSIONS[d]?.label ?? d).toLowerCase()}`;

/**
 * Every way this report's bars can be opened: [{ id, label }], in the
 * order offered. The first is what a plain click does. Empty when the
 * report does not drill.
 */
export const drillOptions = (metric, spec) => {
  if (!metric) return [];
  const dimension = spec?.dimension;
  const out = [];
  const others = metric.dimensions.filter((d) => d !== dimension && isCategory(d));

  if (metric.temporal === 'range' && TIME.has(dimension)) {
    if (dimension === 'month' && metric.dimensions.includes('week')) out.push({ id: 'week', label: 'Week by week' });
    if (dimension !== 'day' && metric.dimensions.includes('day')) out.push({ id: 'day', label: 'Day by day' });
    for (const d of others) out.push({ id: d, label: by(d) });
  }

  const narrow = DRILL_FILTERS[dimension];
  if (narrow && metric.filters.includes(narrow.filter)) {
    if (metric.temporal === 'range') {
      const time = timeDimensionFor(metric, spec?.dateRange ?? null);
      if (time) out.push({ id: time, label: 'Over time' });
    }
    for (const d of others) out.push({ id: d, label: by(d) });
  }

  const across = ACROSS[`${metric.id}:${dimension}`];
  if (across) out.push({ id: `across:${across.metric}`, label: across.label });

  return out;
};

/** Can this report's bars be drilled into at all? */
export const canDrill = (metric, dimension) => drillOptions(metric, { dimension }).length > 0;

/**
 * What to run for a click on `label`, opened the `target` way (an id
 * from drillOptions; the first when omitted). Returns null when there
 * is no such drill. The result's `lookup` (if any) must be resolved to
 * an id and put in spec.filters[filter] before the spec runs.
 */
export const planDrill = (metric, spec, label, target = null, todayISO = null) => {
  if (typeof label !== 'string' || !label) return null;
  const options = drillOptions(metric, spec);
  const option = target ? options.find((o) => o.id === target) : options[0];
  if (!option) return null;
  const filters = { ...(spec.filters ?? {}) };

  // A live report's bar, opened in a report with history.
  if (option.id.startsWith('across:')) {
    const a = ACROSS[`${metric.id}:${spec.dimension}`];
    const to = todayISO ?? iso(new Date());
    const from = iso(new Date(new Date(`${to}T00:00:00Z`).getTime() - a.days * 86400000));
    return {
      spec: { metric: a.metric, dimension: a.dimension, filters: {}, dateRange: { from, to } },
      filter: a.filter, lookup: { table: a.lookupTable, name: label }, title: `${label}: ${a.label.toLowerCase()}`,
    };
  }

  const base = { metric: spec.metric, filters };

  // A month or a week, opened up.
  if (TIME.has(spec.dimension)) {
    const dateRange = bucketRange(spec.dimension, label, spec.dateRange);
    if (!dateRange) return null;
    return {
      spec: { ...base, dimension: option.id, dateRange },
      title: `${label}, ${option.label.toLowerCase()}`,
    };
  }

  // One supplier, product, centre… over time, or split another way.
  const d = DRILL_FILTERS[spec.dimension];
  const next = { ...base, dimension: option.id, dateRange: spec.dateRange };
  const title = TIME.has(option.id) ? `${label}, over time` : `${label}, ${option.label.toLowerCase()}`;
  if (d.lookupTable) return { spec: next, filter: d.filter, lookup: { table: d.lookupTable, name: label }, title };
  next.filters[d.filter] = label;
  return { spec: next, title };
};

export default { DRILL_FILTERS, canDrill, drillOptions, planDrill };

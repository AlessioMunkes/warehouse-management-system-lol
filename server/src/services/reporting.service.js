// ─────────────────────────────────────────────────────────────
// server/src/services/reporting.service.js
//
// Validate → cache lookup → repository → shape → cache store.
//
// reportingAi.service.js calls runReport() with a spec the model
// produced. It gets no privileged path: same validator, same cache,
// same queries. The model chooses WHICH question, never HOW it is
// answered.
// ─────────────────────────────────────────────────────────────
import repo             from '../repositories/reporting.repository.js';
import factorRepo       from '../repositories/reportingFactor.repository.js';
import cache            from '../features/reporting/reportCache.js';
import { validateSpec } from '../features/reporting/specValidator.js';
import aiProvider       from '../features/reporting/provider.js';
import adhocRepo        from '../repositories/reportingAdhoc.repository.js';
import { validateCustom, runCustom, describeDatasets } from '../features/reporting/customQuery.js';
import { drillOptions, planDrill } from '../features/reporting/drillDown.js';
import recordsRepo from '../repositories/reportingRecords.repository.js';
import processRepo from '../repositories/reportingProcess.repository.js';
import { buildProcess } from '../features/reporting/processMining.js';
import { buildFlow } from '../features/reporting/processFlow.js';
import { buildReorderPlan, HORIZONS } from '../features/reporting/reorderPlan.js';
import stockCoverRepo from '../repositories/stockCover.repository.js';
import { assess, alignWeeks, completeWeeks, rankAlerts } from '../features/reporting/controlLimits.js';
import { OPERATIONAL_INSIGHTS } from '../features/reporting/operationalInsights.js';
import {
  METRICS, DIMENSIONS, FILTERS, CACHE_TTL, getMetric, isSnapshot, describeSpec, COHORTS, BENEFICIARY_KINDS,
} from '../features/reporting/reportCatalog.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// Render runs UTC. A naive toISOString() would roll the day over at
// 02:00 local and put "today" in the past for two hours every night
// — the bug the gate board already hit once.
const todayISO = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);

// The client builds its whole report builder from this, so a metric
// added on the server appears in the UI with no client change.
//
// aiEnabled drives whether the ask box renders. When the key lapses
// after handover the input disappears and the dropdowns carry on —
// the feature degrades rather than breaking.
// A description is read by the AI that picks reports and by the people
// on the page. "Run this when asked ..." is for the AI alone: it is
// left out of what the page shows.
const forReaders = (text) => String(text ?? '')
  .replace(/\s*Run this (?:when|for)\b.*?(?:\.["”]?(?=\s|$)|$)/g, '')
  .trim();

const getCatalog = () => ({
  aiEnabled: aiProvider.isEnabled(),
  metrics: Object.values(METRICS).map((m) => ({
    id: m.id,
    label: m.label,
    description: forReaders(m.description),
    unit: m.unit,
    temporal: m.temporal,
    defaultChart: m.defaultChart,
    ranked: Boolean(m.ranked),
    threshold: m.threshold,
    caveat: m.caveat,
    dimensions: m.dimensions.map((d) => ({ id: d, label: DIMENSIONS[d].label })),
    filters: m.filters,
    // Whether the rows behind this report can be listed (the last drill).
    records: recordsRepo.hasRecords(m.id),
    // The Operations Analytics page filters this out of its own
    // builder/dropdown; the Impact Calculator page never reads the
    // catalog at all, it hard-codes its five metric ids. Exposed here
    // so the operations page does not have to hard-code the opposite
    // list to know what to hide.
    impactOnly: Boolean(m.impactOnly),
  })),
  // Custom reports: what can be counted, grouped and filtered, for the
  // builder's Custom mode. Names only — the SQL stays in customQuery.js.
  datasets: describeDatasets(),
  // Every filter a report can carry: its label, and its fixed choices
  // where it has them. The rest (suppliers, products, statuses as the
  // data holds them) come from /api/reporting/filter-options.
  filterDefs: Object.fromEntries(Object.entries(FILTERS).map(([key, f]) => [key, {
    label: f.label, values: f.values ?? null, kind: f.values ? 'list' : f.text ? 'text' : 'id',
  }])),
});

// A custom report ("how many X by Y") goes through its own validator
// and query builder, and comes back in the same shape.
// Reports that measure food leaving in kilograms, off the gate's lines.
const DISPATCH_KG_REPORTS = new Set([
  'dispatchVolume', 'mealsEnabled', 'mealsServedByGroup', 'dignityKitchenServed', 'communityServed',
]);

const runCustomReport = async (input) => {
  const spec = validateCustom(input);
  // Its own key: a custom spec has no metric/filters in the catalog sense.
  const key = `custom:${JSON.stringify([spec.custom, spec.dateRange ?? null])}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };
  const payload = await runCustom(spec, adhocRepo.runQuery);
  cache.set(key, payload, spec.dateRange ? cache.ttlFor(spec, todayISO()) : CACHE_TTL.SNAPSHOT);
  return payload;
};

const runReport = async (input) => {
  if (input?.custom) return runCustomReport(input);
  const spec   = validateSpec(input);
  const metric = getMetric(spec.metric);

  const key = cache.cacheKey(spec);
  const hit = cache.get(key);
  if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };

  const fn = repo[metric.repoFn];
  if (typeof fn !== 'function') {
    throw fail(500, `Report "${metric.label}" is not implemented (${metric.repoFn}).`);
  }

  // A metric can depend on a table that only exists once its own
  // migration has run — collection_kits for compost_processed is the
  // current example. Postgres' 42P01 (undefined_table) is the one
  // failure mode worth distinguishing from a genuine server bug: it
  // means "not set up yet," not "something is broken," and deserves
  // the same kind of actionable 503 the missing-factor case gets
  // below rather than a raw 500 that reads as the feature crashing.
  let series;
  try {
    series = await fn(spec);
  } catch (err) {
    if (err.code === '42P01') {
      throw fail(503, `"${metric.label}" hasn't been set up yet. Its database table doesn't exist yet: run the pending migration for this feature.`);
    }
    throw err;
  }

  const meta = {
    unit: metric.unit,
    caveat: metric.caveat,
    temporal: metric.temporal,
    threshold: metric.threshold,
    cached: false,
  };
  // How the page should draw it, beyond bars and lines.
  if (metric.funnel && metric.funnel.dimension === spec.dimension) {
    meta.funnel = { stages: metric.funnel.stages, exits: metric.funnel.exits };
  }
  if (metric.waterfall) meta.waterfall = true;
  if (metric.flows && metric.flows === spec.dimension) meta.flows = true;
  if (metric.rag) meta.rag = metric.rag;
  if (spec.dimension === 'weekday') { meta.ordered = true; meta.preferView = 'bar'; }
  if (spec.dimension === 'week_weekday' || spec.dimension === 'hour_weekday') meta.preferView = 'heatmap';
  // Its bars can be clicked through to the report behind them.
  // Every way a bar of this report can be opened, for the page's
  // drill buttons. See features/reporting/drillDown.js.
  const drills = drillOptions(metric, spec);
  if (drills.length) { meta.drillable = true; meta.drillOptions = drills; }
  if (recordsRepo.hasRecords(metric.id)) meta.records = true;

  // Factor metrics convert here rather than in SQL, so the raw
  // measurement stays inspectable and one bad factor cannot corrupt
  // a cached result.
  if (metric.factorKey) {
    const factor = await repo.getFactor(metric.factorKey);
    if (!factor) {
      throw fail(503, `"${metric.label}" needs the ${metric.factorKey} factor, which has not been set up yet.`);
    }
    series = series.map((row) => ({ ...row, value: Math.round(row.value * factor.value) }));
    meta.factor = { key: metric.factorKey, value: factor.value, note: factor.source_note };
  }

  // Weight metrics state what they excluded, so a total shrunk by
  // unit mismatches is visible rather than silently wrong.
  // Lines a kilogram figure cannot count, said beside it. Each kind of
  // report counts its own: dispatch lines for food going out, delivery
  // lines for goods coming in. (This used to count dispatch lines for
  // every kilogram report, so Goods received carried a note about
  // dispatch.)
  if (spec.dateRange && DISPATCH_KG_REPORTS.has(metric.repoFn)) {
    const skipped = await repo.countNonKgLines(spec);
    if (skipped > 0) { meta.excludedLines = skipped; meta.excludedKind = 'dispatch'; }
  } else if (spec.dateRange && metric.repoFn === 'goodsReceived') {
    const skipped = await repo.countNonKgReceivedLines(spec);
    if (skipped > 0) { meta.excludedLines = skipped; meta.excludedKind = 'delivery'; }
  }
  // Adults served counts kitchens' adults: say how many pallets were
  // for a kitchen with no adult count, and so added nothing.
  if (metric.repoFn === 'adultsReached') {
    const uncounted = series.reduce((n, row) => n + (row.meta?.uncounted ?? 0), 0);
    if (uncounted > 0) {
      meta.caveat = `${uncounted} kitchen pallet${uncounted === 1 ? ' was' : 's were'} for a kitchen with no adult count, and ${uncounted === 1 ? 'is' : 'are'} not counted. Add the kitchen and its adults on Beneficiaries, Kitchens.`;
    }
  }
  if (metric.repoFn === 'stockValue') {
    const unpriced = await repo.countUnpricedStock(spec);
    if (unpriced > 0) {
      meta.caveat = `${unpriced} product${unpriced === 1 ? '' : 's'} in stock ${unpriced === 1 ? 'has' : 'have'} no unit cost and ${unpriced === 1 ? 'is' : 'are'} left out. Add unit costs on the Products screen to value them.`;
    }
  }

  // Percentages average; everything else sums. A summed compliance
  // percentage would be nonsense, and the client should not have to
  // know which is which.
  // A waterfall's total is where it ends; days of cover average too.
  // THE TOTAL OF A RATE IS THE RATE OVERALL, NOT THE AVERAGE OF THE BARS
  // Three suppliers at 0%, 86% and 86% on-time do not make 57% if the
  // first sent one order and the others seven each. A rate or an
  // average broken down is totalled by running the same report with no
  // breakdown, which weighs every order, line or collection once. Only
  // a report with no overall form (days of cover) falls back to the
  // mean of its rows.
  const isRate = metric.unit === '%' || metric.unit === 'days' || metric.unit === 'hours' || metric.unit === 'ZAR/unit';
  let total;
  if (series.length === 0) total = 0;
  else if (metric.waterfall) total = series[series.length - 1].value;
  else if (isRate && spec.dimension !== 'none' && metric.dimensions.includes('none')) {
    const overall = await fn({ ...spec, dimension: 'none' });
    total = overall[0]?.value ?? 0;
  } else if (isRate) {
    total = series.length === 1 ? series[0].value : Number((series.reduce((s, r) => s + r.value, 0) / series.length).toFixed(1));
  } else total = series.reduce((s, r) => s + r.value, 0);

  const payload = {
    spec,
    description: describeSpec(spec),
    chartType: spec.chartType,
    series,
    total,
    meta,
  };

  // Snapshots are the current position, so a long TTL would show a
  // manager stock levels from an hour ago right after a delivery.
  const ttl = isSnapshot(metric) ? CACHE_TTL.SNAPSHOT : cache.ttlFor(spec, todayISO());
  cache.set(key, payload, ttl);
  return payload;
};

// A positive-or-zero number, not an empty payload — a factor of 0
// would silently zero out every meals/adults figure it feeds, and
// that is worth rejecting at the door rather than debugging later.
const setFactor = async ({ factorKey, value, unit, sourceNote, actorId }) => {
  if (!factorRepo.FACTOR_KEYS.includes(factorKey)) {
    throw fail(400, `Unknown factor "${factorKey}". Known factors: ${factorRepo.FACTOR_KEYS.join(', ')}.`);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw fail(400, 'value must be a positive number.');
  }
  const factor = await factorRepo.setFactor({ factorKey, value: num, unit, sourceNote, actorId });
  // Every cached report using this factor is now stale — the whole
  // cache is cleared rather than trying to guess which keys touched
  // it, since a factor edit is rare and the cache is cheap to rebuild.
  cache.clear();
  return factor;
};

const getFactorHistory = (factorKey) => factorRepo.listFactorHistory(factorKey);

// A bar named after a supplier, product, centre or programme filters by
// that record's id. The table name comes from drillDown.js's fixed
// list, never from the request.
const resolveLookup = async (plan, label) => {
  if (plan.lookup) {
    const id = await adhocRepo.findIdByName(plan.lookup.table, plan.lookup.name);
    // "Unassigned", "Unknown": the bar for records with nothing set.
    // There is no id to filter by, so there is no report behind it.
    if (id === null) throw fail(404, `"${label}" is not a single record, so there is nothing more to open behind this bar.`);
    plan.spec.filters[plan.filter] = id;
  }
};

// THE LAST DRILL: the records a report, or one bar of it, is made of.
// With a `label` the list is narrowed to that bar the same way a drill
// would narrow it (its supplier, its month, its day); without one it is
// everything the report counted. See reportingRecords.repository.js.
const records = async ({ spec: input, label }) => {
  let spec = validateSpec(input);
  let from = null;
  if (typeof label === 'string' && label) {
    const plan = planDrill(getMetric(spec.metric), spec, label, null, todayISO());
    if (plan) {
      await resolveLookup(plan, label);
      spec = validateSpec(plan.spec);
      from = label;
    }
  }
  const out = await recordsRepo.listRecords(spec);
  if (!out) throw fail(404, 'This report has no list of records behind it.');
  const metric = getMetric(spec.metric);
  return {
    ...out,
    title: `${metric.label}: the ${out.noun} behind ${from ? `"${from}"` : 'this report'}`,
    period: spec.dateRange ? `${spec.dateRange.from} to ${spec.dateRange.to}` : 'as it stands now',
    metric: spec.metric,
    shown: out.rows.length,
    truncated: out.total > out.rows.length,
  };
};

const filterOptions = () => recordsRepo.listFilterOptions();

// PROCESS MINING: the main process, purchase order to dispatch note,
// read off recorded timestamps (features/reporting/processMining.js).
// Not a catalog metric: it is a map with its own shape, so it has its
// own small validator here instead of a spec.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PROCESS_DAYS = 400;

const processMap = async ({ dateRange, filters = {} } = {}) => {
  const from = dateRange?.from;
  const to = dateRange?.to;
  const real = (d) => typeof d === 'string' && ISO_DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  if (!real(from) || !real(to)) throw fail(400, 'Choose a start and an end date.');
  if (from > to) throw fail(400, 'The start date is after the end date.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_PROCESS_DAYS) {
    throw fail(400, 'Choose a period of about a year or less.');
  }

  const f = filters ?? {};
  const supplierId = f.supplierId === undefined || f.supplierId === null || f.supplierId === '' ? null : Number(f.supplierId);
  if (supplierId !== null && !(Number.isInteger(supplierId) && supplierId > 0)) throw fail(400, 'That supplier is not valid.');
  const cohort = f.cohort ? String(f.cohort).toLowerCase() : null;
  if (cohort && !COHORTS.includes(cohort)) throw fail(400, 'That cohort is not valid.');
  const beneficiaryKind = f.beneficiaryKind ? String(f.beneficiaryKind) : null;
  if (beneficiaryKind && !BENEFICIARY_KINDS.includes(beneficiaryKind)) throw fail(400, 'That kind of beneficiary is not valid.');

  const [orders, slips, movements, donations, requests] = await Promise.all([
    processRepo.listOrders({ from, to, supplierId }),
    processRepo.listSlips({ from, to, cohort, beneficiaryKind }),
    processRepo.listMovements({ to }),
    processRepo.listDonations({ from, to }),
    processRepo.listRequests({ from, to }),
  ]);
  const orderIds = orders.map((o) => o.id);
  const [events, changes, deliveries, followUps, donationItems, reversals] = await Promise.all([
    processRepo.listSlipEvents(slips.map((s) => s.id)),
    processRepo.listOrderChanges(orderIds),
    processRepo.listOrderDeliveries(orderIds),
    processRepo.listFollowUps(orderIds),
    processRepo.listDonationItems(donations.map((d) => d.id)),
    processRepo.listRequestReversals(requests.map((r) => r.id)),
  ]);
  return {
    ...buildProcess({ orders, slips, events, movements, range: { from, to } }),
    // Every case's own path, for the flow map (features/reporting/processFlow.js).
    flow: buildFlow({ orders, changes, deliveries, followUps, slips, events, movements, donations, donationItems, requests, reversals }),
    filters: { supplierId, cohort, beneficiaryKind },
  };
};

// Click a bar → the report behind it (features/reporting/drillDown.js).
// A name from the chart is turned into its id here; the table name
// comes from a fixed map, never from the request.
const drillDown = async ({ spec: parentInput, label, target }) => {
  const parent = validateSpec(parentInput);
  const metric = getMetric(parent.metric);
  const plan = planDrill(metric, parent, label, typeof target === 'string' ? target : null, todayISO());
  if (!plan) throw fail(400, 'This chart cannot be drilled into.');
  await resolveLookup(plan, label);
  const report = await runReport(plan.spec);
  // "(supplier: 2)" means nothing to a reader; the name it came from does.
  const description = plan.lookup
    ? `${label}: ${report.description.replace(/,? \([^()]*: \d+\)/, '')}`
    : report.description;
  return { ...report, description, meta: { ...report.meta, drill: { from: label, title: plan.title } } };
};

// REORDER PLANNER: when each product runs out and what to order by
// when, from the shared stock cover (features/stock/stockCover.js).
const reorderPlan = async ({ horizonWeeks } = {}) => {
  const weeks = Number(horizonWeeks ?? 8);
  if (!HORIZONS.includes(weeks)) throw fail(400, `Choose a planning horizon of ${HORIZONS.join(', ')} weeks.`);
  return buildReorderPlan(await stockCoverRepo.loadStockCover({ today: todayISO(), horizonWeeks: weeks }));
};

// EXCEPTION ALERTS: the weekly measures judged against their own
// control limits (features/reporting/controlLimits.js). Each one is the
// ordinary weekly report, run through runReport like any other, so an
// alert and the chart it opens can never disagree.
const ALERT_METRICS = [
  'dispatch_volume', 'collection_compliance', 'late_collection_rate', 'gate_load_variance',
  'goods_received', 'receiving_discrepancy_rate', 'po_on_time_rate', 'supplier_lead_time', 'procurement_spend',
  'picking_flag_rate', 'picking_turnaround', 'decanting_wastage', 'decanting_margin_rate', 'community_response_time',
];
const ALERT_WEEKS = [8, 12, 26];
// A week with nothing recorded is a real zero for these, and no reading for a rate.
const VOLUME_UNITS = new Set(['kg', 'ZAR', 'orders', 'units']);

const exceptionAlerts = async ({ weeks } = {}) => {
  const baseline = Number(weeks ?? 12);
  if (!ALERT_WEEKS.includes(baseline)) throw fail(400, `Choose a baseline of ${ALERT_WEEKS.join(', ')} weeks.`);
  // The baseline, and the latest complete week judged against it.
  const window = completeWeeks(todayISO(), baseline + 1);
  const items = await Promise.all(ALERT_METRICS.map(async (id) => {
    const metric = METRICS[id];
    const better = OPERATIONAL_INSIGHTS[id]?.better ?? null;
    const base = { metric: id, label: metric.label, unit: metric.unit, better };
    try {
      const report = await runReport({ metric: id, dimension: 'week', filters: {}, dateRange: { from: window.from, to: window.to } });
      const points = alignWeeks(report.series, window.labels, { fillZero: VOLUME_UNITS.has(metric.unit) });
      return { ...base, points, ...assess(points, better) };
    } catch (err) {
      // One report that cannot run (a table not migrated yet) must not
      // take the other thirteen down with it.
      if ((err.status ?? 500) >= 500 && err.status !== 503) console.error('[alerts]', id, err.message);
      return { ...base, points: [], status: 'unavailable', signal: null, deviation: null };
    }
  }));
  const ranked = rankAlerts(items);
  return {
    range: { from: window.from, to: window.to },
    baselineWeeks: baseline,
    latestWeek: window.labels[window.labels.length - 1],
    items: ranked,
    summary: {
      adverse: ranked.filter((i) => i.signal === 'adverse').length,
      trend: ranked.filter((i) => i.signal === 'trend').length,
      unusual: ranked.filter((i) => i.signal === 'unusual').length,
      favourable: ranked.filter((i) => i.signal === 'favourable').length,
      inControl: ranked.filter((i) => i.status === 'in_control' && !i.signal).length,
      insufficient: ranked.filter((i) => i.status === 'insufficient' || i.status === 'unavailable').length,
    },
  };
};

// Workload is the `workload` report in reportCatalog.js now, run
// through runReport like any other (features/reporting/workload.js).

export default { getCatalog, runReport, drillDown, records, filterOptions, processMap, reorderPlan, exceptionAlerts, todayISO, setFactor, getFactorHistory };

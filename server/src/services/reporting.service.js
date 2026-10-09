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
import pool             from '../config/db.js';
import { validateCustom, runCustom, describeDatasets } from '../features/reporting/customQuery.js';
import { canDrill, planDrill } from '../features/reporting/drillDown.js';
import {
  METRICS, DIMENSIONS, CACHE_TTL, getMetric, isSnapshot, describeSpec,
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
const getCatalog = () => ({
  aiEnabled: aiProvider.isEnabled(),
  metrics: Object.values(METRICS).map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    unit: m.unit,
    temporal: m.temporal,
    defaultChart: m.defaultChart,
    ranked: Boolean(m.ranked),
    threshold: m.threshold,
    caveat: m.caveat,
    dimensions: m.dimensions.map((d) => ({ id: d, label: DIMENSIONS[d].label })),
    filters: m.filters,
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
});

// A custom report ("how many X by Y") goes through its own validator
// and query builder, and comes back in the same shape.
const runCustomReport = async (input) => {
  const spec = validateCustom(input);
  // Its own key: a custom spec has no metric/filters in the catalog sense.
  const key = `custom:${JSON.stringify([spec.custom, spec.dateRange ?? null])}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };
  const payload = await runCustom(spec, (sql, params) => pool.query(sql, params));
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
  if (spec.dimension === 'week_weekday') meta.preferView = 'heatmap';
  // Its bars can be clicked through to the report behind them.
  if (canDrill(metric, spec.dimension)) meta.drillable = true;

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
  if (spec.dateRange && !metric.waterfall && (metric.unit === 'kg' || metric.factorKey)) {
    const skipped = await repo.countNonKgLines(spec);
    if (skipped > 0) meta.excludedLines = skipped;
  }

  // Percentages average; everything else sums. A summed compliance
  // percentage would be nonsense, and the client should not have to
  // know which is which.
  // A waterfall's total is where it ends; days of cover average too.
  const total = series.length === 0
    ? 0
    : metric.waterfall
      ? series[series.length - 1].value
      : metric.unit === '%' || metric.unit === 'days'
        ? Number((series.reduce((s, r) => s + r.value, 0) / series.length).toFixed(1))
        : series.reduce((s, r) => s + r.value, 0);

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

// Click a bar → the report behind it (features/reporting/drillDown.js).
// A name from the chart is turned into its id here; the table name
// comes from a fixed map, never from the request.
const drillDown = async ({ spec: parentInput, label }) => {
  const parent = validateSpec(parentInput);
  const metric = getMetric(parent.metric);
  const plan = planDrill(metric, parent, label);
  if (!plan) throw fail(400, 'This chart cannot be drilled into.');
  if (plan.lookup) {
    const { rows } = await pool.query(`SELECT id FROM ${plan.lookup.table} WHERE name = $1 ORDER BY id LIMIT 1`, [plan.lookup.name]);
    if (!rows.length) throw fail(404, `Could not find "${label}" to drill into.`);
    plan.spec.filters[plan.filter] = rows[0].id;
  }
  const report = await runReport(plan.spec);
  // "(supplier: 2)" means nothing to a reader; the name it came from does.
  const description = plan.lookup
    ? `${label}: ${report.description.replace(/,? \([^()]*: \d+\)/, '')}`
    : report.description;
  return { ...report, description, meta: { ...report.meta, drill: { from: label, title: plan.title } } };
};

export default { getCatalog, runReport, drillDown, todayISO, setFactor, getFactorHistory };

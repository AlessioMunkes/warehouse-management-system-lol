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
import cache            from '../features/reporting/reportCache.js';
import { validateSpec } from '../features/reporting/specValidator.js';
import aiProvider       from '../features/reporting/ai/provider.js';
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
  })),
});

const runReport = async (input) => {
  const spec   = validateSpec(input);
  const metric = getMetric(spec.metric);

  const key = cache.cacheKey(spec);
  const hit = cache.get(key);
  if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };

  const fn = repo[metric.repoFn];
  if (typeof fn !== 'function') {
    throw fail(500, `Report "${metric.label}" is not implemented (${metric.repoFn}).`);
  }

  let series = await fn(spec);

  const meta = {
    unit: metric.unit,
    caveat: metric.caveat,
    temporal: metric.temporal,
    threshold: metric.threshold,
    cached: false,
  };

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
  if (spec.dateRange && (metric.unit === 'kg' || metric.factorKey)) {
    const skipped = await repo.countNonKgLines(spec);
    if (skipped > 0) meta.excludedLines = skipped;
  }

  // Percentages average; everything else sums. A summed compliance
  // percentage would be nonsense, and the client should not have to
  // know which is which.
  const total = series.length === 0
    ? 0
    : metric.unit === '%'
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

export default { getCatalog, runReport, todayISO };

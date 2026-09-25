// ─────────────────────────────────────────────────────────────
// server/src/services/reportingInsight.service.js
//
// One operational report, broken down into something a manager can
// act on:
//   key figures      — headline, change on the previous period,
//                      latest bucket or biggest contributor
//   related charts   — one or two views that explain the main one
//   who to act on    — named centres, suppliers, products, packers
//   written reading  — optional; model-written, template fallback
//
// NO NEW PATH TO THE NUMBERS
// The main chart, the previous period and every related chart go
// through reporting.service.runReport — same validator, cache and
// queries as the builder. Only the "who to act on" lists have their
// own SQL (reportingInsight.repository.js).
//
// OPERATIONS ONLY
// Impact metrics are refused here, whatever the request says. Impact
// reporting stays on its own page with its own rules.
// ─────────────────────────────────────────────────────────────
import reportingService from './reporting.service.js';
import { getMetric, isSnapshot, DIMENSIONS } from '../features/reporting/reportCatalog.js';
import {
  ACTION_LISTS, LENSES, getInsightConfig, OPERATIONAL_INSIGHTS,
} from '../features/reporting/insights/operationalInsights.js';
import { writeNarrative } from '../features/reporting/insights/narrative.js';
import { COMPARISONS, getComparison } from '../features/reporting/reportComparisons.js';
import { MAX_RANGE_DAYS } from '../features/reporting/reportCatalog.js';
import targetRepo from '../repositories/reportingTarget.repository.js';
import comparisonRepo from '../repositories/reportingComparison.repository.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const DAY = 24 * 60 * 60 * 1000;
const toISO = (d) => d.toISOString().slice(0, 10);
const parse = (iso) => new Date(`${iso}T00:00:00Z`);

// The same window just before this one, equal length, so "up 12%"
// compares like with like.
export const previousRange = ({ from, to }) => {
  const f = parse(from);
  const days = Math.round((parse(to) - f) / DAY) + 1;
  const prevTo = new Date(f.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY);
  return { from: toISO(prevFrom), to: toISO(prevTo) };
};

// Snapshot reports have no period, but their lists and related
// period charts need one. Same default as the ask box: the start of
// the month two months back, to today.
const defaultRange = (todayISO) => {
  const to = parse(todayISO);
  const from = new Date(to);
  from.setUTCDate(1);
  from.setUTCMonth(from.getUTCMonth() - 2);
  return { from: toISO(from), to: todayISO };
};

export const pctChange = (now, before) => {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
};

export const toneFor = (delta, better) => {
  if (delta == null || delta === 0 || !better) return 'neutral';
  return (delta > 0) === (better === 'up') ? 'good' : 'bad';
};

const TIME_DIMENSIONS = new Set(['month', 'week']);

// Sums only make sense for additive units. A share of a percentage
// or of a unit price is nonsense.
const isAdditive = (unit) => unit !== '%' && unit !== 'ZAR/unit';

export const buildFigures = ({ metric, cfg, report, previous, actions }) => {
  const items = [];
  const unit = metric.unit;
  const series = report.series ?? [];

  // 1. Headline.
  if (cfg.countRows) {
    const listTotal = actions.find((a) => a.id === 'low_stock')?.total;
    const count = metric.id === 'low_stock_items' && listTotal != null ? listTotal : series.length;
    items.push({
      label: metric.id === 'low_stock_items' ? 'Products at or below reorder level' : 'Products listed',
      value: count, unit: 'products', tone: metric.id === 'low_stock_items' && count > 0 ? 'bad' : 'neutral',
    });
  } else {
    // A summed unit price is meaningless; the headline is the
    // average across the rows, same as a percentage.
    const perUnit = unit === 'ZAR/unit';
    const headline = perUnit && series.length
      ? Math.round((series.reduce((s, r) => s + r.value, 0) / series.length) * 100) / 100
      : report.total;
    items.push({
      label: unit === '%' || perUnit ? `${metric.label} (average)` : metric.label,
      value: headline, unit,
      delta: previous?.changePct ?? null,
      deltaLabel: previous ? 'vs previous period' : null,
      tone: toneFor(previous?.changePct, cfg.better),
    });
  }

  // 2. Shape of the breakdown.
  const dim = report.spec.dimension;
  if (TIME_DIMENSIONS.has(dim) && series.length >= 2) {
    const first = series[0];
    const last  = series[series.length - 1];
    const change = pctChange(last.value, first.value);
    items.push({
      label: `Latest ${DIMENSIONS[dim].label.toLowerCase()} (${last.label})`,
      value: last.value, unit,
      delta: change, deltaLabel: `vs ${first.label}`,
      tone: toneFor(change, cfg.better),
    });
  } else if (!TIME_DIMENSIONS.has(dim) && dim !== 'none' && series.length >= 2) {
    const top = [...series].sort((a, b) => b.value - a.value)[0];
    const sum = series.reduce((s, r) => s + r.value, 0);
    const bestIsLow = cfg.better === 'down';
    items.push({
      label: `${bestIsLow ? 'Highest' : 'Largest'}: ${top.label}`,
      value: top.value, unit: top.meta?.unit ?? unit,
      note: isAdditive(unit) && sum > 0 && !top.meta?.unit
        ? `${Math.round((top.value / sum) * 100)}% of the total`
        : unit === '%' ? `against ${report.total}% overall` : null,
      tone: bestIsLow ? 'bad' : 'neutral',
    });
  }

  // 3. The first list with anyone on it.
  const open = actions.find((a) => a.total > 0);
  if (open) {
    items.push({ label: open.title, value: open.total, unit: 'to follow up', tone: 'bad' });
  } else if (actions.length) {
    items.push({ label: 'Needing follow-up', value: 0, unit: '', tone: 'good' });
  }

  return { items: items.slice(0, 3), better: cfg.better, countRows: Boolean(cfg.countRows) };
};

const pickFilters = (filters, metric) => {
  const out = {};
  for (const [k, v] of Object.entries(filters ?? {})) if (metric.filters.includes(k)) out[k] = v;
  return out;
};

// A list or related chart that fails (a table not migrated yet, a
// column renamed) must not take the whole report down with it. The
// failure is logged and the section is left out.
const settle = async (label, fn) => {
  try { return await fn(); } catch (err) {
    console.warn(`[insight] ${label} skipped:`, err.message);
    return null;
  }
};

// ── Targets ───────────────────────────────────────────────────
// "Limit" when lower is better, "Target" otherwise, so the line
// reads the right way round whoever set the number.
const targetValueText = (value, unit) => {
  if (unit === '%') return `${value}%`;
  if (unit === 'ZAR') return `R${Number(value).toLocaleString('en-GB')}`;
  if (unit === 'ZAR/unit') return `R${value} per unit`;
  return `${value} ${unit}`;
};

export const makeTarget = (metric, cfg, value, custom) => (
  value === null || value === undefined ? null : {
    value: Number(value),
    label: `${cfg.better === 'down' ? 'Limit' : 'Target'} ${targetValueText(value, metric.unit)}`,
    custom: Boolean(custom),
    defaultValue: cfg.target ?? null,
  }
);

const operationalMetric = (metricId) => {
  const metric = getMetric(metricId);
  const cfg = getInsightConfig(metricId);
  if (!metric || metric.impactOnly || !cfg) {
    throw fail(400, 'Targets can only be set on operational reports.');
  }
  return { metric, cfg };
};

// Every operational metric's effective target for this manager:
// their own value where they set one, otherwise the default (which
// may be none).
export const getTargets = async (userId) => {
  const own = new Map((userId ? await targetRepo.listForUser(userId) : []).map((r) => [r.metric_id, r.value]));
  const out = {};
  for (const id of Object.keys(OPERATIONAL_INSIGHTS)) {
    const { metric, cfg } = operationalMetric(id);
    const t = own.has(id) ? makeTarget(metric, cfg, own.get(id), true) : makeTarget(metric, cfg, cfg.target, false);
    out[id] = t ?? { value: null, label: null, custom: false, defaultValue: null };
  }
  return out;
};

// value null or '' = reset to the default.
export const setTarget = async ({ userId, metricId, value }) => {
  const { metric, cfg } = operationalMetric(metricId);
  if (!userId) throw fail(401, 'Sign in to save a target.');
  if (value === null || value === undefined || value === '') {
    await targetRepo.remove({ userId, metricId });
    return makeTarget(metric, cfg, cfg.target, false);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw fail(400, 'A target must be a number of zero or more.');
  if (metric.unit === '%' && num > 100) throw fail(400, 'A percentage target cannot be above 100.');
  await targetRepo.upsert({ userId, metricId, value: num });
  return makeTarget(metric, cfg, num, true);
};

export const buildInsight = async ({ spec, narrate = false, userId } = {}) => {
  const metric = getMetric(spec?.metric);
  if (!metric) throw fail(400, 'Unknown report.');
  if (metric.impactOnly) {
    throw fail(400, `"${metric.label}" is an impact figure. It lives on the Impact Report page, not here.`);
  }
  const cfg = getInsightConfig(metric.id);
  if (!cfg) throw fail(400, `"${metric.label}" has no breakdown available yet.`);

  const report = await reportingService.runReport(spec);
  const ownTargets = userId ? await targetRepo.listForUser(userId) : [];
  const own = ownTargets.find((t) => t.metric_id === metric.id);
  const target = own ? makeTarget(metric, cfg, own.value, true) : makeTarget(metric, cfg, cfg.target, false);
  const todayISO = reportingService.todayISO();
  const range = report.spec.dateRange ?? defaultRange(todayISO);

  const previousP = isSnapshot(metric) || !report.spec.dateRange
    ? Promise.resolve(null)
    : settle('previous period', async () => {
        const dateRange = previousRange(report.spec.dateRange);
        const prev = await reportingService.runReport({ ...report.spec, dateRange });
        const measure = (r) => (metric.unit === 'ZAR/unit' && r.series.length
          ? r.series.reduce((s, x) => s + x.value, 0) / r.series.length
          : r.total);
        const before = measure(prev);
        // No rows before means nothing to compare with, not a rise
        // from zero: the change is withheld rather than shown as ∞.
        if (prev.series.length === 0) return { dateRange, total: null, changePct: null, empty: true };
        return { dateRange, total: Math.round(before * 100) / 100, changePct: pctChange(measure(report), before) };
      });

  const relatedP = Promise.all(cfg.related
    .filter((r) => !(r.metric === report.spec.metric && r.dimension === report.spec.dimension))
    .map((r) => settle(`related ${r.metric}`, async () => {
      const m = getMetric(r.metric);
      const out = await reportingService.runReport({
        metric: r.metric,
        dimension: r.dimension,
        filters: pickFilters(report.spec.filters, m),
        dateRange: isSnapshot(m) ? undefined : range,
      });
      return { ...out, meta: { ...out.meta, unit: m.unit } };
    })));

  const actionsP = Promise.all(cfg.actions.map((id) => settle(`list ${id}`, async () => {
    const def = ACTION_LISTS[id];
    const { rows, total } = await def.run({ dateRange: range, filters: report.spec.filters ?? {} });
    return {
      id, title: def.title, intro: def.intro, link: def.link,
      total, entries: rows.map(def.entry),
    };
  })));

  // Bars and a line over the same months. Both halves go through
  // runReport; a combo missing either half is dropped.
  const comboP = cfg.combo
    ? settle('combo', async () => {
        const [bars, line] = await Promise.all([cfg.combo.bars, cfg.combo.line].map((id) =>
          reportingService.runReport({
            metric: id, dimension: 'month',
            filters: pickFilters(report.spec.filters, getMetric(id)), dateRange: range,
          })));
        const half = (id, r) => ({ label: getMetric(id).label, unit: getMetric(id).unit, series: r.series });
        return { title: cfg.combo.title, bars: half(cfg.combo.bars, bars), line: half(cfg.combo.line, line) };
      })
    : Promise.resolve(null);

  const [previous, relatedRaw, actionsRaw, combo] = await Promise.all([previousP, relatedP, actionsP, comboP]);
  const related = relatedRaw.filter(Boolean).slice(0, 2);
  const actions = actionsRaw.filter(Boolean);
  const figures = buildFigures({ metric, cfg, report, previous, actions });

  const result = {
    report,
    previous,
    figures: figures.items,
    related,
    actions,
    combo,
    target,
    // A snapshot's lists use a default period; say which one.
    listRange: report.spec.dateRange ? null : range,
    area: cfg.area,
    generatedAt: new Date().toISOString(),
  };

  if (narrate) {
    result.narrative = await writeNarrative({
      metric, lens: LENSES[cfg.area], report, previous, figures, related, actions, target,
    });
  }

  return result;
};

// ── Comparisons (scatter plots) ───────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const listComparisons = () =>
  Object.values(COMPARISONS).map(({ id, label, description, x, y, caveat }) => ({ id, label, description, x, y, caveat }));

export const runComparison = async ({ id, dateRange } = {}) => {
  const def = getComparison(id);
  if (!def) throw fail(400, 'Unknown comparison.');
  const range = dateRange ?? defaultRange(reportingService.todayISO());
  if (!ISO.test(range.from ?? '') || !ISO.test(range.to ?? '')) throw fail(400, 'Dates must be YYYY-MM-DD.');
  const days = Math.round((parse(range.to) - parse(range.from)) / DAY);
  if (Number.isNaN(days) || days < 0) throw fail(400, 'The start date must be on or before the end date.');
  if (days > MAX_RANGE_DAYS) throw fail(400, `Date range too wide. The maximum is ${MAX_RANGE_DAYS} days.`);

  const points = await comparisonRepo[def.repoFn]({ dateRange: { from: range.from, to: range.to } });
  return {
    type: 'comparison',
    id: def.id,
    label: def.label,
    description: `${def.label}, ${range.from} to ${range.to}`,
    about: def.description,
    x: def.x, y: def.y,
    caveat: def.caveat,
    dateRange: { from: range.from, to: range.to },
    points: points.map((p) => ({ ...p, detail: def.detail(p) })),
  };
};

export default {
  buildInsight, previousRange, pctChange, toneFor, buildFigures, listComparisons, runComparison,
  getTargets, setTarget,
};

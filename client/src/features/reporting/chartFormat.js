// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/chartFormat.js
//
// Shape detection, pivoting and formatting for the Operations
// page's Recharts charts (OperationalChart, ComboChart,
// ComparisonChart). ReportChart.jsx keeps its own copies on
// purpose: it is shared with the Impact Report page, and nothing
// here should be able to change how that page draws.
// ─────────────────────────────────────────────────────────────

// Categorical slots, in fixed order, defined as --viz-N tokens in
// operationalReport.css (light and dark each validated as a set).
// A ninth category is never a new colour: it folds into "Other".
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--viz-${i + 1})`);
export const MAX_SERIES = 7; // plus "Other" = 8

const MONTH = /^\d{4}-\d{2}$/;
const WEEK  = /^\d{4}-W\d{2}$/;
export const TWO_AXIS = /^(.+?)\|(.+)$/;

export const humanise = (s) =>
  String(s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const formatLabel = (label) => {
  const s = String(label ?? '');
  if (MONTH.test(s)) {
    const [y, m] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1))
      .toLocaleDateString('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  if (WEEK.test(s)) return s.replace('-W', ' wk ');
  return humanise(s);
};

export const fmtValue = (value, unit) => {
  const n = Number(value ?? 0);
  if (unit === 'ZAR') return `R${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
  if (unit === 'ZAR/unit') return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (unit === '%') return `${n.toFixed(1)}%`;
  return n.toLocaleString('en-ZA', { maximumFractionDigits: 1 });
};

// Short axis ticks: R12k, 1.2k.
export const fmtTick = (value, unit) => {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  const short = abs >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : abs >= 1e3 ? `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k` : `${Math.round(n * 10) / 10}`;
  if (unit === 'ZAR' || unit === 'ZAR/unit') return `R${short}`;
  if (unit === '%') return `${short}%`;
  return short;
};

export const unitWord = (unit) =>
  (!unit || unit === 'ZAR' || unit === '%' ? '' : unit === 'ZAR/unit' ? 'per unit' : unit);

// Sums only mean something for additive units — a share of a
// percentage, a unit price, or mixed per-row units is nonsense.
export const isAdditive = (unit, series) =>
  unit !== '%' && unit !== 'ZAR/unit' && !(series ?? []).some((r) => r.meta?.unit);

const TIME_DIMS = new Set(['month', 'week']);

// 'number' | 'time' | 'category' | 'twoAxis'
export const shapeOf = (report) => {
  const series = report?.series ?? [];
  const dim = report?.spec?.dimension;
  if (series.length && series.every((r) => TWO_AXIS.test(r.label))) return 'twoAxis';
  if (dim === 'none') return 'number';
  if (TIME_DIMS.has(dim) || (series.length && series.every((r) => MONTH.test(r.label) || WEEK.test(r.label)))) return 'time';
  return 'category';
};

// "2026-07|Supplier A" rows → one row per month, one key per
// category. Categories past MAX_SERIES fold into "Other", biggest
// kept, so colour follows the category and never its rank.
export const pivot = (series) => {
  const totals = new Map();
  for (const r of series) {
    const [, , key] = TWO_AXIS.exec(r.label);
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(r.value));
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const kept = ranked.length > MAX_SERIES + 1 ? ranked.slice(0, MAX_SERIES) : ranked;
  const keptSet = new Set(kept);
  const keys = ranked.length > kept.length ? [...kept, 'Other'] : kept;

  const rows = new Map();
  for (const r of series) {
    const [, x, rawKey] = TWO_AXIS.exec(r.label);
    const key = keptSet.has(rawKey) ? rawKey : 'Other';
    const row = rows.get(x) ?? { name: x };
    row[key] = (row[key] ?? 0) + r.value;
    rows.set(x, row);
  }
  return { rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)), keys };
};

// Which ways a report can be drawn, most natural first.
export const viewsFor = (shape, unit, series) => {
  const n = series?.length ?? 0;
  if (shape === 'number') return ['number', 'table'];
  if (shape === 'twoAxis') return ['stacked', 'grouped', 'heatmap', 'table'];
  if (shape === 'time') return ['line', 'area', 'bar', 'table'];
  const views = ['hbar', 'bar'];
  const additive = isAdditive(unit, series) && series.every((r) => r.value >= 0);
  if (additive && n >= 2 && n <= 10) views.push('donut');
  if (additive && n >= 3) views.push('pareto');
  views.push('table');
  return views;
};

export const VIEW_LABELS = {
  number: 'Figure', table: 'Table', line: 'Line', area: 'Area', bar: 'Columns', hbar: 'Bars',
  donut: 'Donut', pareto: 'Pareto', stacked: 'Stacked', grouped: 'Grouped', heatmap: 'Heatmap',
};

// The server's chartType, or the AI's hint, mapped onto a view this
// data can actually take.
export const defaultView = (views, chartType, hint) => {
  if (hint && views.includes(hint)) return hint;
  const fromType = { line: 'line', bar: 'bar', hbar: 'hbar', number: 'number', stacked_bar: 'stacked', grouped_bar: 'grouped' }[chartType];
  if (fromType && views.includes(fromType)) return fromType;
  return views[0];
};

export const toCsv = (rows, columns) => {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n');
};

export const downloadCsv = (filename, csv) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

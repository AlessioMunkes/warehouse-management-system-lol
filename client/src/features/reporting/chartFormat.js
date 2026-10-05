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
  // Days of the week keep their order, all seven, even a quiet one.
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ranked = [...totals.keys()].every((k) => DAYS.includes(k))
    ? DAYS
    : [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
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
export const viewsFor = (shape, unit, series, meta = null) => {
  const n = series?.length ?? 0;
  if (meta?.waterfall) return ['waterfall', 'table'];
  if (meta?.flows) return ['sankey', 'table'];
  if (meta?.funnel && shape === 'category') return ['funnel', 'hbar', 'bar', 'table'];
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
  funnel: 'Funnel', waterfall: 'Waterfall', sankey: 'Flow',
};

// The server's chartType, or the AI's hint, mapped onto a view this
// data can actually take.
export const defaultView = (views, chartType, hint, meta = null) => {
  if (hint && views.includes(hint)) return hint;
  if (meta?.preferView && views.includes(meta.preferView)) return meta.preferView;
  // A report that asked for a diagram opens on it.
  if (['funnel', 'waterfall', 'sankey'].includes(views[0])) return views[0];
  const fromType = { line: 'line', bar: 'bar', hbar: 'hbar', number: 'number', stacked_bar: 'stacked', grouped_bar: 'grouped' }[chartType];
  if (fromType && views.includes(fromType)) return fromType;
  return views[0];
};

// ── Funnel ────────────────────────────────────────────────────
// A pipeline counted by where each item sits NOW, read as stages in
// order: an item at "in transit" has also been pending and approved,
// so `reached` for a stage is everything at it or past it. `here` is
// what is sitting at it. Exits (returned, cancelled) left the path and
// are listed on their own, not squeezed into a stage.
export const funnelOf = (series, funnel) => {
  const by = new Map((series ?? []).map((r) => [r.label, r.value]));
  const stages = funnel.stages.map((id) => ({ id, here: by.get(id) ?? 0 }));
  let run = 0;
  for (let i = stages.length - 1; i >= 0; i -= 1) { run += stages[i].here; stages[i].reached = run; }
  const top = stages[0]?.reached || 0;
  stages.forEach((s, i) => {
    s.ofStart = top ? Math.round((s.reached / top) * 100) : 0;
    s.fromPrev = i && stages[i - 1].reached ? Math.round((s.reached / stages[i - 1].reached) * 100) : null;
  });
  const known = new Set([...funnel.stages, ...(funnel.exits ?? [])]);
  const exits = (funnel.exits ?? []).map((id) => ({ id, value: by.get(id) ?? 0 })).filter((e) => e.value > 0);
  // A status the funnel does not know yet still shows, as an exit, so
  // nothing is silently dropped.
  for (const r of series ?? []) if (!known.has(r.label) && r.value) exits.push({ id: r.label, value: r.value });
  return { stages, exits };
};

// Red / amber / green from a report's own bands (meta.rag): below
// `red` is bad, below `amber` a warning — for measures where more is
// better, like days of stock left.
export const ragColour = (rag, value) => {
  if (!rag || typeof value !== 'number') return null;
  if (value < rag.red) return 'var(--rag-bad)';
  if (value < rag.amber) return 'var(--rag-warn)';
  return 'var(--rag-good)';
};

// ── Anomalies ─────────────────────────────────────────────────
// Points far from the usual level: more than 3 robust deviations
// (median absolute deviation) from the median. Robust so one spike
// does not hide itself by dragging the average up. Needs six points;
// fewer is not a pattern.
export const anomaliesOf = (rows, key = 'value') => {
  const vals = rows.map((r) => r[key]).filter((v) => typeof v === 'number');
  if (vals.length < 6) return [];
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const med = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - med))) * 1.4826;
  // A flat series (MAD 0) only flags values that differ at all by a lot.
  const spread = mad || (Math.max(...vals) - Math.min(...vals)) / 4;
  if (!spread) return [];
  return rows
    .filter((r) => typeof r[key] === 'number' && Math.abs(r[key] - med) > 3 * spread)
    .map((r) => ({ name: r.name, value: r[key], direction: r[key] > med ? 'high' : 'low', usual: med }));
};

// ── Waterfall ─────────────────────────────────────────────────
// Opening, the changes, closing: each change floats from where the
// last one ended. `base` is the invisible part of the bar.
export const waterfallOf = (series) => {
  let level = 0;
  return (series ?? []).map((r) => {
    const kind = r.meta?.kind ?? 'change';
    if (kind === 'total') { level = r.value; return { name: r.label, base: 0, value: r.value, kind, end: r.value }; }
    const start = level;
    level += r.value;
    return { name: r.label, base: Math.min(start, level), value: Math.abs(r.value), signed: r.value, kind, end: level };
  });
};

// ── Flow (Sankey) ─────────────────────────────────────────────
// "source|target" rows → nodes and links. The two sides are kept
// apart even if a word appears on both (e.g. "pending").
export const flowOf = (series) => {
  const nodes = [];
  const index = new Map();
  const node = (side, name) => {
    const key = `${side}:${name}`;
    if (!index.has(key)) { index.set(key, nodes.length); nodes.push({ name: formatLabel(name), side }); }
    return index.get(key);
  };
  const links = [];
  for (const r of series ?? []) {
    const m = TWO_AXIS.exec(r.label);
    if (!m || !(r.value > 0)) continue;
    links.push({ source: node('from', m[1]), target: node('to', m[2]), value: r.value });
  }
  return { nodes, links };
};

// The same dates a year earlier. 29 February becomes the 28th.
export const yearEarlier = (range) => {
  if (!range?.from || !range?.to) return null;
  const back = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const day = m === 2 && d === 29 ? 28 : d;
    return `${y - 1}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  return { from: back(range.from), to: back(range.to) };
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

// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/chartTheme.js
//
// Shared by the dashboard's donut widgets and report panels. Kept out
// of the component files so fast refresh keeps working.
// ─────────────────────────────────────────────────────────────
export const BENEFICIARY_LABELS = {
  ecd: 'ECDs', soup_kitchen: 'Soup kitchens',
  dignity_kitchen: 'Dignity kitchens', community: 'Community',
};

// Tokens, so every slice inverts with the theme.
export const DONUT_COLORS = [
  'var(--ink)', 'var(--brand)', 'var(--chart-tan)', 'var(--chart-sage)', 'var(--chart-grey)',
];

/**
 * The report payload out of whatever envelope the API wrapped it in.
 * Reads `series` — the reporting rework renamed `data` to `series`,
 * and the dashboard reading the old name is why it showed "nothing
 * dispatched" with 43 kg out of the door.
 */
export const unwrapReport = (res) => {
  const r = res?.data?.series ? res.data : res;
  return { ...r, series: Array.isArray(r?.series) ? r.series : [] };
};

// ── Period menu ──────────────────────────────────────────────
// The three choices every dated chart offers. `preset` is the date
// range in reporting/dateRanges.js.
export const PERIODS = [
  { id: 'month', label: 'Month',    preset: 'this_month' },
  { id: '3m',    label: '3 months', preset: 'last_3m' },
  { id: 'year',  label: 'Year',     preset: 'this_year' },
];
export const DEFAULT_PERIOD = 'year';
export const periodById = (id) => PERIODS.find((p) => p.id === id)
  ?? PERIODS.find((p) => p.id === DEFAULT_PERIOD);

// ── Red / amber / green ──────────────────────────────────────
export const RAG = {
  bad:  'var(--rag-bad)',
  warn: 'var(--rag-warn)',
  good: 'var(--rag-good)',
  none: 'var(--rag-none)',
  // Context, not action: recedes next to the statuses that need someone.
  muted: 'var(--rag-muted)',
  // Waiting on someone outside — not ours to act on, not a problem.
  waiting: 'var(--viz-1)',
  // Ours to act on, but not yet started.
  todo: 'var(--viz-7)',
};

/** A fixed colour per label, for categories that are statuses. */
export const byLabel = (map) => (name) => map[name] ?? null;

/**
 * A value against its target. Green is on the right side of the line.
 * Amber is close: within 10% short of a target to reach, or up to half
 * again over a limit to stay under. Red is further out than that.
 */
export const ragAgainst = (target) => (_name, value) => {
  if (!target || target.value == null || !target.better) return null;
  const t = Number(target.value);
  const v = Number(value);
  if (target.better === 'up') {
    if (v >= t) return RAG.good;
    return v >= t * 0.9 ? RAG.warn : RAG.bad;
  }
  if (v <= t) return RAG.good;
  return v <= t * 1.5 ? RAG.warn : RAG.bad;
};

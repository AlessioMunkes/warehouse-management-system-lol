// ─────────────────────────────────────────────────────────────
// client/src/features/impactMap/impactView.js
//
// What the Impact map shows, with no React in it: which centres pass
// the filters, the totals in the summary strip, the period presets and
// how a cohort reads. So the strip, the map and the not-served list
// cannot disagree.
//
// TOTAL MEALS are worked out from the total kilograms, times the factor,
// rounded once: the way the Meals enabled report does it, so the strip
// shows the report's number and not a sum of rounded centres.
//
// Days are South African calendar days ('YYYY-MM-DD') as the server
// sends them; today is the server's today, never the browser's clock.
// ─────────────────────────────────────────────────────────────
import { COHORT_LABELS } from '@/lib/cohorts';

const DAY_MS = 86_400_000;

// A circle's colour, as design tokens so both themes hold: the class
// sets fill and outline, beating the colour Leaflet writes as an
// attribute. By cohort; idle is a centre not served in the period.
export const TONES = {
  tuesday:  'fill-info stroke-info',
  thursday: 'fill-violet stroke-violet',
  other:    'fill-warn stroke-warn',
  idle:     'fill-ink-faint stroke-ink-soft',
};

// How a centre's pin was set (ecd_centres.location_source).
export const SOURCE_LABEL = { manual: 'Placed by an admin', geocoded: 'Looked up on OpenStreetMap', imported: 'Mapped on OpenStreetMap' };

export const PRESETS = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 180, label: 'Last 6 months' },
  { days: 365, label: 'Last 12 months' },
  // The longest period the server allows (MAX_RANGE_DAYS).
  { days: 730, label: 'Cumulative' },
];

export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** The period a preset means, ending today. */
export const presetRange = (days, today) => ({ from: addDays(today, -(days - 1)), to: today });

/** The preset a period is, or null for a custom one. */
export const presetOf = (range) => {
  if (!range || range.to !== range.today) return null;
  return PRESETS.find((p) => daysBetween(range.from, range.to) === p.days - 1)?.days ?? null;
};

/** "Tuesday", "Thursday"; an older value reads as written ("week1" is "Week 1"). */
export const cohortLabel = (cohort) => COHORT_LABELS[cohort]
  ?? String(cohort ?? '').replace(/^week(\d+)$/i, 'Week $1').replace(/^\w/, (c) => c.toUpperCase());

export const isServed = (centre) => centre.dispatches > 0;
export const isPlaced = (centre) => centre.lat !== null && centre.lng !== null;

/** Centres passing the cohort and "not served only" filters. */
export const filterCentres = (centres, { cohort = 'all', notServedOnly = false } = {}) => centres.filter((c) =>
  (cohort === 'all' || c.cohort === cohort) && (!notServedOnly || !isServed(c)));

/** The summary strip for the centres in view. */
export const summarise = (centres, factor) => {
  const kg = centres.reduce((s, c) => s + (Number(c.kg) || 0), 0);
  const served = centres.filter(isServed);
  return {
    meals: factor ? Math.round(kg * factor.value) : null,
    kg: Math.round(kg),
    dispatches: centres.reduce((s, c) => s + c.dispatches, 0),
    served: served.length,
    notServed: centres.length - served.length,
    unplaced: centres.filter((c) => !isPlaced(c)).length,
  };
};

/** Active centres not served in the period, longest since a collection first (never first of all). */
export const notServedList = (centres) => centres
  .filter((c) => c.isActive && !isServed(c))
  .sort((a, b) => (a.lastCollected ?? '').localeCompare(b.lastCollected ?? '') || a.name.localeCompare(b.name));

/** "12 days ago", "Never", from a centre's last collection day. */
export const sinceText = (day, today) => {
  if (!day) return 'Never collected';
  const n = daysBetween(day, today);
  if (n <= 0) return 'Today';
  return n === 1 ? 'Yesterday' : `${n} days ago`;
};

/** The cohorts present, in the usual order, for the filter. */
export const cohortsIn = (centres) => {
  const order = ['tuesday', 'thursday'];
  return [...new Set(centres.map((c) => c.cohort).filter(Boolean))]
    .sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) || a.localeCompare(b));
};

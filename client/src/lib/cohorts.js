// ─────────────────────────────────────────────────────────────
// src/lib/cohorts.js
//
// The collection cohorts: the days a centre collects its pallet. The two
// values beneficiaries.cohort and picking_slips.cohort hold, and how
// each is shown. One list, so a form, a filter and a printed slip
// cannot disagree.
// ─────────────────────────────────────────────────────────────

export const COHORT_OPTIONS = [
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'thursday', label: 'Thursday' },
];

export const COHORT_LABELS = Object.fromEntries(COHORT_OPTIONS.map((o) => [o.value, o.label]));

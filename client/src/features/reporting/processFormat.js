// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/processFormat.js
//
// Wording and export rows for the process map (ProcessMap.jsx). Kept
// out of the component file so that file exports only components.
// ─────────────────────────────────────────────────────────────

/** Hours as a person would say them: 20 min, 3.5 hours, 2.1 days. */
export const duration = (hours) => {
  if (hours === null || hours === undefined) return 'No data';
  if (hours * 60 < 1) return 'Under a minute';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Number(hours.toFixed(1))} ${Number(hours.toFixed(1)) === 1 ? 'hour' : 'hours'}`;
  return `${Number((hours / 24).toFixed(1))} days`;
};

// Every arrow of every lane as rows, for the Excel sheet.
export const sheetRows = (data) => data.lanes.flatMap((lane) => lane.transitions.map((t) => ({
  lane: lane.label,
  step: t.label,
  cases: t.cases,
  median: t.medianHours,
  average: t.averageHours,
  p90: t.p90Hours,
  basis: lane.estimate ? 'Estimate (FIFO allocation)' : 'Recorded timestamps',
})));

export const SHEET_COLUMNS = [
  { key: 'lane', label: 'Stage', kind: 'text' },
  { key: 'step', label: 'Step', kind: 'text' },
  { key: 'cases', label: 'Sample size', kind: 'number' },
  { key: 'median', label: 'Median (hours)', kind: 'number' },
  { key: 'average', label: 'Mean (hours)', kind: 'number' },
  { key: 'p90', label: '90th percentile (hours)', kind: 'number' },
  { key: 'basis', label: 'Basis', kind: 'text' },
];

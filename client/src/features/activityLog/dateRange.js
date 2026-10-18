// ─────────────────────────────────────────────────────────────
// client/src/features/activityLog/dateRange.js
//
// The range both Activity log views open on: the last 30 days, today
// included. Widen it with the date boxes.
// ─────────────────────────────────────────────────────────────
export const DEFAULT_RANGE_DAYS = 30;

export const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export const defaultFrom = () => isoDaysAgo(DEFAULT_RANGE_DAYS - 1);
export const defaultTo = () => isoDaysAgo(0);

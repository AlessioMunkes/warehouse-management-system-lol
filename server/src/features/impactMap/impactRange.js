// ─────────────────────────────────────────────────────────────
// server/src/features/impactMap/impactRange.js
//
// The Impact map's period: which calendar days count. Days are South
// African calendar days ('YYYY-MM-DD'), the same days every report
// uses, so "the last 90 days" never shifts by the two hours between
// UTC and SAST. `today` is passed in (todayInSAST() in the service),
// which keeps this free of a clock and testable.
//
//   no dates   the last DEFAULT_DAYS days, today included
//   from only  from that day to today
//   to only    the DEFAULT_DAYS days ending that day
//   both       exactly those, inclusive
//
// Refused: a date that is not a real calendar day, a start after the
// end, and a range longer than the reports allow (MAX_RANGE_DAYS).
//
// No SQL and no clock here.
// ─────────────────────────────────────────────────────────────
import { MAX_RANGE_DAYS } from '../reporting/reportCatalog.js';

export const DEFAULT_DAYS = 90;

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as 'YYYY-MM-DD', or null. */
export const calendarDay = (value) => {
  if (typeof value !== 'string' || !ISO.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  // 2026-02-30 parses as 2 March; only a day that round-trips is real.
  return new Date(t).toISOString().slice(0, 10) === value ? value : null;
};

export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysInclusive = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

/** { from, to } or { error } for the query's from and to, given today. */
export const resolveRange = ({ from, to } = {}, today) => {
  const given = (v) => v !== undefined && v !== null && v !== '';
  const f = given(from) ? calendarDay(from) : null;
  const t = given(to) ? calendarDay(to) : null;
  if (given(from) && !f) return { error: 'Choose a start date as a calendar day.' };
  if (given(to) && !t) return { error: 'Choose an end date as a calendar day.' };

  const end = t ?? today;
  const start = f ?? addDays(end, -(DEFAULT_DAYS - 1));
  if (start > end) return { error: 'The start date is after the end date.' };
  if (daysInclusive(start, end) > MAX_RANGE_DAYS) return { error: `Choose a period of ${MAX_RANGE_DAYS} days or less.` };
  return { from: start, to: end };
};

export default { DEFAULT_DAYS, calendarDay, addDays, daysInclusive, resolveRange };

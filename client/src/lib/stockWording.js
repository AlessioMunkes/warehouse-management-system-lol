// ─────────────────────────────────────────────────────────────
// client/src/lib/stockWording.js
//
// How the stock outlook and planner SAY things, in one place:
//
//   units       "1 crate", "15 crates", "30 kg". Weights, volumes and
//               "each" never change; counted containers do. The server
//               has the same list (features/units/pluralUnit.js).
//   cover time  how long stock lasts, in the unit that reads best and
//               always rounded DOWN, never up:
//                 under 2 weeks     days only        "10 days"
//                 2 to 4 weeks      weeks and days   "3 weeks, 2 days", "3 weeks"
//                 over 4 weeks      whole weeks      "7 weeks", "24 weeks"
//               Never a decimal week. Nothing left is not a time at all:
//               the caller says so in its own words (NONE_AVAILABLE).
//   weekly use  "50 kg a week", and under one unit a week, which is a
//               fiddly decimal, "about 3 crates a month".
// ─────────────────────────────────────────────────────────────
import { fmtQty, qty } from './quantity';

const PLURAL = { bag: 'bags', box: 'boxes', crate: 'crates', punnet: 'punnets' };
const SINGULAR = Object.fromEntries(Object.entries(PLURAL).map(([one, many]) => [many, one]));

export const NONE_AVAILABLE = 'None available';

/** The unit as it reads after `n`: one is singular, anything else plural. */
export const pluralUnit = (unit, n) => {
  if (!unit) return '';
  return Number(n) === 1 ? (SINGULAR[unit] ?? unit) : (PLURAL[unit] ?? unit);
};

/** "15 crates", "1 crate", "2.5 kg"; the dash for nothing. */
export const fmtQtyUnit = (value, unit, dash = '-') => {
  const n = qty(value);
  return n === null ? dash : fmtQty(n, pluralUnit(unit, n));
};

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * How long stock lasts, from whole days (already rounded down). Null for
 * nothing left, or no figure, so the caller can say that its own way.
 */
export const coverText = (wholeDays) => {
  const days = Math.floor(Number(wholeDays));
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days < 14) return count(days, 'day');
  const weeks = Math.floor(days / 7);
  if (days < 28) {
    const left = days % 7;
    return left === 0 ? count(weeks, 'week') : `${count(weeks, 'week')}, ${count(left, 'day')}`;
  }
  return count(weeks, 'week');
};

const WEEKS_PER_MONTH = 52 / 12;

/** "50 kg a week", or under one a week "about 3 crates a month". */
export const weeklyUseText = (weekly, unit) => {
  const n = Number(weekly);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1) return `${fmtQtyUnit(n, unit)} a week`;
  const month = Math.round(n * WEEKS_PER_MONTH);
  const one = pluralUnit(unit, 1);
  return month < 1
    ? `less than 1${one ? ` ${one}` : ''} a month`
    : `about ${fmtQtyUnit(month, unit)} a month`;
};

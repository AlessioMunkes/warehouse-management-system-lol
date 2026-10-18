// ─────────────────────────────────────────────────────────────
// server/src/features/calendar/saPublicHolidays.js
//
// South Africa's public holidays for a year, as the Public Holidays Act
// sets them: the twelve fixed and Easter-based days, plus the Monday
// after any that falls on a Sunday. Pure: no database, no clock.
//
// Days the President declares once-off (an election day, a sports win)
// are not predictable, so a manager adds those as closures by hand.
// ─────────────────────────────────────────────────────────────

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const shift = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekday = (isoDate) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();   // 0 = Sunday

// Easter Sunday — the anonymous Gregorian algorithm.
export const easterSunday = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
};

/** [{ date: 'YYYY-MM-DD', label }] for the year, in date order. */
export const saPublicHolidays = (year) => {
  const easter = easterSunday(year);
  const days = [
    { date: iso(year, 1, 1),   label: 'New Year’s Day' },
    { date: iso(year, 3, 21),  label: 'Human Rights Day' },
    { date: shift(easter, -2), label: 'Good Friday' },
    { date: shift(easter, 1),  label: 'Family Day' },
    { date: iso(year, 4, 27),  label: 'Freedom Day' },
    { date: iso(year, 5, 1),   label: 'Workers’ Day' },
    { date: iso(year, 6, 16),  label: 'Youth Day' },
    { date: iso(year, 8, 9),   label: 'National Women’s Day' },
    { date: iso(year, 9, 24),  label: 'Heritage Day' },
    { date: iso(year, 12, 16), label: 'Day of Reconciliation' },
    { date: iso(year, 12, 25), label: 'Christmas Day' },
    { date: iso(year, 12, 26), label: 'Day of Goodwill' },
  ];
  // A holiday on a Sunday moves the day off to the Monday after.
  const taken = new Set(days.map((d) => d.date));
  const observed = days
    .filter((d) => weekday(d.date) === 0)
    .map((d) => ({ date: shift(d.date, 1), label: `${d.label} (observed)` }))
    .filter((d) => !taken.has(d.date));
  return [...days, ...observed].sort((x, y) => x.date.localeCompare(y.date));
};

export default saPublicHolidays;

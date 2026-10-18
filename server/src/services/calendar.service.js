// ─────────────────────────────────────────────────────────────
// server/src/services/calendar.service.js
//
// The operating calendar: which weekday each cohort collects on, and
// the days the warehouse is shut (public holidays and closures).
//
// Read by three other parts of the system, through closureOn() and
// cohortForDate():
//   • collection reminders — none are queued or sent for a closed day
//   • the non-collection sweep — pallets due on a closed day are not
//     written off as not collected
//   • picking slip generation — the weekly run refuses a closed day,
//     and a cohort's day is the one set here
// ─────────────────────────────────────────────────────────────
import settings from './settings.service.js';
import repo from '../repositories/calendar.repository.js';
import { saPublicHolidays } from '../features/calendar/saPublicHolidays.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

export const COHORTS = ['tuesday', 'thursday'];
const KEY_FOR_COHORT = {
  tuesday:  'calendar.tuesdayCohortWeekday',
  thursday: 'calendar.thursdayCohortWeekday',
};
export const KINDS = ['public_holiday', 'closure'];
const MAX_RANGE_DAYS = 62;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value) => {
  if (typeof value !== 'string' || !ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// 1 = Monday … 7 = Sunday, the way the settings count.
const isoWeekday = (isoDate) => ((new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** { tuesday: 2, thursday: 4 } — the weekday (1 Monday … 6 Saturday) each cohort collects. */
export const cohortWeekdays = async () => {
  const all = await settings.getAll();
  return Object.fromEntries(COHORTS.map((c) => [c, all[KEY_FOR_COHORT[c]]]));
};

/** The cohort that collects on this date, or null. */
export const cohortForDate = async (isoDate) => {
  const days = await cohortWeekdays();
  const wd = isoWeekday(isoDate);
  return COHORTS.find((c) => days[c] === wd) ?? null;
};

/**
 * The closure on this date, or null if the warehouse is open. Never
 * throws: if the calendar cannot be read, the warehouse is treated as
 * open, so a database hiccup cannot stop reminders or the sweep for
 * every day.
 */
export const closureOn = async (isoDate) => {
  try {
    return await repo.findByDate(isoDate);
  } catch (err) {
    console.error('[calendar] Treating the day as open; could not read closures:', err.message);
    return null;
  }
};

export const getCalendar = async ({ from } = {}) => {
  if (from !== undefined && !isRealDate(from)) throw fail(400, 'From must be a date in YYYY-MM-DD form.');
  try {
    const [cohorts, closures] = await Promise.all([cohortWeekdays(), repo.list({ from: from ?? null })]);
    return { cohorts, closures };
  } catch (err) {
    // 42P01: the table is not there — migration 034 has not been run on
    // this database. Say so, rather than a generic failure.
    if (err.code === '42P01') {
      throw fail(503, 'The operating calendar is not set up on this database yet (migration 034_create_operating_closures.sql).');
    }
    throw err;
  }
};

export const setCohortDays = async (body, user) => {
  const changes = {};
  for (const cohort of COHORTS) {
    if (body?.[cohort] === undefined) continue;
    const weekday = Number(body[cohort]);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 6) {
      throw fail(400, 'A collection day must be Monday to Saturday.');
    }
    changes[KEY_FOR_COHORT[cohort]] = weekday;
  }
  if (Object.keys(changes).length === 0) throw fail(400, 'Send the collection day for at least one cohort.');
  await settings.update(changes, user?.id);
  return cohortWeekdays();
};

/** Closes a date, or every date from `date` to `endDate`. */
export const addClosure = async (body, user) => {
  const { date, endDate, kind = 'closure' } = body ?? {};
  const label = String(body?.label ?? '').trim();
  if (!isRealDate(date)) throw fail(400, 'Choose the date the warehouse is closed.');
  if (endDate !== undefined && endDate !== null && endDate !== '' && !isRealDate(endDate)) {
    throw fail(400, 'The last day must be a date in YYYY-MM-DD form.');
  }
  if (!KINDS.includes(kind)) throw fail(400, 'Choose public holiday or closure.');
  if (!label) throw fail(400, 'Say why the warehouse is closed.');
  if (label.length > 120) throw fail(400, 'Keep the reason under 120 characters.');

  const last = endDate || date;
  if (last < date) throw fail(400, 'The last day cannot be before the first.');
  const days = [];
  for (let d = date; d <= last; d = addDays(d, 1)) {
    days.push({ date: d, kind, label });
    if (days.length > MAX_RANGE_DAYS) throw fail(400, `Close at most ${MAX_RANGE_DAYS} days at once.`);
  }
  const created = await repo.insertMany(days, user?.id);
  return { created, alreadyClosed: days.length - created.length };
};

export const removeClosure = async (id) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw fail(400, 'Invalid closure id.');
  const removed = await repo.remove(n);
  if (!removed) throw fail(404, 'That closed day was not found.');
  return removed;
};

/** Adds South Africa's public holidays for a year; dates already closed are left alone. */
export const addPublicHolidays = async (body, user) => {
  const year = Number(body?.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw fail(400, 'Choose a year from 2020 to 2100.');
  const days = saPublicHolidays(year).map((h) => ({ ...h, kind: 'public_holiday' }));
  const created = await repo.insertMany(days, user?.id);
  return { created, alreadyClosed: days.length - created.length };
};

export default {
  cohortWeekdays, cohortForDate, closureOn,
  getCalendar, setCohortDays, addClosure, removeClosure, addPublicHolidays,
};

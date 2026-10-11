// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/periods.js
//
// The period a question names, worked out here and not by the model.
//
// "Today", "yesterday", "this week", "last 7 days", "in September":
// each has exactly one right answer for a given date, so the server
// computes it. The model still picks the report; when the question
// names one period, these dates replace whatever dates it sent
// (reportingAi.service.js). The keyword fallback uses the same reader,
// so an answer covers the same days whichever path produced it.
//
// A week starts on Monday. Every range ends today at the latest.
// ─────────────────────────────────────────────────────────────

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const addDays = (date, n) => new Date(date.getTime() + n * DAY);

const norm = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

const MONTHS = [
  ['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'],
  ['may'], ['june', 'jun'], ['july', 'jul'], ['august', 'aug'],
  ['september', 'sept', 'sep'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec'],
];
const MONTH_NAMES = MONTHS.flat().join('|');
const monthIndex = (word) => MONTHS.findIndex((names) => names.includes(word));

// "may" is also an ordinary word ("may I see"), so on its own it only
// counts as the month after a word that points at a time, or before a year.
const MONTH_LEAD = '(?:in|during|for|of|since|from|throughout)';
const NAMED_MONTH = new RegExp(
  ` (?:(since|from) (?:the )?(?:beginning|start) of |(since) )?(?:(${MONTH_LEAD}) )?(${MONTH_NAMES})(?: (20\\d\\d))? `,
);
const ISO_DAY = /\b(20\d\d-\d\d-\d\d)\b/g;

const realDay = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && iso(d) === s;
};

// Every period the question names, in the order the rules run. One
// entry is a clear instruction. Two ("this month against last month")
// is a comparison the dates alone cannot settle, so callers that
// override the model only do so for exactly one.
export const findPeriods = (question, todayISO) => {
  const q = norm(question);
  const [y, m, d] = todayISO.split('-').map(Number);
  const today = utc(y, m - 1, d);
  const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
  const found = [];
  const add = (from, to, label) => {
    const end = to > today ? today : to;
    if (from <= end) found.push({ from: iso(from), to: iso(end), label });
  };

  if (/ (today|todays|so far today) /.test(q)) add(today, today, 'today');
  if (/ (yesterday|yesterdays) /.test(q)) add(addDays(today, -1), addDays(today, -1), 'yesterday');
  if (/ (this week|week so far|current week) /.test(q)) add(monday, today, 'this week');
  if (/ (last|previous) week /.test(q)) add(addDays(monday, -7), addDays(monday, -1), 'last week');
  if (/ (this month|month so far|current month|month to date) /.test(q)) add(utc(y, m - 1, 1), today, 'this month');
  if (/ (last|previous) month /.test(q)) add(utc(y, m - 2, 1), utc(y, m - 1, 0), 'last month');
  if (/ (this year|year so far|year to date|current year) /.test(q)) add(utc(y, 0, 1), today, 'this year');
  if (/ (last|previous) year /.test(q)) add(utc(y - 1, 0, 1), utc(y - 1, 11, 31), 'last year');

  // "last 7 days", "past 2 weeks", "previous 6 months". Days count
  // today, so the last 7 days are today and the six before it.
  const n = / (?:last|past|previous) (\d{1,3}) (day|week|month|year)s? /.exec(q);
  if (n) {
    const count = Number(n[1]);
    const unit = n[2];
    if (count > 0) {
      const from = unit === 'day' ? addDays(today, -(count - 1))
        : unit === 'week' ? addDays(today, -count * 7)
        : unit === 'month' ? utc(y, m - 1 - count, d)
        : utc(y - count, m - 1, d);
      add(from, today, `last ${count} ${unit}${count === 1 ? '' : 's'}`);
    }
  }
  if (/ past week /.test(q)) add(addDays(today, -6), today, 'last 7 days');
  if (/ past month /.test(q)) add(addDays(today, -29), today, 'last 30 days');

  // Dates written out: one is that day, two are a range.
  const days = [...q.matchAll(ISO_DAY)].map((hit) => hit[1]).filter(realDay).sort();
  if (days.length === 1) add(new Date(`${days[0]}T00:00:00Z`), new Date(`${days[0]}T00:00:00Z`), days[0]);
  if (days.length >= 2) {
    add(new Date(`${days[0]}T00:00:00Z`), new Date(`${days[days.length - 1]}T00:00:00Z`), `${days[0]} to ${days[days.length - 1]}`);
  }

  // "in September", "September 2026", "since the beginning of August".
  // A month with no year is the most recent one that has started.
  const named = NAMED_MONTH.exec(q);
  if (named) {
    const [, sinceStart, since, lead, word, yearText] = named;
    const index = monthIndex(word);
    const pointed = sinceStart || since || lead || yearText;
    if (index >= 0 && (word !== 'may' || pointed)) {
      const year = yearText ? Number(yearText) : (index <= m - 1 ? y : y - 1);
      const start = utc(year, index, 1);
      const open = sinceStart || since || lead === 'since' || lead === 'from';
      const name = MONTHS[index][0];
      const title = `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
      if (open) add(start, today, `since ${title}`);
      else add(start, utc(year, index + 1, 0), title);
    }
  }

  return found;
};

// The first period named, or null when the question names none.
export const periodFromQuestion = (question, todayISO) => findPeriods(question, todayISO)[0] ?? null;

// The one period to hold the model to: null when the question names
// none, or more than one.
export const singlePeriod = (question, todayISO) => {
  const found = findPeriods(question, todayISO);
  return found.length === 1 ? found[0] : null;
};

export default { findPeriods, periodFromQuestion, singlePeriod };

// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/dateRanges.js
//
// Date presets, resolved in SAST.
//
// Every browser here runs in Africa/Johannesburg, but the server
// runs UTC on Render, so "today" has to be computed the same way on
// both sides or a report run at 01:00 would silently ask for
// yesterday. The server uses the same +2h shift in
// reporting.service.js — keep them in step.
// ─────────────────────────────────────────────────────────────

const sastNow = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

const iso = (d) => d.toISOString().slice(0, 10);

// Month arithmetic on a UTC-shifted date. Day is pinned to 1 before
// shifting the month so a 31st does not roll into the next month.
const shiftMonths = (date, months) => {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
};

const shiftDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

// A week starts on Monday, the same as the server (periods.js).
const startOfWeek = (date) => shiftDays(date, -((date.getUTCDay() + 6) % 7));

// The Impact report's periods: the usual ones, then everything.
export const CUMULATIVE_PRESET = { id: 'all_time', label: 'Cumulative' };

export const RANGE_PRESETS = [
  { id: 'today',        label: 'Today' },
  { id: 'yesterday',    label: 'Yesterday' },
  { id: 'this_week',    label: 'This week' },
  { id: 'last_week',    label: 'Last week' },
  { id: 'last_7d',      label: 'Last 7 days' },
  { id: 'last_30d',     label: 'Last 30 days' },
  { id: 'this_month',   label: 'This month' },
  { id: 'last_month',   label: 'Last month' },
  { id: 'last_3m',      label: 'Last 3 months' },
  { id: 'last_6m',      label: 'Last 6 months' },
  { id: 'this_year',    label: 'This year' },
  { id: 'custom',       label: 'Custom range' },
];

// Three months is the default: about 13 weekly collections per centre,
// enough for the compliance charts to show a pattern.
export const DEFAULT_PRESET = 'last_3m';

export const resolvePreset = (id) => {
  const today = sastNow();

  const startOfMonth = (d) => {
    const s = new Date(d);
    s.setUTCDate(1);
    return s;
  };

  switch (id) {
    case 'today':
      return { from: iso(today), to: iso(today) };

    case 'yesterday':
      return { from: iso(shiftDays(today, -1)), to: iso(shiftDays(today, -1)) };

    case 'this_week':
      return { from: iso(startOfWeek(today)), to: iso(today) };

    case 'last_week': {
      const monday = startOfWeek(today);
      return { from: iso(shiftDays(monday, -7)), to: iso(shiftDays(monday, -1)) };
    }

    // Today and the six days before it.
    case 'last_7d':
      return { from: iso(shiftDays(today, -6)), to: iso(today) };

    case 'last_30d':
      return { from: iso(shiftDays(today, -29)), to: iso(today) };

    case 'this_month':
      return { from: iso(startOfMonth(today)), to: iso(today) };

    case 'last_month': {
      const start = startOfMonth(shiftMonths(today, -1));
      const end   = new Date(startOfMonth(today));
      end.setUTCDate(0);            // last day of the previous month
      return { from: iso(start), to: iso(end) };
    }

    case 'last_3m':
      return { from: iso(startOfMonth(shiftMonths(today, -2))), to: iso(today) };

    case 'last_6m':
      return { from: iso(startOfMonth(shiftMonths(today, -5))), to: iso(today) };

    case 'this_year': {
      const start = new Date(today);
      start.setUTCMonth(0, 1);
      return { from: iso(start), to: iso(today) };
    }

    // Cumulative: the longest period a report covers (MAX_RANGE_DAYS on
    // the server, 730 days), today included. Only the Impact screens
    // offer it.
    case 'all_time':
      return { from: iso(shiftDays(today, -729)), to: iso(today) };

    default:
      return { from: iso(startOfMonth(shiftMonths(today, -2))), to: iso(today) };
  }
};

export const todaySAST = () => iso(sastNow());

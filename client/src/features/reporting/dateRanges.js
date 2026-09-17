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

export const RANGE_PRESETS = [
  { id: 'this_month',   label: 'This month' },
  { id: 'last_month',   label: 'Last month' },
  { id: 'last_3m',      label: 'Last 3 months' },
  { id: 'last_6m',      label: 'Last 6 months' },
  { id: 'this_year',    label: 'This year' },
  { id: 'custom',       label: 'Custom range' },
];

// Three months is the default: ~6 fortnightly cycles, enough for the
// compliance and non-collection charts to show a pattern rather than
// a single data point.
export const DEFAULT_PRESET = 'last_3m';

export const resolvePreset = (id) => {
  const today = sastNow();

  const startOfMonth = (d) => {
    const s = new Date(d);
    s.setUTCDate(1);
    return s;
  };

  switch (id) {
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

    default:
      return { from: iso(startOfMonth(shiftMonths(today, -2))), to: iso(today) };
  }
};

export const todaySAST = () => iso(sastNow());

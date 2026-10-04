// ─────────────────────────────────────────────────────────────
// client/src/features/pickingSlips/slipViews.js
//
// What each Picking Slips tab means, and the week the list covers, in
// one place with no React in it — the tab counts, the rows a tab shows
// and the badge on each row read the same rules.
//
// A SLIP'S STATE IS TWO THINGS
// picking_slips.status says how far packing got (pending → in_progress
// → complete → dispatched). What happened at the gate is a separate
// record, dispatch_events.status, and it is the one that knows a pallet
// was not collected. slipState folds the second over the first, so a
// pallet nobody came for reads "Not collected", not "Dispatched".
// ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Week ──────────────────────────────────────────────────────
// Monday to Sunday, as 'YYYY-MM-DD'. Worked on UTC midnights so the
// browser's own timezone cannot move a day.
const parseDay = (day) => new Date(`${day}T00:00:00Z`);
const toDay = (date) => date.toISOString().slice(0, 10);

export const todaySast = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(now);

export const weekOf = (day) => {
  const d = parseDay(day);
  const fromMonday = (d.getUTCDay() + 6) % 7;            // Monday = 0
  const from = new Date(d.getTime() - fromMonday * DAY_MS);
  return { from: toDay(from), to: toDay(new Date(from.getTime() + 6 * DAY_MS)) };
};

export const shiftWeek = (week, by) => weekOf(toDay(new Date(parseDay(week.from).getTime() + by * 7 * DAY_MS)));

const fmt = (day, opts) => parseDay(day).toLocaleDateString('en-ZA', { timeZone: 'UTC', ...opts });

export const weekLabel = ({ from, to }) =>
  `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;

export const dayLabel = (day) => (day ? fmt(day, { weekday: 'short', day: 'numeric', month: 'short' }) : '—');

// ── State ─────────────────────────────────────────────────────
export const slipState = (slip) => {
  if (slip.status === 'cancelled') return 'cancelled';
  if (slip.dispatch_status === 'not_collected') return 'not_collected';
  if (slip.dispatch_status === 'collected' || slip.dispatch_status === 'late_collected') return 'collected';
  if (slip.status === 'collected') return 'collected';
  return slip.status;
};

export const SLIP_STATE_LABEL = {
  pending:       'Unassigned',
  in_progress:   'Packing',
  complete:      'Ready at gate',
  dispatched:    'Dispatched',
  collected:     'Collected',
  not_collected: 'Not collected',
  cancelled:     'Cancelled',
};

// A guest volunteer holds a slip through assigned_volunteer_id, not as a
// packer, so it needs its own label or the slip reads as unassigned.
export const volunteerHolder = (slip) => {
  if (!slip.assigned_volunteer_id) return '';
  return slip.volunteer_name ? `Volunteer: ${slip.volunteer_name}` : 'Volunteer';
};

// Who holds it, for the Packer column and the panel.
export const packers = (slip) =>
  [slip.packer_name, slip.packer_name_2, volunteerHolder(slip)].filter(Boolean).join(' & ');

// ── Views (the tabs) ──────────────────────────────────────────
// `id` is what goes in ?status=, the value the dashboard's Needs
// attention list links to.
export const VIEWS = [
  { id: 'all',          label: 'All this week', test: () => true },
  { id: 'unassigned',   label: 'Unassigned',    test: (s) => slipState(s) === 'pending' },
  { id: 'packing',      label: 'Packing',       test: (s) => slipState(s) === 'in_progress' },
  { id: 'ready',        label: 'Ready at gate', test: (s) => slipState(s) === 'complete' },
  { id: 'notcollected', label: 'Not collected', alert: true, test: (s) => slipState(s) === 'not_collected' },
];

export const viewById = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];

export const countViews = (slips) =>
  Object.fromEntries(VIEWS.map((v) => [v.id, slips.filter(v.test).length]));

export const filterSlips = (slips, { view = 'all', search = '' } = {}) => {
  const v = viewById(view);
  const q = search.trim().toLowerCase();
  return slips.filter((s) => v.test(s) && (!q || s.ecd_name?.toLowerCase().includes(q)));
};

// What a bulk action can act on. Release only takes a pallet someone
// holds; assigning works on anything still on the floor or in hand —
// a packed, dispatched or cancelled slip is finished.
export const canRelease = (slip) => slip.status === 'in_progress';
export const canAssign = (slip) => slip.status === 'pending' || slip.status === 'in_progress';

// ─────────────────────────────────────────────────────────────
// client/src/features/packing/spareSlips.js
//
// What "spare" means, shared by StaffSlipList (the Spare slips tab)
// and useSpareSlipAlert (the Packing tab's new-activity badge) so the
// two can never drift into disagreeing about which slips count.
// ─────────────────────────────────────────────────────────────

// NOT toISOString().slice(0, 10) — that formats in UTC, and Cape Town
// is UTC+2, so between midnight and 02:00 SAST it would return
// yesterday's date and a worker opening the app early would see zero
// spare slips even though today's batch is sitting right there.
export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const isSpareSlip = (slip) => !slip.assigned_to && slip.status === 'pending';

// The dispatch dates the floor shows: this week from Monday, through the
// next seven days. It used to be today only, so a slip made on Monday
// for Tuesday could not be seen or claimed until Tuesday — unless a
// manager assigned it to someone by name, which is what they ended up
// doing. Starting at Monday keeps a pallet nobody packed on its day.
// The server's guest list uses the same window (slipAccess.service.js).
export const floorWindow = (now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (day.getDay() + 6) % 7;
  const from = new Date(day); from.setDate(day.getDate() - sinceMonday);
  const to = new Date(day); to.setDate(day.getDate() + 7);
  return { from: iso(from), to: iso(to) };
};

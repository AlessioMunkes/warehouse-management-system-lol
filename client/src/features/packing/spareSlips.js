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

// ─────────────────────────────────────────────────────────────
// client/src/features/activityLog/fmtDateTime.js
//
// Warehouse time, always. A timestamptz rendered in the reader's own
// zone would put a 09:00 arrival at 07:00 for anyone looking from the
// UK, and both logs are a record of what happened at a building in
// Cape Town.
// ─────────────────────────────────────────────────────────────
const SAST = 'Africa/Johannesburg';

export const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: SAST,
  });
};

export default fmtDateTime;

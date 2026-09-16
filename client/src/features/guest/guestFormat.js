// ─────────────────────────────────────────────────────────────
// client/src/features/guest/guestFormat.js
//
// Formatting helpers for the guest screens. Split out of
// GuestPrimitives.jsx because that file exports components and mixing
// the two breaks React Fast Refresh.
// ─────────────────────────────────────────────────────────────

// The API sends a plain calendar day ("2026-09-16") precisely so it is
// not shifted by a timezone.
//
// Parse the parts by hand. `new Date("2026-09-16")` is parsed as UTC
// midnight and then rendered in local time, which is how "16 September"
// becomes "15 September" on a machine west of Greenwich — and the
// mirror image of the bug this had on the server in Phase 1, where a
// UTC+2 box serialised the same date back as 22:00 the previous day.
//
// Building the Date from (y, m-1, d) makes it local midnight, which is
// the calendar day the warehouse means.
export const formatDay = (isoDay) => {
  if (typeof isoDay !== 'string') return 'soon';
  const [y, m, d] = isoDay.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 'soon';

  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);

  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
};

// "Thabo Mokoena" -> "Thabo". A corporate group signs in under one
// name ("Corporate group (Old Mutual)"), so a group keeps its opening
// word rather than being mangled into something that is not a name.
export const firstNameOf = (full, fallback = 'there') =>
  (full || '').trim().split(/\s+/)[0] || fallback;

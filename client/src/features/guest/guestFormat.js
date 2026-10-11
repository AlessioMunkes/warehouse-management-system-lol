// ─────────────────────────────────────────────────────────────
// client/src/features/guest/guestFormat.js
//
// Formatting helpers for the guest screens. Split out of
// GuestPrimitives.jsx because that file exports components and mixing
// the two breaks React Fast Refresh.
//
// Words come from translations/messages.js (guest.day.*, guest.kind.*).
// Each helper takes the screen's own `t` so it re-renders with the
// language; with none it reads the language currently chosen.
// ─────────────────────────────────────────────────────────────
import { getLanguage, translator } from '../../translations';

const tFor = (t) => t ?? translator(getLanguage());

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
export const formatDay = (isoDay, t) => {
  const tr = tFor(t);
  if (typeof isoDay !== 'string') return tr('guest.day.soon');
  const [y, m, d] = isoDay.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return tr('guest.day.soon');

  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);

  if (days === 0) return tr('guest.day.today');
  if (days === 1) return tr('guest.day.tomorrow');
  return date.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
};

// ── Who the food is for ───────────────────────────────────────
// picking_slips.beneficiary_kind is the Postgres enum `beneficiary_type`
// with exactly four values. The guest copy used to say "creche" for
// every one of them, so Rondebosch Soup Kitchen read as
// "Food for a creche".
//
// Plain language, for someone who has never been in the building
// before (ACC-09) — so "creche" rather than "ECD", which is a sector
// term a first-time volunteer has no reason to know.
//
// Each key holds the whole phrase, article included ("a creche"), so a
// language with no articles, or different ones, is free to word it.
const BENEFICIARY_KINDS = ['ecd', 'dignity_kitchen', 'soup_kitchen', 'community'];

// An unrecognised value falls back to neutral wording rather than
// printing a raw enum like "dignity_kitchen" at a volunteer.
export const beneficiaryKind = (kind, t) =>
  tFor(t)(BENEFICIARY_KINDS.includes(kind) ? `guest.kind.${kind}` : 'guest.kind.other');

// "Food for a soup kitchen"
export const foodForPhrase = (kind, t) => tFor(t)('guest.foodFor', { kind: beneficiaryKind(kind, t) });

// The name to greet somebody by: the whole thing, exactly as they
// typed it.
//
// This used to return only the first whitespace-delimited word, which
// was wrong in every interesting case and wrong in a way that reads as
// carelessness to the person it is addressed to:
//
//   "Test Tester"                  -> "Welcome, Test"
//   "Corporate group (Old Mutual)" -> "Welcome, Corporate"
//   "Mary Anne"                    -> "Welcome, Mary"
//
// NFR-19 is to greet them by the name they signed in with, and the
// live data already contains group names and two-part first names. The
// database stores the full string; nothing server-side shortens it —
// the API sends volunteers.full_name intact, under a field that is
// unhelpfully called `firstName` because staff reuse the same shape.
//
// A long name is a LAYOUT problem, and it is solved in CSS
// (.gst-name wraps and breaks). It is never solved by throwing away
// part of what somebody told us their name is.
export const displayName = (full, t) =>
  (typeof full === 'string' ? full.trim() : '') || tFor(t)('guest.name.fallback');

// Marks a part of a translated sentence to be shown in bold by <Rich>
// (GuestPrimitives.jsx): t('guest.done.goesTo', { beneficiary: mark('beneficiary') }).
export const RICH_MARK = '\u0001';
export const mark = (name) => `${RICH_MARK}${name}${RICH_MARK}`;

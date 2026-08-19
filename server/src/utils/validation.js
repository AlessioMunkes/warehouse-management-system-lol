// ─────────────────────────────────────────────────────────────
// server/src/utils/validation.js
//
// Value-shape checks that more than one service needs to agree on.
//
// These started life as private copies inside dispatch.service.js.
// The moment delivery.service.js needed the same date check, copying
// it would have created exactly the drift that has already bitten
// this project twice — the movement_type constraint and the role
// constants both went wrong because the same fact was written down in
// more than one place and then only half of it was updated. Same
// reasoning as committedStock.sql.js, bagSizes.js and paths.js: one
// definition, imported.
//
// Deliberately NOT middleware. validate.middleware.js checks route
// PARAMS and answers with a 400 itself; these are pure predicates a
// service calls on a body or query value and decides what to do
// about. Keeping them apart stops the middleware growing a second,
// subtly different date check of its own.
// ─────────────────────────────────────────────────────────────

// ── Dates from a client ───────────────────────────────────────
// new Date(x) is far too generous to validate with: it accepts
// "Mon Aug 17 2026", browser-specific junk, and anything else its
// fallback parser feels like taking, so Number.isNaN on the result
// passes strings Postgres then rejects mid-statement as a 500.
//
// Calendar-checked, not just shape-checked, so 2026-02-30 and
// 2025-02-29 fail here rather than in the database.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isValidDateString = (value) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y
      && probe.getUTCMonth() === m - 1
      && probe.getUTCDate() === d;
};

// ── Identifiers ───────────────────────────────────────────────
// Number('') is 0 and Number.isInteger(0) is true, which is how an
// empty id has twice now been read as "record zero" and quietly
// returned nothing instead of an error. Row ids in this schema are
// all SERIAL, so zero and negatives are never valid.
export const isPositiveInt = (value) => {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
};

// ── Idempotency keys ──────────────────────────────────────────
// Shape only. A replay key is not a credential — it decides whether a
// write is a retry, not whether the caller is allowed to make it — so
// a collision is a client bug rather than an attack surface. The
// check exists so a client sending something that is not a key at all
// finds out immediately instead of silently losing replay protection.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

export default { isValidDateString, isPositiveInt, isUuid };
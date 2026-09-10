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

// ── Stock units ───────────────────────────────────────────────
// This list is not a preference, it is a CHECK constraint:
// stock_levels_unit_check and stock_movements_unit_check both allow
// exactly these nine values, and stock_levels.unit is NOT NULL. A
// tenth value does not degrade gracefully — it is a 23514 mid-INSERT,
// which surfaces as a 500 with a Postgres sentence in it.
//
// Written down here for the same reason isValidDateString is: more
// than one service needs to agree on it. donation.service.js's
// ALLOWED_UNITS and DonationItemsList.jsx's UNITS are the same nine
// values copied out by hand — the drift this file's header warns
// about, already in progress. Folding those two into this export is
// worth doing, but it belongs in a change that reruns the donation
// suite rather than this one.
export const STOCK_UNITS = ['kg', 'g', 'l', 'ml', 'each', 'bag', 'box', 'crate', 'punnet'];

export const isStockUnit = (value) =>
  typeof value === 'string' && STOCK_UNITS.includes(value);

// ── Idempotency keys ──────────────────────────────────────────
// Shape only. A replay key is not a credential — it decides whether a
// write is a retry, not whether the caller is allowed to make it — so
// a collision is a client bug rather than an attack surface. The
// check exists so a client sending something that is not a key at all
// finds out immediately instead of silently losing replay protection.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

export default { isValidDateString, isPositiveInt, isUuid, STOCK_UNITS, isStockUnit };
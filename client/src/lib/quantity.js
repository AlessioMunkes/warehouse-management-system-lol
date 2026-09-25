// ─────────────────────────────────────────────────────────────
// client/src/lib/quantity.js
// @sentinel script-54-quantity-format
//
// One way to print a quantity, for every screen.
//
// Postgres `numeric` columns come back from node-postgres as STRINGS,
// digits and all: a crate of butternut arrives as "1.000" and thirty
// kilos of maize as "30.000". Printed straight into the page — or,
// worse, into a number box somebody is about to retype — that reads
// as a precision nobody measured and a value nobody typed.
//
// fmtQty trims the tail rather than rounding to a whole number: 1.000
// prints as 1, but a decanted 2.5 kg stays 2.5. Weights on this system
// are real numbers and rounding them at the display layer would report
// the wrong mass on a dispatch note. "Integers where they are
// integers" is the rule; three decimal places is the storage format,
// not something a person needs to read.
//
// qtyInput is the same thing for a controlled <input value>: the empty
// string for nothing, never "—".
//
// This lives in lib/ because receipts, dispatch, packing, receiving,
// donations and the ledger all need it, and a second copy of a
// formatter is how the movement_type constants drifted.
// ─────────────────────────────────────────────────────────────

// pg hands us numerics as strings; Number() them at the edge.
export const qty = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// "1.000" → "1", "2.500" → "2.5", null → "—" (or the dash you pass).
export const fmtQty = (value, unit, dash = '—') => {
  const n = qty(value);
  if (n === null) return dash;
  const text = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
  return unit ? `${text} ${unit}` : text;
};

// For a controlled input: nothing is an empty box, not a dash.
export const qtyInput = (value) => fmtQty(value, null, '');

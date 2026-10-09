// ─────────────────────────────────────────────────────────────
// server/src/features/units/wholeItems.js
//
// A can is a can. Only a product marked decantable (kept loose and
// portioned out: maize meal, rice, oil) can be a part quantity; anything
// else is a whole number wherever a quantity is entered — packing,
// receiving, the gate, a stock adjustment, a benevolent request.
// (products.is_decantable, migration 044.)
//
// Each caller knows its lines by a different id, so there are three
// ways in: by product, by picking-slip item, by purchase-order item.
// All of them throw the same 400, naming the product:
//
//   "Baked Beans is counted in whole units. Enter a whole number."
//
// A DATABASE WITHOUT THE COLUMN DOES NOT BLOCK ANYONE. If the flag
// cannot be read the check is skipped: a fraction of a can on a slip is
// a nuisance, food held up by a missing column is worse.
// ─────────────────────────────────────────────────────────────
import pool from '../../config/db.js';

// Whole to six places, so 3.0000000000000004 from an honest sum counts
// as 3.
export const isWholeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(Math.round(n * 1e6) / 1e6);
};

export const wholeUnitsMessage = (name) => `${name} is counted in whole units. Enter a whole number.`;

const refuse = (name) => { throw Object.assign(new Error(wholeUnitsMessage(name)), { status: 400 }); };

// Only lines that are fractions need looking up at all.
const fractions = (lines) => (lines ?? []).filter((l) => l && l.quantity !== null && l.quantity !== undefined
  && Number.isFinite(Number(l.quantity)) && !isWholeNumber(l.quantity));

const check = async (sql, ids, db) => {
  if (ids.length === 0) return;
  let rows;
  try {
    ({ rows } = await db.query(sql, [ids]));
  } catch (err) {
    console.error('[wholeItems] not checked, carrying on:', err.message);
    return;
  }
  if (rows[0]) refuse(rows[0].name);
};

/** lines: [{ productId, quantity }] */
export const assertWholeByProduct = async (lines, db = pool) => check(
  `SELECT name FROM products WHERE id = ANY($1::int[]) AND NOT is_decantable ORDER BY name LIMIT 1`,
  fractions(lines).map((l) => Number(l.productId)).filter(Number.isInteger), db);

/** lines: [{ itemId, quantity }] — picking_slip_items.id */
export const assertWholeBySlipItem = async (lines, db = pool) => check(
  `SELECT p.name FROM picking_slip_items i JOIN products p ON p.id = i.product_id
    WHERE i.id = ANY($1::int[]) AND NOT p.is_decantable ORDER BY p.name LIMIT 1`,
  fractions(lines).map((l) => Number(l.itemId)).filter(Number.isInteger), db);

/** What may be decanted: every one of these products must be decantable. */
export const assertDecantable = async (productIds, db = pool) => {
  const ids = [...new Set((productIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return;
  let rows;
  try {
    ({ rows } = await db.query(
      `SELECT name FROM products WHERE id = ANY($1::int[]) AND NOT is_decantable ORDER BY name LIMIT 1`, [ids]));
  } catch (err) {
    console.error('[wholeItems] decantable not checked, carrying on:', err.message);
    return;
  }
  if (rows[0]) {
    throw Object.assign(
      new Error(`${rows[0].name} is not marked as decantable. An admin can change that on the Products screen.`),
      { status: 400 });
  }
};

export default { isWholeNumber, wholeUnitsMessage, assertWholeByProduct, assertWholeBySlipItem, assertDecantable };

// ─────────────────────────────────────────────────────────────
// server/src/repositories/productUnits.repository.js
//
// The lookups behind features/units/wholeItems.js: which products are
// counted in whole units (products.is_decantable is false). Each returns
// the first such product's name, alphabetically, or null when every
// product is decantable. `db` is the caller's connection or the pool.
// Errors are left to the caller, which decides whether a missing column
// blocks anyone (it does not).
// ─────────────────────────────────────────────────────────────

const firstName = async (db, sql, ids) => {
  const { rows } = await db.query(sql, [ids]);
  return rows[0]?.name ?? null;
};

export const firstWholeUnitProduct = (db, productIds) => firstName(db,
  `SELECT name FROM products WHERE id = ANY($1::int[]) AND NOT is_decantable ORDER BY name LIMIT 1`,
  productIds);

export const firstWholeUnitSlipItem = (db, slipItemIds) => firstName(db,
  `SELECT p.name FROM picking_slip_items i JOIN products p ON p.id = i.product_id
    WHERE i.id = ANY($1::int[]) AND NOT p.is_decantable ORDER BY p.name LIMIT 1`,
  slipItemIds);

export default { firstWholeUnitProduct, firstWholeUnitSlipItem };

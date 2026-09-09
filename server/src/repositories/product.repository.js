// ─────────────────────────────────────────────────────────────
// server/src/repositories/product.repository.js
//
// Data access for the product catalog. Raw pg, bound parameters
// everywhere, no dynamic SQL built from caller-supplied keys — same
// UPDATABLE whitelist approach as supplier.repository.js/
// user.repository.js.
//
// NOTHING IS EVER DELETED HERE.
// Every operational table (delivery_note_items, purchase_order_items,
// picking_slip_items, decanting_lines, dispatch_event_lines, ...)
// references products.id, most without ON DELETE CASCADE. A delete
// here would either fail against years of history or silently orphan
// it. is_active is the entire removal story, same reasoning as
// suppliers and users.
//
// category / is_perishable READ HERE ASSUME THE MIGRATION HAS RUN.
// See the handoff's phase2_products_migration.sql — until it's
// applied, every query below 500s on the missing column, the same
// class of failure receivingAPI.js already documents for
// is_perishable elsewhere in the app. That's deliberate: shipping
// this repository together with its migration is what makes that
// window a non-issue in practice, not a reason to write two versions
// of every query.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const UPDATABLE = {
  name:         'name',
  sku:          'stock_keeping_unit',
  defaultUnit:  'default_unit',
  weightKg:     'weight_kg',
  category:     'category',
  isPerishable: 'is_perishable',
};

const PRODUCT_COLUMNS = `
  p.id, p.name, p.stock_keeping_unit AS sku, p.default_unit, p.weight_kg,
  p.category, p.is_perishable, p.is_active, p.created_at
`;

// ── Read ──────────────────────────────────────────────────────
const listProducts = async ({ includeInactive = false, search = null } = {}) => {
  const params = [];
  const where = [];

  if (!includeInactive) where.push('p.is_active = true');

  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.name ILIKE $${params.length}
              OR p.stock_keeping_unit ILIKE $${params.length}
              OR p.category ILIKE $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.is_active DESC, p.name ASC`,
    params
  );
  return rows;
};

const getProductById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

// Case-insensitive on both name and SKU. Unlike suppliers.name,
// products has no live UNIQUE constraint to fall back on — this
// pre-check IS the whole duplicate-prevention story, so it has to
// catch what a DB constraint would have.
const findByNameOrSku = async (name, sku, { excludeId = null } = {}) => {
  const params = [name, sku ?? null];
  let sql = `SELECT ${PRODUCT_COLUMNS} FROM products p
             WHERE lower(p.name) = lower($1)
                OR ($2::text IS NOT NULL AND lower(p.stock_keeping_unit) = lower($2))`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND p.id <> $${params.length}`;
  }
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
};

// ── Write ─────────────────────────────────────────────────────
const insertProduct = async (payload) => {
  const { rows } = await pool.query(
    `INSERT INTO products
       (name, stock_keeping_unit, default_unit, weight_kg, category, is_perishable, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,true)
     RETURNING ${PRODUCT_COLUMNS.replace(/p\./g, '')}`,
    [
      payload.name,
      payload.sku ?? null,
      payload.defaultUnit,
      payload.weightKg ?? null,
      payload.category ?? null,
      payload.isPerishable ?? false,
    ]
  );
  return rows[0];
};

const updateProduct = async (id, patch) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return getProductById(id);

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE products SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING ${PRODUCT_COLUMNS.replace(/p\./g, '')}`,
    params
  );
  return rows[0] ?? null;
};

const setProductActive = async (id, isActive) => {
  const { rows } = await pool.query(
    `UPDATE products SET is_active = $2
      WHERE id = $1
      RETURNING ${PRODUCT_COLUMNS.replace(/p\./g, '')}`,
    [id, isActive]
  );
  return rows[0] ?? null;
};

export default {
  listProducts,
  getProductById,
  findByNameOrSku,
  insertProduct,
  updateProduct,
  setProductActive,
};

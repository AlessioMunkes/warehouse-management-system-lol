// ─────────────────────────────────────────────────────────────
// server/src/repositories/product.repository.js
//
// This repository handles all database queries for product master data
// and preset donation category mappings (BR-10 & BR-04 accountability).
// Note: The `products` table does not have an `updated_at` column, so queries
// against `products` only reference `created_at`. The `donation_routing_defaults`
// table DOES have `updated_at` for tracking when classification changes.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// ── General Product CRUD Operations ─────────────────────────

/**
 * Fetches all products from the database, sorted alphabetically by name.
 * Allows filtering by active status if requested (e.g., active-only for catalog listings).
 */
const listProducts = async ({ isActive } = {}) => {
  // We explicitly select only valid columns from `products` (avoiding SELECT * and non-existent updated_at)
  let query = `SELECT id, name, stock_keeping_unit AS sku, weight_kg, is_active, created_at FROM products`;
  const params = [];

  if (isActive !== undefined) {
    query += ` WHERE is_active = $1`;
    params.push(Boolean(isActive));
  }

  query += ` ORDER BY name ASC;`;
  const result = await pool.query(query, params);
  return result.rows;
};

/**
 * Looks up a single product by its database ID.
 * Returns the product object if found, or null if no record matches.
 */
const getProductById = async (id) => {
  const query = `
    SELECT id, name, stock_keeping_unit AS sku, weight_kg, is_active, created_at 
    FROM products 
    WHERE id = $1;
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
};

/**
 * Checks for duplicate product names or SKUs (case-insensitive search).
 * Useful for pre-validation in the service layer before attempting insertions or updates.
 */
const findByNameOrSku = async (name, sku) => {
  const query = `
    SELECT id, name, stock_keeping_unit 
    FROM products 
    WHERE LOWER(name) = LOWER($1) OR LOWER(stock_keeping_unit) = LOWER($2) 
    LIMIT 1;
  `;
  const result = await pool.query(query, [name, sku]);
  return result.rows[0] || null;
};

/**
 * Inserts a new product record into the `products` table.
 * Defaults new products to `is_active = true` and timestamps them with NOW().
 */
const createProduct = async ({ name, stockKeepingUnit, weightKg = null }) => {
  const query = `
    INSERT INTO products (name, stock_keeping_unit, weight_kg, is_active, created_at) 
    VALUES ($1, $2, $3, true, NOW()) 
    RETURNING id, name, stock_keeping_unit AS sku, weight_kg, is_active, created_at;
  `;
  const result = await pool.query(query, [name, stockKeepingUnit, weightKg]);
  return result.rows[0];
};

/**
 * Updates basic product metadata (name, SKU, and weight) for an existing product ID.
 */
const updateProduct = async (id, { name, stockKeepingUnit, weightKg = null }) => {
  const query = `
    UPDATE products 
    SET name = $1, stock_keeping_unit = $2, weight_kg = $3 
    WHERE id = $4 
    RETURNING id, name, stock_keeping_unit AS sku, weight_kg, is_active;
  `;
  const result = await pool.query(query, [name, stockKeepingUnit, weightKg, id]);
  return result.rows[0] || null;
};

/**
 * Soft-deletes or reactivates a product by toggling its `is_active` boolean flag.
 * Soft deletion ensures historical donation records tied to this product stay intact.
 */
const setActive = async (id, isActive) => {
  const query = `
    UPDATE products 
    SET is_active = $1 
    WHERE id = $2 
    RETURNING id, name, is_active;
  `;
  const result = await pool.query(query, [Boolean(isActive), id]);
  return result.rows[0] || null;
};

// ── Donation Classification Defaults (BR-10) ─────────────────

/**
 * Retrieves all products alongside any preset donation categories configured in `donation_routing_defaults`.
 * Uses LEFT JOINs so unclassified products still appear in the administrative dashboard list.
 */
const getAllProductsWithDefaults = async () => {
  const query = `
    SELECT 
      p.id, 
      p.name, 
      p.stock_keeping_unit AS sku, 
      p.is_active, 
      d.donation_category, 
      d.set_by, 
      u.first_name AS set_by_name, 
      d.created_at AS classification_created_at, 
      d.updated_at AS classification_updated_at 
    FROM products p 
    LEFT JOIN donation_routing_defaults d ON d.product_id = p.id 
    LEFT JOIN users u ON u.id = d.set_by 
    WHERE p.is_active = true
    ORDER BY p.name ASC;
  `;
  const result = await pool.query(query);
  return result.rows;
};

/**
 * Checks if a specific active product has a default donation category preset.
 * Used during donation intake to auto-fill category routing when matching a line item.
 */
const getProductRoutingDefault = async (productId) => {
  const query = `
    SELECT d.product_id, d.donation_category, p.name AS product_name 
    FROM donation_routing_defaults d 
    JOIN products p ON p.id = d.product_id 
    WHERE d.product_id = $1 AND p.is_active = true;
  `;
  const result = await pool.query(query, [productId]);
  return result.rows[0] || null;
};

/**
 * Searches active products by (partial, case-insensitive) name for the
 * staff intake "match to stock item" combobox. Wildcard metacharacters
 * in the term are escaped so a literal "%" or "_" in what staff typed is
 * matched literally, not as a pattern. Returns at most `limit` rows.
 */
const searchProductsByName = async (term, { limit = 10 } = {}) => {
  const trimmed = String(term ?? '').trim();
  if (!trimmed) return [];

  const escaped = trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const query = `
    SELECT id, name, stock_keeping_unit AS sku, weight_kg
    FROM products
    WHERE is_active = true
      AND name ILIKE $1
    ORDER BY name ASC
    LIMIT $2;
  `;
  const result = await pool.query(query, [`%${escaped}%`, limit]);
  return result.rows;
};

const getPendingClassifications = async ({ countOnly = false } = {}) => {
  const baseQuery = `
    SELECT
      p.id AS product_id,
      wmf.id AS flag_id,
      p.name,
      p.stock_keeping_unit AS sku,
      p.storage_type,
      p.default_unit,
      p.is_active,
      wmf.quantity_kg,
      wmf.reason,
      wmf.target_location,
      wmf.created_by,
      wmf.status,
      wmf.created_at AS flagged_at,
      wmf.pending_donation_id,
      wmf.pending_donation_item_id,
      pd.donor_name AS donor_name,
      pd.donation_category AS donation_category,
      pii.description AS item_description,
      pii.unit AS item_unit,
      donation_items_agg.items AS donation_items
    FROM products p
    JOIN warehouse_manager_flags wmf ON wmf.product_id = p.id
    LEFT JOIN pending_donations pd ON pd.id = wmf.pending_donation_id
    LEFT JOIN pending_donation_items pii ON pii.id = wmf.pending_donation_item_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', i.id,
            'line_no', i.line_no,
            'description', i.description,
            'quantity', i.quantity,
            'unit', i.unit,
            'status', i.status
          ) ORDER BY i.line_no ASC, i.id ASC
        ),
        '[]'::json
      ) AS items
      FROM pending_donation_items i
      WHERE i.pending_donation_id = wmf.pending_donation_id
    ) donation_items_agg ON wmf.pending_donation_id IS NOT NULL
    WHERE wmf.status = 'pending_classification'
    ORDER BY wmf.created_at ASC;
  `;

  if (countOnly) {
    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM (
        ${baseQuery.replace(/;\s*$/, '')}
      ) AS pending;
    `;
    const result = await pool.query(countQuery);
    return result.rows[0]?.count ?? 0;
  }

  const result = await pool.query(baseQuery.replace(/;\s*$/, ''));
  return result.rows;
};

/**
 * Upserts (inserts or updates) a product's default donation category classification.
 * Tracks who set the rule (`set_by`) and updates `updated_at` for BR-04 accountability audit trails.
 */
const upsertProductRoutingDefault = async ({ productId, donationCategory, setBy }, client = pool) => {
  const query = `
    INSERT INTO donation_routing_defaults (product_id, donation_category, set_by, created_at, updated_at) 
    VALUES ($1, $2, $3, NOW(), NOW()) 
    ON CONFLICT (product_id) 
    DO UPDATE SET 
      donation_category = EXCLUDED.donation_category, 
      set_by = EXCLUDED.set_by, 
      updated_at = NOW() 
    RETURNING product_id, donation_category, set_by, updated_at;
  `;
  // Callers already inside a transaction (e.g. finalizePendingClassification
  // running under resolveFlagAndMaybeCommit's SELECT ... FOR UPDATE) must pass
  // their client — running this INSERT on the shared pool from inside an open
  // locked transaction deadlocks against that same transaction's locks.
  const result = await client.query(query, [productId, donationCategory, setBy]);
  return result.rows[0];
};

/**
 * Removes a product's preset donation category classification rule.
 * Unclassified products fall back to manual category selection during donation intake.
 */
const deleteProductRoutingDefault = async (productId) => {
  const query = `
    DELETE FROM donation_routing_defaults 
    WHERE product_id = $1 
    RETURNING product_id;
  `;
  const result = await pool.query(query, [productId]);
  return result.rows[0] ? { success: true } : { success: false };
};

export default {
  listProducts,
  getProductById,
  findByNameOrSku,
  createProduct,
  updateProduct,
  setActive,
  searchProductsByName,
  getAllProductsWithDefaults,
  getProductRoutingDefault,
  getPendingClassifications,
  upsertProductRoutingDefault,
  deleteProductRoutingDefault,
};

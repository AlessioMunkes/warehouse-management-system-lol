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
import stockModel from './stock.repository.js';

// ── General Product CRUD Operations ─────────────────────────

/**
 * Fetches all products from the database, sorted alphabetically by name.
 * Allows filtering by active status if requested (e.g., active-only for catalog listings).
 */
// The column list every read below shares. `products` has no updated_at,
// so nothing references one. reorder_threshold and the ledger's own unit
// live on stock_levels, which is why the reads LEFT JOIN: a product that
// has never been counted has no stock_levels row yet and must still
// appear in the catalogue.
//
// quantity_on_hand is deliberately NOT selected. The catalogue is master
// data; a raw on-hand figure here would disagree with the manifest and
// the dispatch gate, which both report available (on hand - committed).
const PRODUCT_COLUMNS = `
  p.id, p.name, p.stock_keeping_unit AS sku, p.weight_kg,
  p.is_active, p.created_at, p.category, p.is_perishable,
  p.default_unit, p.storage_type, p.default_location_id,
  COALESCE(sl.reorder_threshold, 0) AS reorder_threshold,
  sl.unit AS ledger_unit`;

const PRODUCT_FROM = `
  FROM products p
  LEFT JOIN stock_levels sl ON sl.product_id = p.id`;

const listProducts = async ({ includeInactive = false, search = null } = {}) => {
  const params = [];
  const where  = [];

  // Inactive products are soft-deleted, not gone: they stay joined to
  // historical donations and deliveries. The catalog hides them unless
  // asked, which is what the page's toggle asks for.
  if (!includeInactive) where.push('p.is_active = true');

  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.name ILIKE $${params.length}
              OR p.stock_keeping_unit ILIKE $${params.length}
              OR p.category ILIKE $${params.length})`);
  }

  const result = await pool.query(
    `SELECT ${PRODUCT_COLUMNS}
     ${PRODUCT_FROM}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.name ASC`,
    params,
  );
  return result.rows;
};

/**
 * Looks up a single product by its database ID.
 * Returns the product object if found, or null if no record matches.
 */
// `client` so callers inside a transaction can read their own
// uncommitted writes — createProduct and updateProduct both do.
const getProductById = async (id, client = pool) => {
  const result = await client.query(
    `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} WHERE p.id = $1`,
    [id],
  );
  return result.rows[0] || null;
};

/**
 * Checks for duplicate product names or SKUs (case-insensitive search).
 * Useful for pre-validation in the service layer before attempting insertions or updates.
 */
// excludeId matters on update: without it the row being edited is its
// own clash, LIMIT 1 returns it, and a genuine clash with a DIFFERENT
// product further down the table is never seen.
const findByNameOrSku = async (name, sku, { excludeId = null } = {}) => {
  const params = [name, sku];
  let exclude = '';
  if (excludeId !== null && excludeId !== undefined) {
    params.push(excludeId);
    exclude = ` AND id <> $${params.length}`;
  }
  const result = await pool.query(
    `SELECT id, name, stock_keeping_unit
     FROM products
     WHERE (LOWER(name) = LOWER($1) OR LOWER(stock_keeping_unit) = LOWER($2))${exclude}
     LIMIT 1`,
    params,
  );
  return result.rows[0] || null;
};

/**
 * Inserts a new product record into the `products` table.
 * Defaults new products to `is_active = true` and timestamps them with NOW().
 */
// Registers a product and seeds its stock_levels row in one transaction.
// The seed row is what makes `unit` and `reorder_threshold` settable
// before the product has ever moved. quantity_on_hand = 0 is not a stock
// movement and writes nothing to stock_movements — the balance is still
// only ever changed by adjustStock.
//
// RETURNING cannot be used here: PRODUCT_COLUMNS now spans a LEFT JOIN
// to stock_levels, and the seeded threshold only exists after
// setStockMeta runs. Hence the read-back through getProductById on the
// same client, inside the same transaction.
const createProduct = async ({
  name, stockKeepingUnit, weightKg = null,
  defaultUnit = 'kg', category = null, isPerishable = false,
  storageType = null, defaultLocationId = null, reorderThreshold = null,
}) => {
  // default_unit is NOT NULL DEFAULT 'kg' in the schema, so the default
  // above keeps a payload that omits it valid rather than relying on the
  // column default and reading back something the caller did not choose.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO products
         (name, stock_keeping_unit, weight_kg, default_unit, category,
          is_perishable, storage_type, default_location_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'dry'), $8, true, NOW())
       RETURNING id`,
      [
        name, stockKeepingUnit, weightKg, defaultUnit, category,
        isPerishable, storageType, defaultLocationId,
      ],
    );
    const id = rows[0].id;

    await stockModel.setStockMeta(client, {
      productId:        id,
      seedUnit:         defaultUnit,
      reorderThreshold,
    });

    const created = await getProductById(id, client);
    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Updates basic product metadata (name, SKU, and weight) for an existing product ID.
 */
// A real partial patch. This used to SET every column unconditionally
// from a payload that defaulted the absent ones, so renaming a product
// silently blanked its category, weight and unit — and the client does
// send partial patches.
const PRODUCT_PATCH_COLUMNS = {
  name:              'name',
  stockKeepingUnit:  'stock_keeping_unit',
  weightKg:          'weight_kg',
  defaultUnit:       'default_unit',
  category:          'category',
  isPerishable:      'is_perishable',
  storageType:       'storage_type',
  defaultLocationId: 'default_location_id',
};

// Wrapped in a transaction because a patch touching defaultUnit or
// reorderThreshold has to write stock_levels too — the map above
// already lets default_unit reach the products UPDATE like any other
// column, but stock_levels.unit has to move in step or receiving stamps
// movements in the new unit against a ledger still accumulating in the
// old one. reorderThreshold has nowhere in PRODUCT_PATCH_COLUMNS at
// all: it isn't a products column, it lives on stock_levels alone.
const updateProduct = async (id, patch = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sets   = [];
    const params = [];

    for (const [key, column] of Object.entries(PRODUCT_PATCH_COLUMNS)) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }

    const changingUnit      = Object.prototype.hasOwnProperty.call(patch, 'defaultUnit');
    const changingThreshold = Object.prototype.hasOwnProperty.call(patch, 'reorderThreshold');

    // Nothing to change on `products` itself is fine on its own — a
    // reorderThreshold-only patch has an empty `sets` but still needs
    // the setStockMeta branch below, so this can't early-return the
    // way a single-table update would.
    if (sets.length) {
      params.push(id);
      const { rowCount } = await client.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );
      if (!rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
    }

    if (changingUnit || changingThreshold) {
      // The product row is the authority on what unit to seed with if
      // stock_levels has no row yet — read it back AFTER the UPDATE so
      // a unit change in this same patch is already reflected.
      const current = await getProductById(id, client);
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      await stockModel.setStockMeta(client, {
        productId:        id,
        seedUnit:         current.default_unit,
        unit:             changingUnit ? patch.defaultUnit : null,
        reorderThreshold: changingThreshold ? patch.reorderThreshold : null,
      });
    }

    const updated = await getProductById(id, client);
    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Soft-deletes or reactivates a product by toggling its `is_active` boolean flag.
 * Soft deletion ensures historical donation records tied to this product stay intact.
 */
const setActive = async (id, isActive) => {
  // No RETURNING: PRODUCT_COLUMNS now spans a LEFT JOIN to stock_levels.
  const { rowCount } = await pool.query(
    `UPDATE products SET is_active = $1 WHERE id = $2`,
    [Boolean(isActive), id],
  );
  return rowCount ? getProductById(id) : null;
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
      AND stock_keeping_unit NOT ILIKE 'PENDING-%'
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

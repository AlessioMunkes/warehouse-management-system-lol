// server/test/helpers/testDb.js
//
// Real Postgres via the app's actual pool (server/src/config/db.js).
// No mocking. DATABASE_URL must point at a dedicated test database —
// never production. Every created row is tracked by id so cleanup
// deletes precisely what this run created, never a blanket DELETE.
import pool from '../../src/config/db.js';

const TEST_PREFIX = 'itest_';
const uniqueSuffix = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const created = { userIds: [], productIds: [], flagIds: [], persistentUserIds:[] };

/**
 * Creates a real row in public.users (not auth.users — repositories
 * FK integer ids against public.users). password_hash is a
 * placeholder: these tests use JWT cookie auth via testAuth.js, never
 * the login/password path, so no real bcrypt hash is needed.
 */
export const createTestUser = async (role, { persistent = false } = {}) => {
  const username = `${TEST_PREFIX}user_${uniqueSuffix()}`;
  const result = await pool.query(
    `INSERT INTO users (username, first_name, last_name, password_hash, role, is_active)
     VALUES ($1, 'Integration', 'TestUser', 'not-a-real-hash', $2, true)
     RETURNING id, username, role`,
    [username, role]
  );
  const user = result.rows[0];
  if (!persistent) created.userIds.push(user.id);
  else created.persistentUserIds = created.persistentUserIds || [], created.persistentUserIds.push(user.id);
  return user;
};

export const cleanupPersistentUsers = async () => {
  if (created.persistentUserIds?.length) {
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [created.persistentUserIds]);
    created.persistentUserIds.length = 0;
  }
};

export const trackProductIds = (ids = []) => {
  ids.filter(Boolean).forEach((id) => {
   if (!created.productIds.includes(id)) created.productIds.push(id);
  });
};

export const trackFlagIds = (ids = []) => {
  ids.filter(Boolean).forEach((id) => {
   if (!created.flagIds.includes(id)) created.flagIds.push(id);
  });
};

/** storage_type defaults to 'dry'; pass 'cold' to exercise that branch. */
export const createTestProduct = async ({ storageType = 'dry', isActive = true } = {}) => {
  const suffix = uniqueSuffix();
  const result = await pool.query(
    `INSERT INTO products (name, stock_keeping_unit, storage_type, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, stock_keeping_unit AS sku, storage_type, is_active`,
    [`${TEST_PREFIX}product_${suffix}`, `${TEST_PREFIX}sku_${suffix}`, storageType, isActive]
  );
  const product = result.rows[0];
  created.productIds.push(product.id);
  return product;
};

/**
 * donation_category_routing only has the 4 real category rows — shared
 * config, not disposable data, and the PATCH endpoint is UPDATE-only
 * (no INSERT path). Snapshot before mutating, always restore in a
 * try/finally.
 */
export const snapshotCategoryRouting = async (category) => {
  const result = await pool.query(
    `SELECT category, routing_outcome, storage_area, description, updated_by
     FROM donation_category_routing WHERE category = $1`,
    [category]
  );
  if (!result.rows[0]) {
    throw new Error(`No existing donation_category_routing row for '${category}'.`);
  }
  return result.rows[0];
}

export const restoreCategoryRouting = async (snapshot) => {
  await pool.query(
    `UPDATE donation_category_routing
     SET routing_outcome = $1, storage_area = $2, description = $3, updated_by = $4, updated_at = NOW()
     WHERE category = $5`,
    [snapshot.routing_outcome, snapshot.storage_area, snapshot.description, snapshot.updated_by, snapshot.category]
  );
};

/**
 * FK-safe delete order: flags/routing-defaults/stock reference
 * products.id, so they go first; products before users.
 */
export const cleanupTestData = async () => {
  if (created.flagIds.length) {
    await pool.query('DELETE FROM warehouse_manager_flags WHERE id = ANY($1)', [created.flagIds]);
    created.flagIds.length = 0;
  }
  if (created.productIds.length) {
    await pool.query('DELETE FROM warehouse_manager_flags WHERE product_id = ANY($1)', [created.productIds]);
    await pool.query('DELETE FROM donation_routing_defaults WHERE product_id = ANY($1)', [created.productIds]);
    await pool.query('DELETE FROM stock_levels WHERE product_id = ANY($1)', [created.productIds]);
    await pool.query('DELETE FROM products WHERE id = ANY($1)', [created.productIds]);
    created.productIds.length = 0;
  }
  if (created.userIds.length) {
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [created.userIds]);
    created.userIds.length = 0;
  }
};

/** Closes the pool so the process can exit. Call once, in a top-level afterAll. */
export const closeTestDb = async () => {
  await pool.end();
};
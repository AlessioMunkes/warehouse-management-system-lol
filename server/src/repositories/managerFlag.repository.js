// ─────────────────────────────────────────────────────────────
// server/src/repositories/managerFlag.repository.js
//
// warehouse_manager_flags rows raised at donation intake, and the
// inactive placeholder product an unmatched item needs before it can be
// flagged (the flag's product_id is NOT NULL, and classification later
// renames that placeholder into the real product).
//
// Every function takes the caller's transaction client: a flag written
// on another connection would outlive the intake it belongs to if that
// intake rolled back. The pending-donation flag queries (lock, link,
// resolve, count) live with the rest of that flow in
// pendingDonation.repository.js.
// ─────────────────────────────────────────────────────────────

// Inactive, dry, kg: a stand-in until a manager says what the item is.
export const createPlaceholderProduct = async (client, { name, sku }) => {
  const { rows } = await client.query(
    `INSERT INTO products (
       name,
       stock_keeping_unit,
       storage_type,
       is_active,
       is_decantable,
       code_type,
       default_unit,
       is_perishable
     ) VALUES ($1, $2, 'dry', false, false, 'fixed', 'kg', false)
     RETURNING id, name, stock_keeping_unit AS sku, storage_type, is_active;`,
    [name, sku]
  );
  return rows[0];
};

// A flag for a manager to place by hand (non-food) or to classify
// (an unrecognised item). Returns { id, status }.
export const createIntakeFlag = async (client, { productId, quantityKg, reason, targetLocation, createdBy, status }) => {
  const { rows } = await client.query(
    `INSERT INTO warehouse_manager_flags
       (product_id, quantity_kg, reason, target_location, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, status;`,
    [productId, quantityKg, reason, targetLocation, createdBy, status]
  );
  return rows[0] || null;
};

export const findPendingClassificationFlag = async (client, flagId) => {
  const { rows } = await client.query(
    `SELECT id, product_id, quantity_kg, reason, target_location, status
     FROM warehouse_manager_flags
     WHERE id = $1 AND status = 'pending_classification';`,
    [flagId]
  );
  return rows[0] || null;
};

// Points the flag at an existing product instead of its placeholder.
export const setFlagProduct = async (client, flagId, productId) => {
  await client.query(
    `UPDATE warehouse_manager_flags
     SET product_id = $1
     WHERE id = $2;`,
    [productId, flagId]
  );
};

export const markClassificationFlagResolved = async (client, flagId) => {
  const { rows } = await client.query(
    `UPDATE warehouse_manager_flags
    SET status = 'resolved', updated_at = NOW()
     WHERE id = $1 AND status = 'pending_classification'
     RETURNING id, product_id, status;`,
    [flagId]
  );
  return rows[0];
};

// Another product already using this name, if any (case-insensitive),
// other than the placeholder being classified.
export const findProductByNameExcept = async (client, name, exceptProductId) => {
  const { rows } = await client.query(
    `SELECT id, name, stock_keeping_unit AS sku, storage_type, default_unit, is_active
     FROM products
     WHERE LOWER(name) = LOWER($1)
       AND id <> $2
     LIMIT 1;`,
    [name, exceptProductId]
  );
  return rows[0] || null;
};

// Turns the placeholder into the real product the manager named.
export const promotePlaceholderProduct = async (client, productId, { name, sku, storageType, defaultUnit }) => {
  const { rows } = await client.query(
    `UPDATE products
     SET name = $1,
         stock_keeping_unit = $2,
         storage_type = $3,
         default_unit = $4,
         is_active = true
     WHERE id = $5
     RETURNING id, name, stock_keeping_unit AS sku, storage_type, default_unit, is_active;`,
    [name, sku, storageType, defaultUnit, productId]
  );
  return rows[0];
};

export default {
  createPlaceholderProduct,
  createIntakeFlag,
  findPendingClassificationFlag,
  setFlagProduct,
  markClassificationFlagResolved,
  findProductByNameExcept,
  promotePlaceholderProduct,
};

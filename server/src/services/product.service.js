// ─────────────────────────────────────────────────────────────
// server/src/services/product.service.js
//
// Validation and normalisation for the product catalog.
//
// The shape here follows the `products` table rather than a subset of
// it: name, SKU, weight, default unit, category and the perishable
// flag. stock_keeping_unit is NOT NULL UNIQUE in the schema, so a SKU
// is required even though ProductForm once described it as optional.
// default_unit is NOT NULL DEFAULT 'kg'.
//
// create builds a whole row. update is a partial patch: only the keys
// the caller sent are forwarded, so editing a name cannot blank a
// category.
// ─────────────────────────────────────────────────────────────
import productRepo from '../repositories/product.repository.js';
import { isStockUnit, STOCK_UNITS } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// products.storage_type carries its own CHECK constraint — 'dry' or
// 'cold', and nothing else.
const STORAGE_TYPES = ['dry', 'cold'];

// Strict, so an object or 'abc' cannot slide past a truthiness check
// and reach the database as a malformed parameter.
const validateId = (id, paramName = 'Product ID') => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(400, `${paramName} must be a valid positive integer.`);
  }
  return parsed;
};

const cleanText = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

// Shared by create and update. Weight is optional, but zero is a real
// measurement and blank is "not recorded" — they are not the same, so
// '' becomes null and 0 stays 0.
const parseWeight = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(400, 'Weight must be zero or a positive number.');
  }
  return parsed;
};

// What we expect to pay for ONE of these, before VAT, in rand. Its own
// parser rather than reusing parseWeight so the error names the field
// the person was actually typing in.
//
// Blank is "we have never priced this", which is not the same as free —
// so '' becomes null and 0 stays 0, exactly as weight does. A donated
// line really can be zero.
const parseUnitCost = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(400, 'Cost per item must be zero or a positive amount.');
  }
  // NUMERIC(12,2) in the database. Rounding here rather than letting
  // Postgres do it silently means the number read back is the number
  // that was stored, and a purchase-order estimate built from it adds
  // up to what the screen showed.
  return Math.round(parsed * 100) / 100;
};

const parsePerishable = (raw) => {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true')  return true;
  if (raw === 'false') return false;
  fail(400, 'Perishable must be true or false.');
};

// stock_levels.unit and stock_movements.unit both allow exactly the
// nine values in STOCK_UNITS. Anything else is a 23514 raised halfway
// through the transaction, surfacing as a 500 with Postgres wording in
// it — so it is rejected here as a 400 with a sentence instead.
const parseUnit = (raw, { required = false } = {}) => {
  const unit = cleanText(raw);
  if (unit === null) {
    if (required) fail(400, 'A default unit is required.');
    return null;
  }
  if (!isStockUnit(unit)) {
    fail(400, `Unit must be one of: ${STOCK_UNITS.join(', ')}.`);
  }
  return unit;
};

const parseStorageType = (raw) => {
  const value = cleanText(raw);
  if (value === null) return null;
  if (!STORAGE_TYPES.includes(value)) {
    fail(400, `Storage type must be one of: ${STORAGE_TYPES.join(', ')}.`);
  }
  return value;
};

// Zero is a legitimate threshold — it is what every product already has,
// and it means "never flag this as low". Negative is not. Blank means
// "not set" and stays null.
const parseThreshold = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(400, 'Reorder threshold must be zero or a positive number.');
  }
  return parsed;
};

// Nullable FK to storage_locations. Explicit null clears it; anything
// present must at least be shaped like a row id. Whether the row EXISTS
// is the FK constraint's job — see the 23503 handler in createProduct
// and updateProduct below.
const parseLocationId = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  return validateId(raw, 'Storage location ID');
};

const listProducts = async ({ includeInactive, search } = {}) =>
  productRepo.listProducts({
    // Query params arrive as strings: '?includeInactive=true'.
    includeInactive: includeInactive === true || includeInactive === 'true',
    search: cleanText(search),
  });

const getProductById = async (id) => {
  const validId = validateId(id);
  const product = await productRepo.getProductById(validId);
  if (!product) fail(404, 'Product not found.');
  return product;
};

const createProduct = async (data = {}) => {
  const name = cleanText(data.name);
  const sku  = cleanText(data.stockKeepingUnit ?? data.sku);
  // parseUnit validates a supplied value against STOCK_UNITS but returns
  // null for blank/omitted, same as cleanText did — so a request that
  // sends nothing still falls back to 'kg', the column default.
  const defaultUnit = parseUnit(data.defaultUnit) ?? 'kg';

  if (!name) fail(400, 'A product name is required.');
  if (!sku)  fail(400, 'A stock keeping unit (SKU) is required.');

  const row = {
    name,
    stockKeepingUnit: sku,
    weightKg:     parseWeight(data.weightKg),
    defaultUnit,
    category:     cleanText(data.category),
    isPerishable: data.isPerishable === undefined ? false : parsePerishable(data.isPerishable),
    storageType:       parseStorageType(data.storageType),
    defaultLocationId: parseLocationId(data.defaultLocationId),
    reorderThreshold:  parseThreshold(data.reorderThreshold),
    unitCost:          parseUnitCost(data.unitCost),
  };

  const existing = await productRepo.findByNameOrSku(row.name, row.stockKeepingUnit);
  if (existing) {
    fail(409, `A product with that name or SKU already exists (${existing.name}).`);
  }

  try {
    return await productRepo.createProduct(row);
  } catch (err) {
    // The pre-check above is a courtesy for a clean message. This is the
    // actual guarantee: two requests in the same millisecond both pass
    // the check, and the unique index decides.
    if (err.code === '23505') fail(409, 'A product with that name or SKU already exists.');
    // Nullable FK to storage_locations. Shape is checked above by
    // parseLocationId; whether the row exists is the constraint's call —
    // it can also vanish between the request and this insert regardless.
    if (err.code === '23503') fail(400, 'That storage location does not exist.');
    throw err;
  }
};

const updateProduct = async (id, data = {}) => {
  const validId = validateId(id);
  const patch = {};

  // Only keys the caller actually sent are forwarded. hasOwnProperty
  // rather than a truthiness test, so `category: ''` can clear a
  // category and `weightKg: 0` can record a real zero.
  const has = (key) => Object.prototype.hasOwnProperty.call(data, key);

  if (has('name')) {
    const name = cleanText(data.name);
    if (!name) fail(400, 'A product name is required.');
    patch.name = name;
  }
  if (has('stockKeepingUnit') || has('sku')) {
    const sku = cleanText(data.stockKeepingUnit ?? data.sku);
    if (!sku) fail(400, 'A stock keeping unit (SKU) is required.');
    patch.stockKeepingUnit = sku;
  }
  if (has('defaultUnit')) {
    patch.defaultUnit = parseUnit(data.defaultUnit, { required: true });
  }
  if (has('weightKg'))          patch.weightKg          = parseWeight(data.weightKg);
  if (has('unitCost'))          patch.unitCost          = parseUnitCost(data.unitCost);
  if (has('category'))          patch.category          = cleanText(data.category);
  if (has('isPerishable'))      patch.isPerishable      = parsePerishable(data.isPerishable);
  if (has('storageType'))       patch.storageType       = parseStorageType(data.storageType);
  if (has('defaultLocationId')) patch.defaultLocationId = parseLocationId(data.defaultLocationId);
  if (has('reorderThreshold'))  patch.reorderThreshold  = parseThreshold(data.reorderThreshold);

  if (!Object.keys(patch).length) {
    fail(400, 'Nothing to update — send at least one field.');
  }

  // Only worth checking when one of the two unique columns is moving.
  if (patch.name !== undefined || patch.stockKeepingUnit !== undefined) {
    const current = await productRepo.getProductById(validId);
    if (!current) fail(404, 'Product not found.');

    const clash = await productRepo.findByNameOrSku(
      patch.name ?? current.name,
      patch.stockKeepingUnit ?? current.sku,
      { excludeId: validId },
    );
    if (clash) fail(409, `A product with that name or SKU already exists (${clash.name}).`);
  }

  try {
    const updated = await productRepo.updateProduct(validId, patch);
    if (!updated) fail(404, 'Product not found.');
    return updated;
  } catch (err) {
    if (err.code === '23505') fail(409, 'A product with that name or SKU already exists.');
    if (err.code === '23503') fail(400, 'That storage location does not exist.');
    throw err;
  }
};

const setActive = async (id, isActive) => {
  const validId = validateId(id);
  const boolActive = parsePerishable(isActive);   // same explicit-boolean rule

  // An archived product cannot be switched back on from here. The
  // database would refuse it anyway (products_archived_implies_inactive)
  // but a CHECK violation surfaces as a 500 and tells the admin
  // nothing, so the refusal is spelled out where it can be read.
  const existing = await productRepo.getProductById(validId);
  if (!existing) fail(404, 'Product not found.');
  if (existing.archived_at && boolActive) {
    fail(409, 'This product was deleted from the catalogue and cannot be reactivated. Create a new product instead.');
  }

  const result = await productRepo.setActive(validId, boolActive);
  if (!result) fail(404, 'Product not found.');
  return result;
};

// ── Delete from the catalogue ────────────────────────────────
// Not a DELETE statement. See migration 019: the row stays so that
// every slip, delivery note and report already referencing it keeps
// its product name, and stops being something anyone can pick.
const archiveProduct = async (id, actorId) => {
  const validId = validateId(id);
  const existing = await productRepo.getProductById(validId);
  if (!existing) fail(404, 'Product not found.');
  if (existing.archived_at) return existing;   // already gone; idempotent

  const result = await productRepo.archiveProduct(validId, actorId);
  if (!result) fail(404, 'Product not found.');
  return result;
};

export default {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  setActive,
  archiveProduct,
};

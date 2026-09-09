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

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

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

const parsePerishable = (raw) => {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true')  return true;
  if (raw === 'false') return false;
  fail(400, 'Perishable must be true or false.');
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
  const name        = cleanText(data.name);
  const sku         = cleanText(data.stockKeepingUnit ?? data.sku);
  const defaultUnit = cleanText(data.defaultUnit) ?? 'kg';

  if (!name) fail(400, 'A product name is required.');
  if (!sku)  fail(400, 'A stock keeping unit (SKU) is required.');

  const row = {
    name,
    stockKeepingUnit: sku,
    weightKg:     parseWeight(data.weightKg),
    defaultUnit,
    category:     cleanText(data.category),
    isPerishable: data.isPerishable === undefined ? false : parsePerishable(data.isPerishable),
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
    const unit = cleanText(data.defaultUnit);
    if (!unit) fail(400, 'A default unit is required.');
    patch.defaultUnit = unit;
  }
  if (has('weightKg'))     patch.weightKg     = parseWeight(data.weightKg);
  if (has('category'))     patch.category     = cleanText(data.category);
  if (has('isPerishable')) patch.isPerishable = parsePerishable(data.isPerishable);

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
    throw err;
  }
};

const setActive = async (id, isActive) => {
  const validId = validateId(id);
  const boolActive = parsePerishable(isActive);   // same explicit-boolean rule
  const result = await productRepo.setActive(validId, boolActive);
  if (!result) fail(404, 'Product not found.');
  return result;
};

export default {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  setActive,
};

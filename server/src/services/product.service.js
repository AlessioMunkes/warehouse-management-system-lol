// ─────────────────────────────────────────────────────────────
// server/src/services/product.service.js
// ─────────────────────────────────────────────────────────────
import productRepo from '../repositories/product.repository.js';

// Helper to standardise service errors so Express controllers send clean HTTP status codes
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

/**
 * Strict ID validation — prevents bad inputs like objects ({}) or strings ('abc') 
 * from sliding past truthiness checks and causing unhandled DB crashes downstream.
 */
const validateId = (id, paramName = 'Product ID') => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(400, `${paramName} must be a valid positive integer.`);
  }
  return parsed;
};

/**
 * Sanitises and normalises product payloads before hitting the repository layer.
 * Mass-assignment protection: we explicitly pull out only the fields we allow.
 */
const normaliseProductInput = (raw = {}) => {
  const name = String(raw.name || '').trim();
  const sku = String(raw.stockKeepingUnit || raw.sku || '').trim();

  if (!name) fail(400, 'A product name is required.');
  if (!sku) fail(400, 'A stock keeping unit (SKU) is required.');

  let weightKg = null;
  if (raw.weightKg !== undefined && raw.weightKg !== null && raw.weightKg !== '') {
    const parsed = Number(raw.weightKg);
    if (!Number.isFinite(parsed) || parsed < 0) {
      fail(400, 'Weight must be zero or a positive number.');
    }
    weightKg = parsed;
  }

  return { name, stockKeepingUnit: sku, weightKg };
};

const listProducts = async ({ isActive } = {}) => {
  // Ensure string query params like '?isActive=true' get cast to explicit booleans
  const filterActive = isActive !== undefined ? Boolean(isActive) : undefined;
  return await productRepo.listProducts({ isActive: filterActive });
};

const getProductById = async (id) => {
  const validId = validateId(id);
  const product = await productRepo.getProductById(validId);
  if (!product) fail(404, 'Product not found.');
  return product;
};

const createProduct = async (data) => {
  const normalised = normaliseProductInput(data);
  
  // Quick pre-check for clean UI feedback...
  const existing = await productRepo.findByNameOrSku(normalised.name, normalised.stockKeepingUnit);
  if (existing) {
    fail(409, `A product with that name or SKU already exists (${existing.name}).`);
  }

  try {
    return await productRepo.createProduct(normalised);
  } catch (err) {
    // Safety net: if two requests hit at the exact same millisecond, the DB unique
    // constraint (code 23505) catches the race condition so we return a clean 409 instead of 500.
    if (err.code === '23505') {
      fail(409, 'A product with that name or SKU already exists.');
    }
    throw err;
  }
};

const updateProduct = async (id, data) => {
  const validId = validateId(id);
  const normalised = normaliseProductInput(data);

  // Exclude the product's own current ID so editing details doesn't collision-detect with itself
  const existing = await productRepo.findByNameOrSku(normalised.name, normalised.stockKeepingUnit);
  if (existing && Number(existing.id) !== validId) {
    fail(409, `A product with that name or SKU already exists (${existing.name}).`);
  }

  try {
    const updated = await productRepo.updateProduct(validId, normalised);
    if (!updated) fail(404, 'Product not found.');
    return updated;
  } catch (err) {
    if (err.code === '23505') {
      fail(409, 'A product with that name or SKU already exists.');
    }
    throw err;
  }
};

const setActive = async (id, isActive) => {
  const validId = validateId(id);
  
  // Guard against loose truthy values like 'false' or numbers being passed accidentally
  if (typeof isActive !== 'boolean' && isActive !== 'true' && isActive !== 'false') {
    fail(400, 'Target active status must be an explicit boolean value.');
  }

  const boolActive = isActive === true || isActive === 'true';
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
// ─────────────────────────────────────────────────────────────
// server/src/services/product.service.js
//
// Validation and business rules for the product catalog. The
// repository does SQL; this file decides what is allowed and what an
// error means — same split as supplier.service.js/user.service.js.
//
// ERRORS CARRY .status — same fail(status, message) convention as
// supplier.service.js, read by product.controller.js via err.status||500.
//
// STRICT, LIKE SUPPLIERS, NOT LOOSE LIKE PROSPECTS.
// A product is FK'd from every operational table in the system
// (delivery_note_items, purchase_order_items, picking_slip_items,
// decanting_lines, dispatch_event_lines, stock_movements...). A bad
// row here is permanent and touches everything downstream, so this
// validates hard rather than accepting a half-filled record.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/product.repository.js';
import { isPositiveInt } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// ── Value cleaning ────────────────────────────────────────────
const clean = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const capped = (value, max, label) => {
  const v = clean(value);
  if (v !== null && v.length > max) {
    throw fail(400, `${label} must be ${max} characters or fewer.`);
  }
  return v;
};

const requireId = (id, label = 'Product') => {
  if (!isPositiveInt(id)) throw fail(400, `A valid ${label.toLowerCase()} ID is required.`);
  return Number(id);
};

// weightKg is genuinely optional — plenty of products (a case of tins,
// a box of soap) are counted, not weighed. null means "not recorded",
// not zero.
const validWeight = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw fail(400, 'Weight must be a positive number, or left blank.');
  }
  return n;
};

// ── Product payload ────────────────────────────────────────────
const buildProductPayload = (body = {}) => {
  const name = clean(body.name);
  if (!name) throw fail(400, 'Product name is required.');
  if (name.length > 150) throw fail(400, 'Product name must be 150 characters or fewer.');

  const defaultUnit = clean(body.defaultUnit);
  if (!defaultUnit) throw fail(400, 'A default unit is required (e.g. bag, crate, kg).');
  if (defaultUnit.length > 20) throw fail(400, 'Default unit must be 20 characters or fewer.');

  return {
    name,
    sku:          capped(body.sku, 50, 'SKU'),
    defaultUnit,
    weightKg:     validWeight(body.weightKg),
    category:     capped(body.category, 50, 'Category'),
    isPerishable: Boolean(body.isPerishable),
  };
};

// ── Reads ─────────────────────────────────────────────────────
const listProducts = async ({ includeInactive, search } = {}) =>
  repo.listProducts({
    includeInactive: includeInactive === true || includeInactive === 'true',
    search: clean(search),
  });

const getProduct = async (rawId) => {
  const id = requireId(rawId);
  const product = await repo.getProductById(id);
  if (!product) throw fail(404, 'Product not found.');
  return product;
};

// ── Create ────────────────────────────────────────────────────
const createProduct = async (body) => {
  const payload = buildProductPayload(body);

  const clash = await repo.findByNameOrSku(payload.name, payload.sku);
  if (clash) {
    const field = clash.name.toLowerCase() === payload.name.toLowerCase() ? 'name' : 'SKU';
    throw fail(409, `A product with that ${field} already exists: "${clash.name}".`);
  }

  return repo.insertProduct(payload);
};

// ── Update ────────────────────────────────────────────────────
const updateProduct = async (rawId, body) => {
  const id = requireId(rawId);

  const existing = await repo.getProductById(id);
  if (!existing) throw fail(404, 'Product not found.');

  const patch = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('name')) {
    const name = clean(body.name);
    if (!name) throw fail(400, 'Product name is required.');
    if (name.length > 150) throw fail(400, 'Product name must be 150 characters or fewer.');
    patch.name = name;
  }
  if (has('sku')) patch.sku = capped(body.sku, 50, 'SKU');
  if (has('defaultUnit')) {
    const defaultUnit = clean(body.defaultUnit);
    if (!defaultUnit) throw fail(400, 'A default unit is required.');
    patch.defaultUnit = defaultUnit;
  }
  if (has('weightKg')) patch.weightKg = validWeight(body.weightKg);
  if (has('category')) patch.category = capped(body.category, 50, 'Category');
  if (has('isPerishable')) patch.isPerishable = Boolean(body.isPerishable);

  if ((has('name') || has('sku')) && (patch.name || patch.sku)) {
    const clash = await repo.findByNameOrSku(
      patch.name ?? existing.name,
      patch.sku ?? existing.sku,
      { excludeId: id }
    );
    if (clash) throw fail(409, `A product with that name or SKU already exists: "${clash.name}".`);
  }

  if (!Object.keys(patch).length) throw fail(400, 'No changes were supplied.');

  return repo.updateProduct(id, patch);
};

// ── Activate / deactivate ────────────────────────────────────
const setProductStatus = async (rawId, body) => {
  const id = requireId(rawId);
  if (typeof body?.isActive !== 'boolean') {
    throw fail(400, 'isActive must be true or false.');
  }

  const existing = await repo.getProductById(id);
  if (!existing) throw fail(404, 'Product not found.');
  if (existing.is_active === body.isActive) return existing;

  return repo.setProductActive(id, body.isActive);
};

export default {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  setProductStatus,
};

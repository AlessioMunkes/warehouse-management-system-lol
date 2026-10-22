// ─────────────────────────────────────────────────────────────
// server/src/services/productBarcode.service.js
//
// Barcodes as a second way of naming a product: scan instead of
// searching by name. Picking by name keeps working exactly as before;
// most donated stock has no barcode at all.
//
// LOOKUP never fails on an unknown code. "Nobody has linked this code
// yet" is the normal case for the first box of anything, and the
// screen's answer to it is to ask which product it is and link it
// (see link below). So an unknown code is a 200 with match: null, and
// only something that is not a barcode at all is a 400.
//
// LINK is open to warehouse staff, not only to admins who own the rest
// of the product row. The bay is where an unknown barcode turns up, in
// the hands of the person who knows what is in the box. A link changes
// nothing about the product itself, every link is audited with who made
// it, and an admin can remove a wrong one from the product's panel.
// ─────────────────────────────────────────────────────────────
import barcodeRepo from '../repositories/productBarcode.repository.js';
import productRepo from '../repositories/product.repository.js';
import { normaliseBarcode } from '../utils/barcode.js';
import openFoodFacts from '../integrations/openFoodFacts.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const validateId = (id, paramName) => {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(400, `${paramName} must be a valid positive integer.`);
  return parsed;
};

const NOT_A_BARCODE = 'That is not a barcode the system can read. Scan it again or type the numbers under the bars.';

// One scan counts for this many of the product's unit. A case of 12 is
// 12; a 25 kg sack of a product counted in kg is 25. Capped well above
// any real pack so a stray keystroke cannot turn one scan into a
// warehouse-load of stock.
const MAX_UNITS_PER_SCAN = 10000;

const parseUnitsPerScan = (raw) => {
  if (raw === undefined || raw === null || raw === '') return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_UNITS_PER_SCAN) {
    fail(400, `Units per scan must be more than 0 and at most ${MAX_UNITS_PER_SCAN}.`);
  }
  return Math.round(parsed * 1000) / 1000;
};

const toMatch = (row) => ({
  barcodeId:    row.id,
  productId:    row.product_id,
  productName:  row.product_name,
  sku:          row.sku,
  defaultUnit:  row.default_unit,
  unitsPerScan: Number(row.units_per_scan),
  // A code still linked to a product that has since left the catalogue.
  // The screen says so rather than putting stock against it.
  available:    Boolean(row.is_active) && !row.archived_at,
});

const lookup = async (raw) => {
  const parsed = normaliseBarcode(raw);
  if (!parsed) fail(400, NOT_A_BARCODE);
  const row = await barcodeRepo.findByCode(parsed.code);
  return {
    code: parsed.code,
    format: parsed.format,
    // A GS1 case label's use-by date and batch, when it carried them.
    gs1: parsed.gs1 ?? null,
    match: row ? toMatch(row) : null,
  };
};

const listForProduct = async (productId) => {
  const id = validateId(productId, 'Product ID');
  const product = await productRepo.getProductById(id);
  if (!product) fail(404, 'Product not found.');
  return barcodeRepo.listForProduct(id);
};

const link = async (productId, data = {}, actorId = null) => {
  const id = validateId(productId, 'Product ID');
  const parsed = normaliseBarcode(data.code);
  if (!parsed) fail(400, NOT_A_BARCODE);
  const unitsPerScan = parseUnitsPerScan(data.unitsPerScan);
  const supplierId = data.supplierId === undefined || data.supplierId === null || data.supplierId === ''
    ? null
    : validateId(data.supplierId, 'Supplier ID');

  const product = await productRepo.getProductById(id);
  if (!product) fail(404, 'Product not found.');
  if (!product.is_active || product.archived_at) {
    fail(409, `${product.name} is not in the active catalogue, so a barcode cannot be linked to it.`);
  }

  try {
    return await barcodeRepo.create({
      productId: id, code: parsed.code, unitsPerScan, supplierId, createdBy: actorId,
    });
  } catch (err) {
    if (err.code === '23505') {
      // The same link made twice (two workers, or a retried tap) is not
      // an error. A code that already means a DIFFERENT product is.
      const existing = await barcodeRepo.findByCode(parsed.code);
      if (existing && Number(existing.product_id) === id) return existing;
      fail(409, `That barcode is already linked to ${existing?.product_name ?? 'another product'}.`);
    }
    if (err.code === '23503') fail(400, 'That supplier does not exist.');
    throw err;
  }
};

const unlink = async (productId, barcodeId, actorId = null) => {
  const id = validateId(productId, 'Product ID');
  const bid = validateId(barcodeId, 'Barcode ID');
  const removed = await barcodeRepo.remove({ productId: id, barcodeId: bid, actorId });
  if (!removed) fail(404, 'Barcode not found on this product.');
  return removed;
};

// Every link, for a phone's own copy (offline scanning).
const listAll = async () => {
  const rows = await barcodeRepo.listAll();
  return rows.map((row) => ({ code: row.code, ...toMatch(row) }));
};

// ── Scan records (migration 053) ─────────────────────────────
const SCREENS = ['receiving', 'donation', 'packing', 'stock_count'];
const OUTCOMES = ['counted', 'not_on_list', 'already_done', 'unknown', 'linked', 'misread'];

const optionalId = (raw, name) => (raw === undefined || raw === null || raw === '' ? null : validateId(raw, name));

const recordScan = async (data = {}, userId = null) => {
  if (!SCREENS.includes(data.screen)) fail(400, `Screen must be one of: ${SCREENS.join(', ')}.`);
  if (!OUTCOMES.includes(data.outcome)) fail(400, `Outcome must be one of: ${OUTCOMES.join(', ')}.`);
  try {
    await barcodeRepo.recordScan({
      screen: data.screen,
      outcome: data.outcome,
      productId: optionalId(data.productId, 'Product ID'),
      referenceId: optionalId(data.referenceId, 'Reference ID'),
      userId,
    });
  } catch (err) {
    // A product that has since gone is not worth refusing a record for.
    if (err.code === '23503') fail(400, 'That product does not exist.');
    throw err;
  }
  return { recorded: true };
};

// ── A suggestion for a new product (Open Food Facts) ─────────
// Already linked here: say so, and suggest nothing. Otherwise what the
// public database says, or nothing.
const suggest = async (raw) => {
  const parsed = normaliseBarcode(raw);
  if (!parsed) fail(400, NOT_A_BARCODE);
  const existing = await barcodeRepo.findByCode(parsed.code);
  if (existing) {
    return { code: parsed.code, linkedTo: { productId: existing.product_id, productName: existing.product_name }, suggestion: null };
  }
  return { code: parsed.code, linkedTo: null, suggestion: await openFoodFacts.lookupProduct(parsed.code) };
};

export default {
  lookup, listForProduct, listAll, link, unlink, recordScan, suggest, MAX_UNITS_PER_SCAN, SCREENS, OUTCOMES,
};

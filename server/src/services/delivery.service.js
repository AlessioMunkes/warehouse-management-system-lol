// ─────────────────────────────────────────────────────────────
// server/src/services/delivery.service.js
//
// Business logic for goods-in (the procurement dashboard).
// Validates data and enforces rules before touching the DB.
//
// ERROR SHAPE
// Every failure carries a `.status` via fail(), the same convention
// picking, stock, donation and dispatch already use. This module was
// the last holdout: it threw bare Errors and delivery.controller.js
// guessed the status by string-matching the message for the word
// "required". Anything that did not happen to contain that word —
// "Delivery line does not belong to this purchase order.", "Duplicate
// line for the same purchase order item." — came back as a 500 with
// the raw message in the body. Both are ordinary things a receiver
// can act on, and neither is a server fault.
//
// WHAT THIS LAYER GUARANTEES ABOUT A DELIVERY LINE
// The browser sends only purchaseOrderItemId, receivedQuantity,
// overAction and discrepancyReason. Everything used to MOVE STOCK —
// product id, expected quantity, unit — is re-read from the purchase
// order here. WORKER can reach this endpoint, so a crafted request
// must not be able to adjust stock for an arbitrary product.
//
// The header is checked the same way. supplierId used to travel from
// the request body into delivery_notes.supplier_id with nothing
// comparing it against the purchase order's own supplier, so a note
// could name one supplier while receiving another's order. That check
// and the "is this order still open?" check are made authoritatively
// inside the repository's transaction; the copies here exist only so
// the common failure comes back as a clean 404/409 without opening
// one.
// ─────────────────────────────────────────────────────────────
import deliveryModel from '../repositories/delivery.repository.js';
import { isValidDateString, isPositiveInt, isUuid } from '../utils/validation.js';

// ── fail ───────────────────────────────────────────────────────
// Mirrors picking.service.js, stock.service.js and the rest.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ── Get deliveries by date range ──────────────────────────────
const getDeliveries = async (range) => {
  const validRanges = ['today', 'week', 'month', 'all'];
  const safeRange   = validRanges.includes(range) ? range : 'all';
  return await deliveryModel.getDeliveries(safeRange);
};

// ── Get a single delivery with line items ─────────────────────
const getDeliveryById = async (id) => {
  if (!isPositiveInt(id)) fail(400, 'Invalid delivery ID.');
  const delivery = await deliveryModel.getDeliveryById(id);
  if (!delivery) fail(404, 'Delivery not found.');
  return delivery;
};

// ── Record a new delivery ─────────────────────────────────────
// Returns { note, warnings, duplicate }. duplicate is TRUE for a
// replayed submit — the original note comes back and nothing is
// written a second time. That is a success, not a failure: the
// receiving tablet that lost signal and retried did exactly the right
// thing, and telling it otherwise would teach staff to submit twice.
const createDelivery = async (data, userId) => {
  const { supplierId, deliveryDate, purchaseOrderId,
          signatureData, poCompleted, lineItems, idempotencyKey } = data || {};

  // ── Header shape ────────────────────────────────────────────
  if (!supplierId)      fail(400, 'Supplier is required.');
  if (!deliveryDate)    fail(400, 'Delivery date is required.');
  if (!purchaseOrderId) fail(400, 'Purchase order is required.');
  if (!signatureData)   fail(400, 'Driver signature is required.');

  // Checked rather than passed through: both reach foreign keys, and
  // an unvalidated one comes back as a 500 with a Postgres message
  // in it.
  if (!isPositiveInt(supplierId))      fail(400, 'Invalid supplier.');
  if (!isPositiveInt(purchaseOrderId)) fail(400, 'Invalid purchase order.');

  // deliveryDate goes to a DATE column. new Date(x) accepts far too
  // much to validate with — see utils/validation.js.
  if (!isValidDateString(deliveryDate)) {
    fail(400, 'Delivery date must be a real date in YYYY-MM-DD form.');
  }

  if (idempotencyKey !== undefined && idempotencyKey !== null && !isUuid(idempotencyKey)) {
    fail(400, 'Invalid request key.');
  }

  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    fail(400, 'At least one delivery line is required.');
  }

  // ── Retried submit ──────────────────────────────────────────
  // Answered before any of the work below, so the common retry costs
  // one indexed read. The repository's replay check and ON CONFLICT
  // cover the race where two taps get past this together.
  if (idempotencyKey) {
    const existing = await deliveryModel.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      const note = await deliveryModel.getDeliveryById(existing.id);
      return { note, warnings: [], duplicate: true };
    }
  }

  // ── The purchase order ──────────────────────────────────────
  // Read here for a clean early error. The repository re-checks both
  // of these under FOR UPDATE, because a check made before BEGIN is
  // one another request can overtake.
  const purchaseOrder = await deliveryModel.getPurchaseOrder(purchaseOrderId);
  if (!purchaseOrder) fail(404, 'Purchase order not found.');

  if (Number(purchaseOrder.supplier_id) !== Number(supplierId)) {
    fail(409, 'That purchase order belongs to a different supplier. Check the order number on the delivery note.');
  }
  if (purchaseOrder.status !== 'approved') {
    fail(409, purchaseOrder.status === 'completed'
      ? 'This purchase order has already been closed off. A manager needs to reopen it before anything else can be received against it.'
      : 'This purchase order has not been approved yet, so nothing can be received against it.');
  }

  // ── The lines ───────────────────────────────────────────────
  const poItems = await deliveryModel.getPurchaseOrderItems(purchaseOrderId);
  const poById  = new Map(poItems.map((i) => [String(i.purchase_order_item_id), i]));

  const seen     = new Set();
  const resolved = [];
  let hasDiscrepancy = false;

  for (const line of lineItems) {
    const key = String(line?.purchaseOrderItemId);
    const po  = poById.get(key);

    if (!po)           fail(400, 'Delivery line does not belong to this purchase order.');
    if (seen.has(key)) fail(400, 'Duplicate line for the same purchase order item.');
    seen.add(key);

    const expected = Number(po.expected_quantity);
    const received = Number(line.receivedQuantity);

    if (!Number.isFinite(received) || received < 0) {
      fail(400, `Received quantity for ${po.product_name} must be zero or more.`);
    }

    // A surplus can be taken into stock or turned away at the gate.
    // Either way received_quantity records what physically arrived —
    // the generated discrepancy_quantity column depends on it.
    let accepted = received;
    if (received > expected && line.overAction === 'reject') accepted = expected;

    const variance = received - expected;

    if (variance !== 0 && !String(line.discrepancyReason || '').trim()) {
      fail(400, `A reason is required for ${po.product_name} — received ${received}, expected ${expected}.`);
    }
    if (variance !== 0) hasDiscrepancy = true;

    resolved.push({
      productId:           po.product_id,
      purchaseOrderItemId: po.purchase_order_item_id,
      expectedQuantity:    expected,
      expectedWeightKg:    po.expected_weight_kg ?? null,
      receivedQuantity:    received,   // what arrived — drives discrepancy_quantity
      acceptedQuantity:    accepted,   // what goes into stock
      unit:                po.default_unit,
      discrepancyReason:   variance === 0 ? null : String(line.discrepancyReason).trim(),
    });
  }

  const result = await deliveryModel.createDelivery({
    supplierId,
    deliveryDate,
    purchaseOrderId,
    signatureData,
    poCompleted: !!poCompleted,
    receivedBy:  userId,          // comes from JWT — never trusted from frontend
    lineItems:   resolved,
    hasDiscrepancy,
    idempotencyKey: idempotencyKey || null,
  });

  // ── The repository's own verdict ────────────────────────────
  // These repeat the checks above deliberately. The ones above are
  // for a fast, clear error; these are the ones that are actually
  // load-bearing, because they were made inside the transaction with
  // the row locked.
  if (result.purchaseOrderNotFound) fail(404, 'Purchase order not found.');
  if (result.supplierMismatch) {
    fail(409, 'That purchase order belongs to a different supplier. Check the order number on the delivery note.');
  }
  if (result.purchaseOrderNotOpen) {
    fail(409, 'This purchase order was closed off while you were recording this delivery. Ask a manager to reopen it.');
  }

  // Lost the ON CONFLICT race — another request wrote this key first.
  if (result.duplicate) {
    const existing = result.deliveryNoteId
      ? { id: result.deliveryNoteId }
      : await deliveryModel.findByIdempotencyKey(idempotencyKey);
    const note = existing ? await deliveryModel.getDeliveryById(existing.id) : null;
    return { note, warnings: [], duplicate: true };
  }

  // The repository's own insert only returns the bare delivery_notes
  // row it just wrote — no supplier name, no line items, no PO status.
  // The note PDF needs all of that, and used to be handed just the id
  // and fetch the rest itself in a second round trip from the tablet.
  // Fetching it here instead costs one extra LOCAL query, on a
  // connection already open, rather than a second HTTP round trip
  // from wherever the receiving flow is running — the same join
  // getDeliveryById always did, just moved to where it's cheap.
  const { warnings = [] } = result;
  const note = await deliveryModel.getDeliveryById(result.id);
  return { note, warnings, duplicate: false };
};

// ── Get suppliers ─────────────────────────────────────────────
// openOrdersOnly narrows this to suppliers with an approved order —
// the Form view's supplier picker uses it so it never offers a
// supplier with nothing to receive against.
const getSuppliers = async (openOrdersOnly = false) => {
  return openOrdersOnly
    ? await deliveryModel.getSuppliersWithOpenOrders()
    : await deliveryModel.getSuppliers();
};

// ── Get products ──────────────────────────────────────────────
const getProducts = async () => {
  return await deliveryModel.getProducts();
};

// ── Get approved POs for a supplier ──────────────────────────
const getPurchaseOrdersBySupplier = async (supplierId) => {
  if (!supplierId)                  fail(400, 'Supplier ID is required.');
  if (!isPositiveInt(supplierId))   fail(400, 'Invalid supplier.');
  return await deliveryModel.getPurchaseOrdersBySupplier(supplierId);
};

// ── Get items for a specific PO ───────────────────────────────
const getPurchaseOrderItems = async (purchaseOrderId) => {
  if (!purchaseOrderId)                  fail(400, 'Purchase Order ID is required.');
  if (!isPositiveInt(purchaseOrderId))   fail(400, 'Invalid purchase order.');

  const items = await deliveryModel.getPurchaseOrderItems(purchaseOrderId);
  // 404, not 400. The caller asked for a real thing and it has no
  // lines; that is not a malformed request.
  if (!items.length) fail(404, 'No items found for this purchase order.');
  return items;
};

export default {
  getDeliveries,
  getDeliveryById,
  createDelivery,
  getSuppliers,
  getProducts,
  getPurchaseOrdersBySupplier,
  getPurchaseOrderItems,
};
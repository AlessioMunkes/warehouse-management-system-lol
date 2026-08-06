// ─────────────────────────────────────────────────────────────
// server/src/services/delivery.service.js
//
// Business logic for the procurement dashboard.
// Validates data and enforces rules before touching the DB.
// ─────────────────────────────────────────────────────────────
import deliveryModel from '../repositories/delivery.repository.js';

// ── Get deliveries by date range ──────────────────────────────
const getDeliveries = async (range) => {
  const validRanges = ['today', 'week', 'month', 'all'];
  const safeRange   = validRanges.includes(range) ? range : 'all';
  return await deliveryModel.getDeliveries(safeRange);
};

// ── Get a single delivery with line items ─────────────────────
const getDeliveryById = async (id) => {
  if (!id) throw new Error('Delivery ID is required.');
  const delivery = await deliveryModel.getDeliveryById(id);
  if (!delivery) throw new Error('Delivery not found.');
  return delivery;
};

// ── Record a new delivery ─────────────────────────────────────
// The browser sends only purchaseOrderItemId, receivedQuantity,
// overAction and discrepancyReason per line. Everything used to move
// stock — product id, expected quantity, unit — is re-read from the
// purchase order here. WORKER can reach this endpoint, so a crafted
// request must not be able to adjust stock for an arbitrary product.
const createDelivery = async (data, userId) => {
  const { supplierId, deliveryDate, purchaseOrderId,
          signatureData, poCompleted, lineItems } = data;

  if (!supplierId)      throw new Error('Supplier is required.');
  if (!deliveryDate)    throw new Error('Delivery date is required.');
  if (!purchaseOrderId) throw new Error('Purchase order is required.');
  if (!signatureData)   throw new Error('Driver signature is required.');
  if (!Array.isArray(lineItems) || lineItems.length === 0)
    throw new Error('At least one delivery line is required.');

  const poItems = await deliveryModel.getPurchaseOrderItems(purchaseOrderId);
  const poById  = new Map(poItems.map((i) => [String(i.purchase_order_item_id), i]));

  const seen     = new Set();
  const resolved = [];
  let hasDiscrepancy = false;

  for (const line of lineItems) {
    const key = String(line.purchaseOrderItemId);
    const po  = poById.get(key);

    if (!po)           throw new Error('Delivery line does not belong to this purchase order.');
    if (seen.has(key)) throw new Error('Duplicate line for the same purchase order item.');
    seen.add(key);

    const expected = Number(po.expected_quantity);
    const received = Number(line.receivedQuantity);

    if (!Number.isFinite(received) || received < 0)
      throw new Error(`Received quantity for ${po.product_name} must be zero or more.`);

    // A surplus can be taken into stock or turned away at the gate.
    // Either way received_quantity records what physically arrived —
    // the generated discrepancy_quantity column depends on it.
    let accepted = received;
    if (received > expected && line.overAction === 'reject') accepted = expected;

    const variance = received - expected;

    if (variance !== 0 && !String(line.discrepancyReason || '').trim())
      throw new Error(`A reason is required for ${po.product_name} — received ${received}, expected ${expected}.`);
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

  return await deliveryModel.createDelivery({
    supplierId,
    deliveryDate,
    purchaseOrderId,
    signatureData,
    poCompleted: !!poCompleted,
    receivedBy:  userId,          // comes from JWT — never trusted from frontend
    lineItems:   resolved,
    hasDiscrepancy,
  });
};

// ── Get suppliers ─────────────────────────────────────────────
const getSuppliers = async () => {
  return await deliveryModel.getSuppliers();
};

// ── Get products ──────────────────────────────────────────────
const getProducts = async () => {
  return await deliveryModel.getProducts();
};

// ── Get approved POs for a supplier ──────────────────────────
const getPurchaseOrdersBySupplier = async (supplierId) => {
  if (!supplierId) throw new Error('Supplier ID is required.');
  return await deliveryModel.getPurchaseOrdersBySupplier(supplierId);
};

// ── Get items for a specific PO ───────────────────────────────
const getPurchaseOrderItems = async (purchaseOrderId) => {
  if (!purchaseOrderId) throw new Error('Purchase Order ID is required.');
  const items = await deliveryModel.getPurchaseOrderItems(purchaseOrderId);
  if (!items.length) throw new Error('No items found for this purchase order.');
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
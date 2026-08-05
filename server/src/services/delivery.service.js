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
// Just records that the delivery happened against a purchase order.
// Items are already known from the PO — no cross-check needed.
const createDelivery = async (data, userId) => {
  const { supplierId, deliveryDate, purchaseOrderId, signatureData, poCompleted } = data;

  if (!supplierId)       throw new Error('Supplier is required.');
  if (!deliveryDate)     throw new Error('Delivery date is required.');
  if (!purchaseOrderId)  throw new Error('Purchase order is required.');
  if (!signatureData)    throw new Error('Driver signature is required.');

  return await deliveryModel.createDelivery({
    supplierId,
    deliveryDate,
    purchaseOrderId,
    signatureData,
    poCompleted: !!poCompleted,  // ensure boolean
    receivedBy: userId,          // comes from JWT — never trusted from frontend
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

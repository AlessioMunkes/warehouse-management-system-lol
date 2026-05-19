// ─────────────────────────────────────────────────────────────
// server/src/services/delivery.service.js
//
// Business logic for the procurement dashboard.
// Validates data and enforces rules before touching the DB.
// ─────────────────────────────────────────────────────────────
import deliveryModel from '../models/delivery.model.js';

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
const createDelivery = async (data, userId) => {
  const { supplierId, driverId, deliveryDate, lineItems } = data;

  // Validate required fields
  if (!supplierId)              throw new Error('Supplier is required.');
  if (!driverId)                throw new Error('Driver is required.');
  if (!deliveryDate)            throw new Error('Delivery date is required.');
  if (!lineItems?.length)       throw new Error('At least one line item is required.');

  // Validate each line item
  for (const item of lineItems) {
    if (!item.productId)        throw new Error('Each line item must have a product.');
    if (item.expectedQuantity < 0) throw new Error('Expected quantity cannot be negative.');
    if (item.actualQuantity < 0)   throw new Error('Actual quantity cannot be negative.');
  }

  return await deliveryModel.createDelivery({
    supplierId,
    driverId,
    deliveryDate,
    receivedBy: userId,   // comes from the JWT via req.user — never from the frontend body
    lineItems,
  });
};

// ── Get suppliers ─────────────────────────────────────────────
const getSuppliers = async () => {
  return await deliveryModel.getSuppliers();
};

// ── Get drivers (optionally by supplier) ─────────────────────
const getDrivers = async (supplierId) => {
  return await deliveryModel.getDrivers(supplierId || null);
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
  getDrivers,
  getProducts,
  getPurchaseOrdersBySupplier,
  getPurchaseOrderItems,
};

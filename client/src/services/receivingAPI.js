// ─────────────────────────────────────────────────────────────
// client/src/services/receivingAPI.js
//
// The receiving flow speaks to the delivery endpoints — confirmed
// against server/src/routes/delivery.routes.js and
// delivery.controller.js: all of them return the { success, data }
// envelope, so every function below unwraps .data, the same contract
// decantingAPI.js follows.
//
// POST /api/deliveries now accepts, per migrations/00X_receiving_
// dispatch.sql and the matching delivery.service.js changes:
//   { supplierId, deliveryDate, purchaseOrderId,
//     signatureData, poCompleted,
//     lineItems: [{ purchaseOrderItemId, receivedQuantity, overAction,
//                    location, expiryDate, discrepancyReason }] }
//
// location is required per line; expiryDate only for a line whose
// product is is_perishable. This 500s if that migration hasn't been
// applied to the database this API is talking to yet.
//
// No driver field — there is no drivers table and nothing in this
// flow captures a driver name. delivery_notes.driver_name is the real
// column if that's ever added; it isn't written from here today.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';

// GET /api/deliveries/suppliers
export const getSuppliers = async () => {
  const res = await apiGet('/api/deliveries/suppliers');
  return res.data ?? [];
};

// GET /api/deliveries/purchase-orders?supplierId=
// Approved orders only, per delivery.repository. This is the "which
// delivery is this?" list on step 1: the driver's note references an
// order, and picking it is what tells us the expected lines.
export const getPurchaseOrders = async (supplierId) => {
  const res = await apiGet(
    `/api/deliveries/purchase-orders?supplierId=${encodeURIComponent(supplierId)}`
  );
  return res.data ?? [];
};

// GET /api/deliveries/purchase-orders/:id/items
// Returns { id, product_id, expected_quantity, expected_weight_kg,
// unit_price, product_name, sku } — the expected column on the
// counting screens.
export const getPurchaseOrderItems = async (purchaseOrderId) => {
  const res = await apiGet(`/api/deliveries/purchase-orders/${purchaseOrderId}/items`);
  return res.data ?? [];
};

// GET /api/deliveries/products
// Used by the "add something else" door: a donation, or an unexpected
// pallet. BR-05 says an unknown stock code is never accepted as free
// text, so staff pick from this list or not at all.
export const getProducts = async () => {
  const res = await apiGet('/api/deliveries/products');
  return res.data ?? [];
};

// POST /api/deliveries
export const recordDelivery = async ({
  supplierId, deliveryDate, purchaseOrderId, signatureData, poCompleted, lineItems,
}) => {
  const res = await apiPost('/api/deliveries', {
    supplierId,
    deliveryDate,
    purchaseOrderId,
    signatureData,
    poCompleted: Boolean(poCompleted),
    lineItems,
  });
  return res.data;
};

export default {
  getSuppliers,
  getPurchaseOrders,
  getPurchaseOrderItems,
  getProducts,
  recordDelivery,
};

// ─────────────────────────────────────────────────────────────
// client/src/services/receivingAPI.js
//
// The receiving flow speaks to the EXISTING delivery endpoints —
// there is no new backend here. Confirmed against
// server/src/routes/delivery.routes.js and delivery.controller.js:
// all of them return the { success, data } envelope, so every
// function below unwraps .data, the same contract decantingAPI.js
// follows.
//
// What the server accepts today, and what that means for this UI:
//
//   POST /api/deliveries requires
//     { supplierId, driverId, deliveryDate, purchaseOrderId,
//       signatureData, poCompleted }
//
//   It records THAT a delivery arrived against a purchase order. It
//   does NOT accept per-line counted quantities, put-away locations
//   or use-by dates — delivery.service.js says the items are
//   "already known from the PO, no cross-check needed".
//
// The wireframes do capture those three things per line, because URS
// 1.3 and the sponsor's short-delivery problem both need them. So
// this module sends what the server takes and passes the counted
// lines as a "lines" array in the same body: harmless to the current
// controller, which destructures only the fields it knows, and the
// shape the endpoint should grow into. HANDOFF.md has the one server
// change that persists them.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from './api';

// GET /api/deliveries/suppliers
export const getSuppliers = async () => {
  const res = await apiGet('/api/deliveries/suppliers');
  return res.data ?? [];
};

// GET /api/deliveries/drivers?supplierId=
// supplierId is optional server-side; passing it is what keeps the
// driver list short enough to tap instead of scroll.
export const getDrivers = async (supplierId) => {
  const qs = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : '';
  const res = await apiGet(`/api/deliveries/drivers${qs}`);
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
  supplierId, driverId, deliveryDate, purchaseOrderId, signatureData, poCompleted, lines,
}) => {
  const res = await apiPost('/api/deliveries', {
    supplierId,
    driverId,
    deliveryDate,
    purchaseOrderId,
    signatureData,
    poCompleted: Boolean(poCompleted),
    lines, // ignored by the current controller, see the header note
  });
  return res.data;
};

export default {
  getSuppliers,
  getDrivers,
  getPurchaseOrders,
  getPurchaseOrderItems,
  getProducts,
  recordDelivery,
};

// ─────────────────────────────────────────────────────────────
// client/src/services/receivingAPI.js
//
// The receiving flow speaks to the delivery endpoints — confirmed
// against server/src/routes/delivery.routes.js and
// delivery.controller.js: all of them return the { success, data }
// envelope, so every function below unwraps .data, the same contract
// decantingAPI.js follows.
//
// POST /api/deliveries accepts:
//   { supplierId, deliveryDate, purchaseOrderId,
//     signatureData, poCompleted, idempotencyKey,
//     lineItems: [{ purchaseOrderItemId, receivedQuantity, overAction,
//                    location, expiryDate, discrepancyReason }] }
//
// idempotencyKey is what stops a retried submit receiving the same
// pallet twice. Receiving happens on a tablet at a loading bay on a
// Monday morning; a dropped connection used to mean a second delivery
// note and a second call to adjustStock, so the stock went up twice
// for one physical delivery with two plausible notes to explain it.
// One key per attempt, reused on every retry of that attempt — see
// ReceivingFlow.jsx.
//
// location is required per line; expiryDate only for a line whose
// product is is_perishable. This 500s if that migration hasn't been
// applied to the database this API is talking to yet.
//
// No driver field — there is no drivers table and nothing in this
// flow captures a driver name. delivery_notes.driver_name is the real
// column if that's ever added; it isn't written from here today.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, cachedGet, invalidateCache } from './api';

// 60s: short enough that a supplier added this morning shows up
// within a minute of the next page visit, long enough that hopping
// into Receiving twice in a row doesn't re-pay the round trip both
// times. See api.js's cachedGet for why this exists at all.
const SUPPLIER_CACHE_TTL_MS = 60_000;

// GET /api/deliveries/suppliers
export const getSuppliers = async () =>
  cachedGet('deliveries:suppliers', SUPPLIER_CACHE_TTL_MS, async () => {
    const res = await apiGet('/api/deliveries/suppliers');
    return res.data ?? [];
  });

// GET /api/deliveries/suppliers?openOrdersOnly=true
// For the Form view's supplier dropdown: only suppliers with an
// approved order worth receiving against.
export const getSuppliersWithOpenOrders = async () =>
  cachedGet('deliveries:suppliers:open', SUPPLIER_CACHE_TTL_MS, async () => {
    const res = await apiGet('/api/deliveries/suppliers?openOrdersOnly=true');
    return res.data ?? [];
  });

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
// Returns the delivery note with `duplicate` on it. A duplicate is a
// SUCCESS — the retry did the right thing and the goods were only
// received once — so callers should say "already recorded" rather
// than treating it as a failure.
export const recordDelivery = async ({
  supplierId, deliveryDate, purchaseOrderId, signatureData, poCompleted,
  lineItems, idempotencyKey,
}) => {
  const res = await apiPost('/api/deliveries', {
    supplierId,
    deliveryDate,
    purchaseOrderId,
    signatureData,
    poCompleted: Boolean(poCompleted),
    lineItems,
    idempotencyKey: idempotencyKey || null,
  });
  // A receiving submission can flip its purchase order to 'completed'
  // (poCompleted above), which changes who has an open order — the
  // cached open-suppliers list from getSuppliersWithOpenOrders would
  // otherwise still offer that supplier for up to a minute afterwards.
  invalidateCache('deliveries:suppliers:open');
  return res.data;
};

// GET /api/deliveries?range=today|week|month|all
// The staff deliveries dashboard's list — same range shape
// ProcurementDashboard already understands, defaults to 'all'.
export const getDeliveries = async (range = 'all') => {
  const res = await apiGet(`/api/deliveries?range=${encodeURIComponent(range)}`);
  return res.data ?? [];
};

// GET /api/deliveries/:id
// One delivery with its line items and signature, for the note PDF —
// created fresh right after a submit, or opened later from the
// deliveries dashboard.
export const getDeliveryById = async (id) => {
  const res = await apiGet(`/api/deliveries/${id}`);
  return res.data;
};

export default {
  getSuppliers,
  getSuppliersWithOpenOrders,
  getPurchaseOrders,
  getPurchaseOrderItems,
  getProducts,
  recordDelivery,
  getDeliveries,
  getDeliveryById,
};
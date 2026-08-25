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
  return res.data;
};

// ─────────────────────────────────────────────────────────────
// THE GOODS-IN ARCHIVE
//
// GET /api/deliveries returns { rows, total, limit, offset } — NOT a bare
// array. It used to return an array and had no caller in client/src at all,
// which is why changing the shape is safe.
//
// Every row carries has_discrepancies and discrepancy_count, so the list can
// show which notes need a manager's attention without opening each one.
// ─────────────────────────────────────────────────────────────
export const getDeliveries = async ({
  from, to, supplierId, status, search, sort, dir, limit, offset,
} = {}) => {
  const params = new URLSearchParams();
  if (from)       params.set('from', from);
  if (to)         params.set('to', to);
  if (supplierId) params.set('supplierId', supplierId);
  if (status)     params.set('status', status);
  if (search)     params.set('search', search);
  if (sort)       params.set('sort', sort);
  if (dir)        params.set('dir', dir);
  if (limit  !== undefined) params.set('limit', limit);
  if (offset !== undefined) params.set('offset', offset);

  const qs  = params.toString();
  const res = await apiGet(`/api/deliveries${qs ? `?${qs}` : ''}`);
  return res.data ?? { rows: [], total: 0, limit: 25, offset: 0 };
};

// GET /api/deliveries/:id
// The full note: line items with received AND expected quantities, the
// signature, discrepancy reasons, and items_from_purchase_order — which is
// TRUE when the lines came off the purchase order because the note predates
// delivery_note_items. When it is true the quantities are what was ORDERED,
// not a record of what physically arrived, and the document must say so.
// (Zero notes are in that state today, but the branch is kept live rather
// than deleted, because a silently wrong delivery note is the exact failure
// this feature exists to prevent.)
export const getDeliveryById = async (id) => {
  const res = await apiGet(`/api/deliveries/${id}`);
  return res.data ?? null;
};

// GET /api/deliveries/supplier-options
// Only suppliers that actually have notes — a filter offering suppliers with
// no history is a filter that mostly returns nothing.
export const getSupplierOptions = async () => {
  const res = await apiGet('/api/deliveries/supplier-options');
  return res.data ?? [];
};

export default {
  getSuppliers,
  getPurchaseOrders,
  getPurchaseOrderItems,
  getProducts,
  recordDelivery,
  getDeliveries,
  getDeliveryById,
  getSupplierOptions,
};
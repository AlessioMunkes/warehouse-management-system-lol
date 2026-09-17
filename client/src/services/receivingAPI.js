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
import { queueIfOffline } from './outbox';

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

// GET /api/deliveries/purchase-orders[?supplierId=]
// Open orders only, per delivery.repository. This is the "which
// delivery is this?" list on step 1: the driver's note references an
// order, and picking it is what tells us the expected lines.
//
// supplierId is optional. Without it this returns every open order in
// the building, which is what the receiving screen searches when a
// worker has a number off a driver's note and does not know which
// supplier the system files it under.
//
// The branch matters: template-stringing an undefined supplierId
// sends the literal text "undefined" as the filter, which matches
// nothing and looks exactly like "there are no orders".
export const getPurchaseOrders = async (supplierId) => {
  const qs = supplierId === undefined || supplierId === null || supplierId === ''
    ? ''
    : `?supplierId=${encodeURIComponent(supplierId)}`;
  const res = await apiGet(`/api/deliveries/purchase-orders${qs}`);
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
//
// With no signal it returns { queued: true, label } instead: the
// submission is held on this device and sent when the server can be
// reached again. See outbox.js for why only this and the collection
// at the gate are allowed to wait.
export const recordDelivery = async ({
  supplierId, deliveryDate, purchaseOrderId, signatureData, poCompleted,
  lineItems, idempotencyKey,
}) => {
  const body = {
    supplierId,
    deliveryDate,
    purchaseOrderId,
    signatureData,
    poCompleted: Boolean(poCompleted),
    lineItems,
    idempotencyKey: idempotencyKey || null,
  };

  let res;
  try {
    res = await apiPost('/api/deliveries', body);
  } catch (err) {
    // No signal: keep it on the phone rather than losing a counted
    // delivery. Returns { queued: true } so the flow can say so
    // instead of pretending the stock is on the system.
    const label = purchaseOrderId ? `Order ${purchaseOrderId}` : 'A delivery';
    if (await queueIfOffline(err, {
      endpoint: '/api/deliveries', body, kind: 'delivery', label,
    })) {
      return { queued: true, label };
    }
    throw err;
  }

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
  // .rows, not .data. This endpoint returns { rows, total, limit, offset }
  // — see the header on getDeliveryArchive below and the matching note in
  // delivery.controller.js. Returning res.data handed callers the envelope
  // object; `list.length === 0` was then `undefined === 0` (false), so the
  // empty-state branch never ran and the next line called .map on an
  // object. Array.isArray keeps an older server that still returns a bare
  // array working rather than silently rendering nothing.
  const data = res.data;
  if (Array.isArray(data)) return data;
  return data?.rows ?? [];
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
export const getDeliveryArchive = async ({
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
  getSuppliersWithOpenOrders,
  getPurchaseOrders,
  getPurchaseOrderItems,
  getProducts,
  recordDelivery,
  getDeliveries,
  getDeliveryArchive,
  getDeliveryById,
  getSupplierOptions,
};
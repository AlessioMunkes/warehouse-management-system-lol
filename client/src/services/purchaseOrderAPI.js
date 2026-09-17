// ─────────────────────────────────────────────────────────────
// src/services/purchaseOrderAPI.js
//
// Client wrapper around /api/purchase-orders. Mirrors
// purchaseOrder.controller.js — one function per route.
//
// Same two jobs as supplierAPI.js and stockAPI.js:
//   1. Unwrap the { success, data } envelope, so components get the
//      array or object they expect rather than the whole body.
//   2. Map snake_case to camelCase in one place, so every screen
//      reading a purchase order gets the same shape.
//
// THE NUMERIC CASTS ARE NOT COSMETIC.
// unit_price, expected_weight_kg, estimated_value and received_to_date
// are all NUMERIC in Postgres, and node-postgres returns NUMERIC as a
// STRING to avoid float precision loss. Uncast, "1200" > 500 is false
// (string compare) and "1200" + 300 concatenates to "1200300" — the
// same trap stockAPI.js documents at length.
//
// But null must survive the cast. Number(null) is 0, and a line whose
// price nobody recorded would then render "R 0.00" as though the goods
// were free. expectedQuantity is INTEGER, which pg already returns as
// a number, so it needs no such care.
//
// There is no delete — nothing in the URS asks for a PO to be
// destroyed. setPurchaseOrderStatus is the one update path, and it
// only ever moves a PO through its states (BR-07B); it cannot edit
// the lines, supplier, or anything else about it in place.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch } from "./api";

// ── BR-07B, for display ───────────────────────────────────────
// Mirrors PO_STATUSES in server/src/services/purchaseOrder.service.js
// and the database CHECK constraint. Three copies of one list is two
// too many, but the server cannot hand the client its labels without
// an endpoint that exists only to do that — so this file is the
// single client-side copy, and every screen reads it rather than
// writing its own switch.
export const PO_STATUS_LABELS = {
  pending:            "Pending approval",
  approved:           "Approved",
  in_transit:         "In transit",
  partially_received: "Partially received",
  completed:          "Completed",
  returned:           "Returned",
  follow_up_required: "Follow-up required",
};

// Which states can still be received against. Mirrors OPEN_PO_STATUSES
// in server/src/constants/purchaseOrderStatus.js — if that changes,
// change this with it. 'follow_up_required' is not here: a decision has
// been taken on those, and reopening one is a manager's action.
export const OPEN_PO_STATUSES = [
  "pending", "approved", "in_transit", "partially_received",
];

// ── Row mappers ───────────────────────────────────────────────
const toLine = (row) => ({
  id:               row.id,
  productId:        row.product_id,
  productName:      row.product_name ?? "",
  sku:              row.sku ?? "",
  defaultUnit:      row.default_unit ?? "",
  expectedQuantity: Number(row.expected_quantity ?? 0),
  expectedWeightKg: row.expected_weight_kg === null || row.expected_weight_kg === undefined
    ? null : Number(row.expected_weight_kg),
  unitPrice: row.unit_price === null || row.unit_price === undefined
    ? null : Number(row.unit_price),
  // BR-07A: summed from delivery_note_items across every instalment
  // logged against this line, not a column on the line itself.
  receivedToDate: Number(row.received_to_date ?? 0),
});

export const toPurchaseOrder = (row) => ({
  id:                   row.id,
  poNumber:             row.po_number ?? "",
  supplierId:           row.supplier_id,
  supplierName:         row.supplier_name ?? "",
  supplierIsActive:     row.supplier_is_active === undefined ? true : Boolean(row.supplier_is_active),
  status:               row.status,
  statusLabel:          PO_STATUS_LABELS[row.status] ?? row.status,
  statusReason:         row.status_reason ?? "",
  statusChangedAt:      row.status_changed_at ?? null,
  expectedDeliveryDate: row.expected_delivery_date ?? null,
  notes:                row.notes ?? "",
  quickbooksPoId:       row.quickbooks_po_id ?? "",
  createdByName:        row.created_by_name ?? "",
  createdAt:            row.created_at ?? null,
  lineCount:            Number(row.line_count ?? 0),
  estimatedValue:       Number(row.estimated_value ?? 0),
  receiptCount:         Number(row.receipt_count ?? 0),
  items:                (row.items ?? []).map(toLine),
});

// ── GET /api/purchase-orders ──────────────────────────────────
export const getPurchaseOrders = async ({ status = "", supplierId = null } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (supplierId) params.set("supplierId", String(supplierId));
  const qs = params.toString();
  const body = await apiGet(`/api/purchase-orders${qs ? `?${qs}` : ""}`);
  return (body.data ?? []).map(toPurchaseOrder);
};

// ── GET /api/purchase-orders/:id ──────────────────────────────
export const getPurchaseOrder = async (id) => {
  const body = await apiGet(`/api/purchase-orders/${id}`);
  return toPurchaseOrder(body.data ?? {});
};

// ── POST /api/purchase-orders ─────────────────────────────────
// The 400 for unconfigured stock codes carries missingProductIds.
// api.js's handleResponse throws an Error with .status but drops the
// rest of the body, so it is reattached here — without it the form
// can only say "something is wrong" about a thirty-line order.
export const createPurchaseOrder = async (payload) => {
  try {
    const body = await apiPost("/api/purchase-orders", payload);
    return toPurchaseOrder(body.data ?? {});
  } catch (err) {
    if (err.status === 400 && err.missingProductIds) {
      err.missingProductIds = err.missingProductIds.map(Number);
    }
    throw err;
  }
};

// ── PATCH /api/purchase-orders/:id/status ───────────────────────
// reason is only actually required by the server when status is
// 'returned' — see purchaseOrder.service.js's setPurchaseOrderStatus.
export const setPurchaseOrderStatus = async (id, status, reason = null) => {
  const body = await apiPatch(`/api/purchase-orders/${id}/status`, { status, reason });
  return toPurchaseOrder(body.data ?? {});
};

export const approvePurchaseOrder = async (id) => setPurchaseOrderStatus(id, "approved");

export default {
  getPurchaseOrders, getPurchaseOrder, createPurchaseOrder,
  setPurchaseOrderStatus, approvePurchaseOrder,
};

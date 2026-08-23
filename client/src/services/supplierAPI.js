// ─────────────────────────────────────────────────────────────
// src/services/supplierAPI.js
//
// Client wrapper around /api/suppliers. Mirrors
// supplier.controller.js — one function per route.
//
// Two jobs, same as stockAPI.js:
//   1. Unwrap the { success, data } envelope, so components get the
//      array or object they expect rather than the whole body.
//   2. Map snake_case to camelCase in one place, so every screen
//      reading a supplier gets the same shape.
//
// There is no delete for suppliers. purchase_orders.supplier_id and
// delivery_notes.supplier_id are ON DELETE RESTRICT, so deactivation
// is the removal path — see setSupplierStatus below.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch } from "./api";

// ── Row mappers ───────────────────────────────────────────────
export const toSupplier = (row) => ({
  id:                   row.id,
  name:                 row.name,
  contactName:          row.contact_name ?? "",
  contactEmail:         row.contact_email ?? "",
  contactPhone:         row.contact_phone ?? "",
  address:              row.address ?? "",
  agreementRef:         row.agreement_ref ?? "",
  paymentTerms:         row.payment_terms ?? "",
  // Number(null) is 0, which would render "0 days" for a supplier
  // whose lead time nobody has recorded. Null must survive.
  expectedLeadTimeDays: row.expected_lead_time_days === null || row.expected_lead_time_days === undefined
    ? null
    : Number(row.expected_lead_time_days),
  category:             row.category ?? "",
  notes:                row.notes ?? "",
  isActive:             Boolean(row.is_active),
  createdAt:            row.created_at ?? null,
  deactivatedAt:        row.deactivated_at ?? null,
});

const toStats = (row = {}) => ({
  purchaseOrderCount: Number(row.purchase_order_count ?? 0),
  openPurchaseOrders: Number(row.open_purchase_orders ?? 0),
  deliveryNoteCount:  Number(row.delivery_note_count ?? 0),
  lastDeliveryDate:   row.last_delivery_date ?? null,
  openDiscrepancies:  Number(row.open_discrepancies ?? 0),
});

const toPurchaseOrder = (row) => ({
  id:                   row.id,
  status:               row.status,
  expectedDeliveryDate: row.expected_delivery_date ?? null,
  createdAt:            row.created_at,
  lineCount:            Number(row.line_count ?? 0),
  deliveredOn:          row.delivered_on ?? null,
});

export const toProspect = (row) => ({
  id:                  row.id,
  name:                row.name,
  whatTheySupply:      row.what_they_supply ?? "",
  leadSource:          row.lead_source ?? "",
  contactName:         row.contact_name ?? "",
  contactEmail:        row.contact_email ?? "",
  contactPhone:        row.contact_phone ?? "",
  notes:               row.notes ?? "",
  status:              row.status,
  convertedSupplierId: row.converted_supplier_id ?? null,
  createdAt:           row.created_at,
  updatedAt:           row.updated_at,
});

// ── Suppliers ─────────────────────────────────────────────────
export const getSuppliers = async ({ includeInactive = false, search = "" } = {}) => {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "true");
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  const body = await apiGet(`/api/suppliers${qs ? `?${qs}` : ""}`);
  return (body.data ?? []).map(toSupplier);
};

export const getSupplier = async (id) => {
  const body = await apiGet(`/api/suppliers/${id}`);
  const row = body.data ?? {};
  return {
    ...toSupplier(row),
    stats: toStats(row.stats),
    purchaseOrders: (row.purchaseOrders ?? []).map(toPurchaseOrder),
  };
};

export const registerSupplier = async (payload) => {
  const body = await apiPost("/api/suppliers", payload);
  return toSupplier(body.data ?? {});
};

export const updateSupplier = async (id, patch) => {
  const body = await apiPatch(`/api/suppliers/${id}`, patch);
  return toSupplier(body.data ?? {});
};

// Deactivate or reactivate. The server does not block this on open
// purchase orders — the caller is expected to warn first, using
// stats.openPurchaseOrders from getSupplier().
export const setSupplierStatus = async (id, isActive) => {
  const body = await apiPatch(`/api/suppliers/${id}/status`, { isActive });
  return toSupplier(body.data ?? {});
};

// ── Prospects ─────────────────────────────────────────────────
export const getProspects = async ({ status = "" } = {}) => {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const body = await apiGet(`/api/suppliers/prospects${qs}`);
  return (body.data ?? []).map(toProspect);
};

export const addProspect = async (payload) => {
  const body = await apiPost("/api/suppliers/prospects", payload);
  return toProspect(body.data ?? {});
};

export const updateProspect = async (id, patch) => {
  const body = await apiPatch(`/api/suppliers/prospects/${id}`, patch);
  return toProspect(body.data ?? {});
};

// POST, not DELETE — api.js exposes apiGet/apiPost/apiPatch only.
export const deleteProspect = async (id) => {
  const body = await apiPost(`/api/suppliers/prospects/${id}/delete`, {});
  return body.data ?? { id, deleted: true };
};

// Returns { supplier, prospect } so the caller can move the card
// between lists without refetching both.
export const convertProspect = async (id, overrides = {}) => {
  const body = await apiPost(`/api/suppliers/prospects/${id}/convert`, overrides);
  const data = body.data ?? {};
  return {
    supplier: toSupplier(data.supplier ?? {}),
    prospect: toProspect(data.prospect ?? {}),
  };
};

export default {
  getSuppliers, getSupplier, registerSupplier, updateSupplier, setSupplierStatus,
  getProspects, addProspect, updateProspect, deleteProspect, convertProspect,
};

// ─────────────────────────────────────────────────────────────
// src/services/beneficiaryAPI.js
//
// Client wrapper around /api/beneficiaries. Mirrors
// beneficiary.controller.js — one function per route, same two jobs
// as productAPI.js/supplierAPI.js:
//   1. Unwrap the { success, data } envelope.
//   2. Map snake_case to camelCase in one place.
//
// There is no delete — every picking slip references ecd_centres.id
// without ON DELETE CASCADE, same reasoning as products/suppliers.
// setBeneficiaryStatus (deactivate) is the removal path.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch } from "./api";

export const toBeneficiary = (row) => ({
  id:                row.id,
  name:              row.name,
  cohort:            row.cohort,
  contactName:       row.contact_name ?? "",
  childCount:        row.child_count === null || row.child_count === undefined ? null : Number(row.child_count),
  isActive:          Boolean(row.is_active),
  approvedAt:        row.approved_at ?? null,
  lastCollectedDate: row.last_collected_date ?? null,
});

export const getBeneficiaries = async ({ includeInactive = false, search = "" } = {}) => {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "true");
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  const body = await apiGet(`/api/beneficiaries${qs ? `?${qs}` : ""}`);
  return (body.data ?? []).map(toBeneficiary);
};

export const getBeneficiary = async (id) => {
  const body = await apiGet(`/api/beneficiaries/${id}`);
  return toBeneficiary(body.data ?? {});
};

export const createBeneficiary = async (payload) => {
  const body = await apiPost("/api/beneficiaries", payload);
  return toBeneficiary(body.data ?? {});
};

export const updateBeneficiary = async (id, patch) => {
  const body = await apiPatch(`/api/beneficiaries/${id}`, patch);
  return toBeneficiary(body.data ?? {});
};

export const setBeneficiaryStatus = async (id, isActive) => {
  const body = await apiPatch(`/api/beneficiaries/${id}/status`, { isActive });
  return toBeneficiary(body.data ?? {});
};

export const approveBeneficiary = async (id) => {
  const body = await apiPatch(`/api/beneficiaries/${id}/approve`, {});
  return toBeneficiary(body.data ?? {});
};

export default {
  getBeneficiaries, getBeneficiary, createBeneficiary,
  updateBeneficiary, setBeneficiaryStatus, approveBeneficiary,
};

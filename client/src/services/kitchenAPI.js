// ─────────────────────────────────────────────────────────────
// client/src/services/kitchenAPI.js
//
// Soup kitchens and Dignity Kitchens (/api/kitchens, migration 068):
// who they are and how many adults each feeds per collection, which is
// what adults served on the impact report counts.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch } from "./api";

export const KITCHEN_KIND_LABELS = { soup_kitchen: "Soup kitchen", dignity_kitchen: "Dignity Kitchen" };

const toKitchen = (row) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  adultCount: row.adult_count ?? null,
  contactName: row.contact_name ?? "",
  contactPhone: row.contact_phone ?? "",
  address: row.address ?? "",
  isActive: Boolean(row.is_active),
  slipCount: Number(row.slip_count ?? 0),
});

export const getKitchens = async ({ includeInactive = false } = {}) => {
  const body = await apiGet(`/api/kitchens${includeInactive ? "?includeInactive=true" : ""}`);
  return (body.data ?? []).map(toKitchen);
};

export const createKitchen = async (values) => toKitchen((await apiPost("/api/kitchens", values)).data ?? {});

export const updateKitchen = async (id, values) => toKitchen((await apiPatch(`/api/kitchens/${id}`, values)).data ?? {});

export default { getKitchens, createKitchen, updateKitchen, KITCHEN_KIND_LABELS };

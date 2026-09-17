// ─────────────────────────────────────────────────────────────
// src/services/productAPI.js
//
// Client wrapper around /api/products. Mirrors product.controller.js
// — one function per route, same two jobs as supplierAPI.js/userAPI.js:
//   1. Unwrap the { success, data } envelope.
//   2. Map snake_case to camelCase in one place.
//
// deleteProduct does NOT issue a SQL DELETE. Every operational table
// references products.id, most without ON DELETE CASCADE, so the row
// has to survive; what goes away is the product's standing as master
// data. See migration 019 and ConfirmRemoveDialog.jsx, which is where
// that distinction gets explained to the person pressing the button.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch, apiDelete } from "./api";

// The nine values stock_levels_unit_check and stock_movements_unit_check
// allow. Anything outside this list is a constraint violation, not a
// validation message, so the form offers a dropdown rather than a text
// box. Kept beside the row mapper because this is the module that owns
// the product contract on the client.
//
// Server-side twin: STOCK_UNITS in server/src/utils/validation.js.
// DonationItemsList.jsx has a third hand-copied version of the same
// nine values; folding it in belongs with a change that touches the
// donation feature.
export const STOCK_UNITS = ["kg", "g", "l", "ml", "each", "bag", "box", "crate", "punnet"];

// reorder_threshold is NUMERIC, which node-postgres serialises as a
// STRING — without the cast, "20" > 15 compares as text and the field
// renders fine while every comparison built on it is wrong. Same
// reasoning as the casts in stockAPI.js.
//
// There is deliberately no quantity here. This screen is master data;
// on-hand figures come from the inventory manifest, which reports
// available (on hand - committed) so it agrees with the packing check
// and the dispatch gate.
export const toProduct = (row) => ({
  id:               row.id,
  name:             row.name,
  sku:              row.sku ?? "",
  defaultUnit:      row.default_unit ?? "",
  weightKg:         row.weight_kg === null || row.weight_kg === undefined ? null : Number(row.weight_kg),
  category:         row.category ?? "",
  storageType:      row.storage_type ?? "",
  // Nullable FK to storage_locations — null means "not assigned", not
  // "unknown", so this deliberately does NOT fall back to "" the way
  // the string fields above do. An empty string sent back as a patch
  // value would round-trip through parseLocationId as "clear it",
  // which is only correct if that's what was actually intended.
  defaultLocationId: row.default_location_id ?? null,
  isPerishable:     Boolean(row.is_perishable),
  reorderThreshold: Number(row.reorder_threshold ?? 0),
  // What the ledger has actually been accumulating in. Normally equal
  // to defaultUnit; a difference means a product moved before the
  // catalogue set its unit, and the two need reconciling by hand.
  ledgerUnit:       row.ledger_unit ?? "",
  isActive:         Boolean(row.is_active),
  createdAt:        row.created_at ?? null,
  // NUMERIC over the wire is a string, and Number(null) is 0 — a
  // product nobody has priced is not a free one, so null survives.
  // Same guard as weightKg above.
  unitCost:         row.unit_cost === null || row.unit_cost === undefined
                      ? null
                      : Number(row.unit_cost),
});

export const getProducts = async ({ includeInactive = false, search = "" } = {}) => {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "true");
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  const body = await apiGet(`/api/products${qs ? `?${qs}` : ""}`);
  return (body.data ?? []).map(toProduct);
};

export const getProduct = async (id) => {
  const body = await apiGet(`/api/products/${id}`);
  return toProduct(body.data ?? {});
};

export const createProduct = async (payload) => {
  const body = await apiPost("/api/products", payload);
  return toProduct(body.data ?? {});
};

export const updateProduct = async (id, patch) => {
  const body = await apiPatch(`/api/products/${id}`, patch);
  return toProduct(body.data ?? {});
};

export const setProductStatus = async (id, isActive) => {
  const body = await apiPatch(`/api/products/${id}/status`, { isActive });
  return toProduct(body.data ?? {});
};

export const deleteProduct = async (id) => {
  const body = await apiDelete(`/api/products/${id}`);
  return toProduct(body.data ?? {});
};

export default {
  getProducts, getProduct, createProduct, updateProduct, setProductStatus,
  deleteProduct,
  STOCK_UNITS,
};

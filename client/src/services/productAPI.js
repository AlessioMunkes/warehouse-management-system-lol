// ─────────────────────────────────────────────────────────────
// src/services/productAPI.js
//
// Client wrapper around /api/products. Mirrors product.controller.js
// — one function per route, same two jobs as supplierAPI.js/userAPI.js:
//   1. Unwrap the { success, data } envelope.
//   2. Map snake_case to camelCase in one place.
//
// There is no delete for products, same reasoning as suppliers/users:
// every operational table references products.id, most without
// ON DELETE CASCADE — deactivation (setProductStatus) is the removal
// path.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch } from "./api";

export const toProduct = (row) => ({
  id:           row.id,
  name:         row.name,
  sku:          row.sku ?? "",
  defaultUnit:  row.default_unit ?? "",
  weightKg:     row.weight_kg === null || row.weight_kg === undefined ? null : Number(row.weight_kg),
  category:     row.category ?? "",
  isPerishable: Boolean(row.is_perishable),
  isActive:     Boolean(row.is_active),
  createdAt:    row.created_at ?? null,
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

export default {
  getProducts, getProduct, createProduct, updateProduct, setProductStatus,
};

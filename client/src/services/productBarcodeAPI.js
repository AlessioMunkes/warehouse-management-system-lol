// ─────────────────────────────────────────────────────────────
// src/services/productBarcodeAPI.js
//
// Client wrapper around the product barcode routes
// (server/src/routes/productBarcode.routes.js). Unwraps the
// { success, data } envelope and maps snake_case to camelCase, same
// two jobs as productAPI.js.
//
// None of this goes through the offline outbox. A lookup is a question
// that needs an answer now, and a link made while offline would be a
// guess about a code nobody can check; both say so and leave the
// typed product search, which is how items were logged before.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiDelete } from './api';

export const toBarcode = (row) => ({
  id:           row.id,
  productId:    row.product_id,
  code:         row.code,
  unitsPerScan: Number(row.units_per_scan ?? 1),
  supplierId:   row.supplier_id ?? null,
  supplierName: row.supplier_name ?? '',
  createdAt:    row.created_at ?? null,
});

// { code, format, match } where match is null for a code nobody has
// linked yet, or { productId, productName, sku, defaultUnit,
// unitsPerScan, available }.
export const lookupBarcode = async (code) => {
  const body = await apiGet(`/api/products/barcodes/${encodeURIComponent(code)}`);
  return body.data;
};

export const listBarcodes = async (productId) => {
  const body = await apiGet(`/api/products/${productId}/barcodes`);
  return (body.data ?? []).map(toBarcode);
};

export const linkBarcode = async (productId, { code, unitsPerScan = 1, supplierId = null }) => {
  const body = await apiPost(`/api/products/${productId}/barcodes`, { code, unitsPerScan, supplierId });
  return toBarcode(body.data ?? {});
};

export const removeBarcode = async (productId, barcodeId) => {
  const body = await apiDelete(`/api/products/${productId}/barcodes/${barcodeId}`);
  return toBarcode(body.data ?? {});
};

export default { lookupBarcode, listBarcodes, linkBarcode, removeBarcode };

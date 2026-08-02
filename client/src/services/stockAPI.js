// ─────────────────────────────────────────────────────────────
// src/services/stock.api.js
//
// Thin client-side wrapper around the stock (inventory) endpoints.
// Mirrors the shape of stock.controller.js on the backend — one
// function per route, no business logic here.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from "./api";

// GET /api/stock
// Returns: array of products with on-hand/reorder/status flags.
export const getManifest = () => apiGet("/api/stock");

// GET /api/stock/:id/history
// Returns: array of stock_movements rows for one product, newest first.
export const getMovements = (productId) => apiGet(`/api/stock/${productId}/history`);

// POST /api/stock/adjust
// Body: { productId, quantityDelta, unit?, reason }
// Returns: { before, after, isShortfall, isUnitMismatch }
export const adjustStock = ({ productId, quantityDelta, unit, reason }) =>
  apiPost("/api/stock/adjust", { productId, quantityDelta, unit, reason });

export default { getManifest, getMovements, adjustStock };
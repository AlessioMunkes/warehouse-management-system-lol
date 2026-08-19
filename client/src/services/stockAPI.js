// ─────────────────────────────────────────────────────────────
// src/services/stockAPI.js
//
// Client-side wrapper around the stock (inventory) endpoints.
// Mirrors stock.controller.js — one function per route.
//
// Two things this layer is responsible for, so no component has
// to think about them:
//
//   1. Unwrapping the envelope. Every stock endpoint returns
//      { success, data }, but apiGet/apiPost in api.js resolve
//      with the WHOLE body. Returning that straight to a component
//      hands it { success, data } where it expected an array, and
//      the manifest silently renders as empty. We return .data.
//
//   2. Casting NUMERIC columns. quantity_on_hand, committed,
//      available, reorder_threshold and stock_movements.quantity are
//      all NUMERIC in Postgres, and node-postgres returns NUMERIC as
//      a STRING to avoid float precision loss. Without a cast,
//      "-5" < 0 is false (string compare), so a shortfall never shows
//      its badge, and "100" + 25 concatenates to "10025" in any
//      arithmetic.
//
// The API speaks snake_case; the components already speak camelCase
// (onHand, reorderAt). Mapping happens here rather than in the page
// so every future screen reading the manifest gets the same shape.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost } from "./api";

// ── Row mappers ───────────────────────────────────────────────
// Three quantities, and they mean different things:
//
//   onHand    — what is physically inside the building
//   committed — packed onto a pallet, closed, not yet collected
//   available — onHand minus committed; what can still be promised
//
// The gap between them is a day or two of staged pallets standing in
// the dispatch area. Showing only onHand is what made the inventory
// screen and the packing screen disagree about how much rice there
// was. See server/src/repositories/committedStock.sql.js.
const toProduct = (row) => ({
  id:          row.id,
  name:        row.name,
  sku:         row.sku,
  unit:        row.unit || "",
  onHand:      Number(row.quantity_on_hand ?? 0),
  committed:   Number(row.committed ?? 0),
  available:   Number(row.available ?? row.quantity_on_hand ?? 0),
  reorderAt:   Number(row.reorder_threshold ?? 0),
  // The repository already computes these in SQL, from AVAILABLE
  // rather than on hand, so every screen agrees on what "low" means —
  // don't recompute them in the UI.
  isShortfall: Boolean(row.is_shortfall),
  isLowStock:  Boolean(row.is_low_stock),
  updatedAt:   row.updated_at ?? null,
});

const toMovement = (row) => ({
  id:              row.id,
  quantity:        Number(row.quantity ?? 0),
  unit:            row.unit || "",
  movementType:    row.movement_type,
  referenceType:   row.reference_type,
  referenceId:     row.reference_id,
  reason:          row.reason,
  performedByName: row.performed_by_name || "Unknown",
  createdAt:       row.created_at,
});

// ── GET /api/stock ────────────────────────────────────────────
export const getManifest = async () => {
  const body = await apiGet("/api/stock");
  return (body.data ?? []).map(toProduct);
};

// ── GET /api/stock/:id/history ────────────────────────────────
export const getMovements = async (productId) => {
  const body = await apiGet(`/api/stock/${productId}/history`);
  return (body.data ?? []).map(toMovement);
};

// ── POST /api/stock/adjust ────────────────────────────────────
// Returns { before, after, isShortfall, isUnitMismatch }.
// isShortfall and isUnitMismatch are NOT errors — the write
// succeeded. They are flags for the caller to surface, in line with
// the rule that the system never blocks a food-distribution action
// on a data discrepancy.
export const adjustStock = async ({ productId, quantityDelta, unit, reason }) => {
  const body = await apiPost("/api/stock/adjust", { productId, quantityDelta, unit, reason });
  return body.data;
};

export default { getManifest, getMovements, adjustStock };
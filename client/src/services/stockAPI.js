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

// ── Ledger row ────────────────────────────────────────────────
// balanceAfter is that product's running balance immediately after
// this movement, computed server-side over its full history — it is
// NOT affected by the filters in the UI, and must not be recomputed
// here from the visible rows.
const toLedgerRow = (row) => ({
  id:              row.id,
  productId:       row.product_id,
  productName:     row.product_name,
  sku:             row.sku,
  quantity:        Number(row.quantity ?? 0),
  balanceAfter:    Number(row.balance_after ?? 0),
  unit:            row.unit || "",
  movementType:    row.movement_type,
  referenceType:   row.reference_type,
  referenceId:     row.reference_id,
  reason:          row.reason,
  performedByName: row.performed_by_name || "Unknown",
  createdAt:       row.created_at,
});

const toReconciliationRow = (row) => ({
  id:            row.id,
  name:          row.name,
  sku:           row.sku,
  unit:          row.unit || "",
  balance:       Number(row.balance ?? 0),
  ledgerSum:     Number(row.ledger_sum ?? 0),
  variance:      Number(row.variance ?? 0),
  movementCount: Number(row.movement_count ?? 0),
});

// ── GET /api/stock/ledger ─────────────────────────────────────
// Filters are omitted from the query string when empty rather than
// sent as "", because the server treats an empty string as absent but
// there is no reason to make it prove that on every request.
export const getLedger = async ({
  from, to, productId, performedBy, movementTypes, referenceType, limit, cursor,
} = {}) => {
  const params = new URLSearchParams();
  if (from)          params.set("from", from);
  if (to)            params.set("to", to);
  if (productId)     params.set("productId", String(productId));
  if (performedBy)   params.set("performedBy", String(performedBy));
  if (referenceType) params.set("referenceType", referenceType);
  if (limit)         params.set("limit", String(limit));
  if (cursor)        params.set("cursor", cursor);
  if (movementTypes && movementTypes.length) {
    params.set("movementType", movementTypes.join(","));
  }

  const qs   = params.toString();
  const body = await apiGet(`/api/stock/ledger${qs ? `?${qs}` : ""}`);
  const data = body.data ?? {};

  return {
    movements:  (data.movements ?? []).map(toLedgerRow),
    nextCursor: data.nextCursor ?? null,
    summary: {
      totalIn:       Number(data.summary?.total_in ?? 0),
      totalOut:      Number(data.summary?.total_out ?? 0),
      netChange:     Number(data.summary?.net_change ?? 0),
      movementCount: Number(data.summary?.movement_count ?? 0),
      productCount:  Number(data.summary?.product_count ?? 0),
    },
  };
};

// ── GET /api/stock/ledger/reconciliation ──────────────────────
export const getReconciliation = async () => {
  const body = await apiGet("/api/stock/ledger/reconciliation");
  const data = body.data ?? {};
  return {
    products:  (data.products ?? []).map(toReconciliationRow),
    variances: (data.variances ?? []).map(toReconciliationRow),
  };
};

// ── GET /api/stock/ledger/actors ──────────────────────────────
export const getLedgerActors = async () => {
  const body = await apiGet("/api/stock/ledger/actors");
  return (body.data ?? []).map((r) => ({ id: r.id, name: r.name || "Unknown" }));
};

// ── GET /api/stock/trends ─────────────────────────────────────
// { [productId]: number[] } — the balance at the end of each day,
// oldest first. Products that have never moved are absent, and the
// table renders those as a dash rather than a flat line.
export const getStockTrends = async (days) => {
  const qs   = days ? `?days=${encodeURIComponent(days)}` : "";
  const body = await apiGet(`/api/stock/trends${qs}`);
  const series = body.data?.series ?? {};

  // Keys arrive as strings (JSON object keys always are) but products
  // are keyed by integer id everywhere else, so the lookup in the
  // table would silently miss. Normalise once, here.
  const out = {};
  for (const [productId, points] of Object.entries(series)) {
    out[Number(productId)] = (points ?? []).map(Number);
  }
  return out;
};

export default {
  getManifest, getMovements, adjustStock,
  getLedger, getReconciliation, getLedgerActors,
  getStockTrends,
};
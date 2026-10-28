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
import { apiDelete, apiGet, apiPost } from "./api";
import { setUrgentExpiryDays } from "../lib/expiryWindow";

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
  // The newest ledger row, for "No movement 60+ days". Not updatedAt,
  // which a reorder-threshold edit also bumps.
  lastMovementAt: row.last_movement_at ?? null,
  // Linked barcodes, so the inventory search finds a product by the code
  // on its pack (inventoryViews.js matchesSearch).
  barcodes:    Array.isArray(row.barcodes) ? row.barcodes : [],
  // Soonest expiry still today or later among the deliveries estimated
  // to be on the shelf, as 'YYYY-MM-DD' — see getManifest.
  earliestExpiry: toDay(row.earliest_expiry),
  // About how much of that delivery is left (an estimate), in `unit`.
  earliestExpiryLeft: row.earliest_expiry_left === null || row.earliest_expiry_left === undefined
    ? null
    : Number(row.earliest_expiry_left),

  // Catalogue fields, for the summary panel. Not rendered as columns —
  // the table is already full — but they are why the panel can stand
  // in for the Products screen.
  //
  // defaultUnit is what the catalogue says this product is counted in;
  // `unit` above is what the ledger has actually been accumulating.
  // They are normally equal, and a difference is worth seeing rather
  // than papering over, so both are kept.
  category:     row.category ?? "",
  storageType:  row.storage_type ?? "",
  isPerishable: row.is_perishable === undefined ? undefined : Boolean(row.is_perishable),
  // NUMERIC over the wire is a string. Number(null) is 0, and a weight
  // nobody recorded is not zero — same guard as expectedLeadTimeDays.
  weightKg:     row.weight_kg === null || row.weight_kg === undefined
                  ? null
                  : Number(row.weight_kg),
  defaultUnit:  row.default_unit ?? "",
  // Read by the purchase-order form to fill a line's cost. Null means
  // nobody has priced it, and the form leaves the cost blank rather
  // than writing a confident zero onto an order.
  unitCost:     row.unit_cost === null || row.unit_cost === undefined
                  ? null
                  : Number(row.unit_cost),
  // Who it is usually ordered from: the purchase order raised from Low
  // stock starts on that supplier.
  preferredSupplierId: row.preferred_supplier_id ?? null,
});

// A Postgres DATE arrives as 'YYYY-MM-DD' or, through a JSON
// serialiser that saw a Date, as a full ISO string. The day is all
// that matters, and comparing it as a string keeps a timezone from
// moving an expiry onto the day before.
function toDay(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

const toBatch = (row) => ({
  id:               row.id,
  expiryDate:       toDay(row.expiry_date),
  receivedQuantity: Number(row.received_quantity ?? 0),
  // About how much of the delivery is left: an estimate (the server
  // assumes the oldest stock goes out first). Null from a server that
  // does not say.
  quantityLeft:     row.quantity_left === null || row.quantity_left === undefined ? null : Number(row.quantity_left),
  unit:             row.unit || "",
  receivedOn:       toDay(row.received_on),
  supplierName:     row.supplier_name || null,
  daysLeft:         row.days_left === null || row.days_left === undefined ? null : Number(row.days_left),
  // A manager's dismissal of this delivery's warning: who, when, why.
  dismissal:        row.dismissal
    ? { id: row.dismissal.id, byName: row.dismissal.by_name || "Unknown", at: row.dismissal.at ?? null, reason: row.dismissal.reason ?? "" }
    : null,
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
  const rows = body.data ?? [];
  // Settings' first expiry warning: where an expiry badge turns red.
  const urgent = Number(rows[0]?.urgent_expiry_days);
  if (Number.isFinite(urgent) && urgent > 0) setUrgentExpiryDays(urgent);
  return rows.map(toProduct);
};

// ── GET /api/stock/:id/history ────────────────────────────────
export const getMovements = async (productId) => {
  const body = await apiGet(`/api/stock/${productId}/history`);
  return (body.data ?? []).map(toMovement);
};

// ── GET /api/stock/:id/batches ────────────────────────────────
// The deliveries estimated to be still on the shelf, soonest expiry
// first: what came in, about how much is left, and any dismissed warning.
export const getBatches = async (productId) => {
  const body = await apiGet(`/api/stock/${productId}/batches`);
  return (body.data ?? []).map(toBatch);
};

// ── POST / DELETE /api/stock/:id/batches/:lineId/dismissal ─────
// A manager says the estimate has this delivery wrong: its expiry
// warning stops everywhere, with a reason on record. Restore undoes it.
export const dismissExpiryWarning = async (productId, lineId, reason) => {
  const body = await apiPost(`/api/stock/${productId}/batches/${lineId}/dismissal`, { reason });
  return body.data;
};

export const restoreExpiryWarning = async (productId, lineId) => {
  const body = await apiDelete(`/api/stock/${productId}/batches/${lineId}/dismissal`);
  return body.data;
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
  // What the movement came from, resolved server-side to something a
  // manager can open: the picking slip a dispatch belonged to, or the
  // purchase order a receipt was against. Null otherwise.
  pickingSlipId:   row.picking_slip_id ?? null,
  pickingSlipName: row.picking_slip_name ?? null,
  purchaseOrderId: row.purchase_order_id ?? null,
  poNumber:        row.po_number ?? null,
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

export default {
  getManifest, getMovements, getBatches, adjustStock, dismissExpiryWarning, restoreExpiryWarning,
  getLedger, getReconciliation, getLedgerActors,
};
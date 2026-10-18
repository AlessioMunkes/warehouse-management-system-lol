// ─────────────────────────────────────────────────────────────
// client/src/features/inventory/ledgerSort.js
//
// The stock ledger's movement-type labels and what each column sorts
// by. Its own file so LedgerTable.jsx exports only a component (fast
// refresh).
// ─────────────────────────────────────────────────────────────
// Same keys the database stores. Kept in step with
// server/src/constants/movementTypes.js.
export const TYPE_LABEL = {
  adjustment: "Manual adjustment",
  decanted:   "Decanting",
  dispatched: "Dispatched",
  donated:    "Donation",
  picked:     "Picked",
  received:   "Received",
  wastage:    "Wastage",
};

// What each column sorts by, for the page's useSortable. Type sorts by
// its label, so the order matches what is on screen.
export const LEDGER_SORT = {
  when: (m) => new Date(m.createdAt).getTime(),
  product: (m) => m.productName,
  sku: (m) => m.sku,
  type: (m) => TYPE_LABEL[m.movementType] ?? m.movementType,
  change: (m) => Number(m.quantity),
  balance: (m) => Number(m.balanceAfter),
  reason: (m) => m.reason || m.referenceType,
  reference: (m) => m.poNumber || m.pickingSlipName || m.referenceType || '',
  by: (m) => m.performedByName,
};

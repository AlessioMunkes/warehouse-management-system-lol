// ─────────────────────────────────────────────────────────────
// client/src/features/purchaseOrders/components/purchaseOrderLine.js
//
// The empty-line factory, split out of PurchaseOrderLines.jsx.
// A module that exports both a component and a plain function opts
// out of Fast Refresh, so every keystroke in the PO form remounted
// the whole table and dropped focus.
// ─────────────────────────────────────────────────────────────

export const blankLine = () => ({
  // A client-side key so React can track a row that has no id yet.
  // Array index would do the wrong thing the moment a middle row is
  // removed: every row below it would re-key and lose focus.
  key: `line-${Math.random().toString(36).slice(2, 10)}`,
  productId: '',
  expectedQuantity: '',
  expectedWeightKg: '',
  unitPrice: '',
});

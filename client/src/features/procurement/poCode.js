// ─────────────────────────────────────────────────────────────
// client/src/features/procurement/poCode.js
//
// Display-only purchase order code — PO-0067, not the raw database
// id ("Order 1", "Order 2", ...). Same placeholder pattern as
// feedTheSoil/kitCode.js: one function so the format changes in one
// place once a real PO numbering system replaces this.
// ─────────────────────────────────────────────────────────────
export const formatPoCode = (id) => `PO-${String(id).padStart(4, '0')}`;

export default formatPoCode;

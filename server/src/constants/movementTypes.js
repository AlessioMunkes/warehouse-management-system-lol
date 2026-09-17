// ─────────────────────────────────────────────────────────────
// server/src/constants/movementTypes.js
//
// The stock_movements.movement_type vocabulary, in one place.
//
// THIS LIST IS THE CHECK CONSTRAINT, VERBATIM.
//
// It lives in constants/ rather than in reportCatalog.js because the
// stock service needs it to validate a ledger filter, and a service
// importing from the reporting feature to do that is the wrong
// direction. reportCatalog re-exports from here, so there is exactly
// one list — the same arrangement as purchaseOrderStatus.js and
// storageAreas.js, and for the reason stock.repository.js already
// records in its own header: movement_type drifted once because two
// modules each kept a copy.
//
// 'picked' is never written, deliberately. Stock is deducted at the
// dispatch gate against what was actually loaded, not at packing —
// otherwise a pallet standing in the staging area drives the balance
// negative for food that is still in the building. See the header of
// picking.repository.js before you "fix" that.
// ─────────────────────────────────────────────────────────────

export const MOVEMENT_TYPES = [
  'adjustment',   // manual correction, reason recorded
  'decanted',     // reserved; decanting moves no stock, only its wastage does
  'dispatched',   // left the building with a beneficiary
  'donated',      // arrived as a donation
  'picked',       // reserved, never written — see above
  'received',     // arrived against a purchase order
  'wastage',      // spoiled, damaged, spilled or lost in decanting
];

// Types that take stock out of the building. Used for the ledger
// summary's split, so "out" means the same thing everywhere.
export const OUTBOUND_MOVEMENT_TYPES = ['dispatched', 'picked', 'wastage'];

export const isMovementType = (value) =>
  MOVEMENT_TYPES.includes(String(value || '').trim());

export default { MOVEMENT_TYPES, OUTBOUND_MOVEMENT_TYPES, isMovementType };

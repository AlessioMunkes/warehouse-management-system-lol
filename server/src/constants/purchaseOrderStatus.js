// ─────────────────────────────────────────────────────────────
// server/src/constants/purchaseOrderStatus.js
//
// BR-07B's status vocabulary, in one place.
//
// WHY THIS IS A CONSTANTS MODULE AND NOT PART OF THE SERVICE
// purchaseOrder.service.js already declared PO_STATUSES with the
// comment "anything reading or writing a PO status reads it from
// here". delivery.repository.js also needs it, and a repository
// importing a service is a circular import (the service imports the
// repository). Rather than duplicating the list a third time — which
// is exactly how movement_type drifted — it moves here and both
// layers import it.
//
// THE LIVE CHECK CONSTRAINT ALLOWS EIGHT VALUES, NOT SIX
// migration 002_purchase_order_creation WIDENED purchase_orders_status_check
// rather than replacing it, so 'approved' and 'completed' are still legal in
// the database alongside the six BR-07B states. Two rows are sitting in
// 'approved' right now. Verify with:
//
//   SELECT conname, convalidated, pg_get_constraintdef(oid)
//   FROM pg_constraint
//   WHERE conrelid = 'public.purchase_orders'::regclass AND contype = 'c';
//
// PO_STATUSES below is the SIX-state BR-07B vocabulary — what the system
// writes going forward. LEGACY_PO_STATUSES is what the database still
// tolerates from before. Keeping them separate is deliberate: the filter
// dropdown on the PO list should offer six, but the receiving gate has to
// accept the legacy rows or the two 'approved' POs are permanently stranded.
//
// TO RETIRE THE LEGACY STATES (a decision for Hussain, who owns BR-07B):
//   UPDATE purchase_orders SET status = 'pending'  WHERE status = 'approved';
//   UPDATE purchase_orders SET status = 'received' WHERE status = 'completed';
// then tighten the CHECK to six and delete LEGACY_PO_STATUSES here.
// ─────────────────────────────────────────────────────────────

// The six states BR-07B defines. New writes use only these.
export const PO_STATUSES = [
  'pending',
  'in_transit',
  'partially_received',
  'received',
  'returned',
  'follow_up_required',
];

// Still legal in the database, never written by this codebase.
export const LEGACY_PO_STATUSES = ['approved', 'completed'];

// Every value the CHECK constraint currently permits.
export const ALL_PO_STATUSES = [...PO_STATUSES, ...LEGACY_PO_STATUSES];

// ── What can be received against ─────────────────────────────
// An order still expecting goods. 'approved' is here ONLY to keep the
// legacy rows reachable; remove it with the UPDATE above.
//
// Deliberately excludes 'received' and 'completed' (already closed off —
// receiving again would add the stock twice), 'returned' and
// 'follow_up_required' (a decision has been taken; reopening is a manager
// action, not a receiver's).
export const OPEN_PO_STATUSES = [
  'pending',
  'approved',
  'in_transit',
  'partially_received',
];

// What a fully-received order becomes. Was 'completed', which is legacy:
// supplier.repository.js counts open orders as `status NOT IN ('received',
// 'returned')`, so a 'completed' PO was being counted as still open, and
// PO_STATUSES does not list it so the manager's status filter could never
// find one either.
export const PO_STATUS_FULLY_RECEIVED = 'received';

// Partial receipt against an order that still expects more. Not written
// automatically yet — see the note in delivery.repository.js createDelivery.
export const PO_STATUS_PARTIALLY_RECEIVED = 'partially_received';

export const isOpenPurchaseOrder = (status) => OPEN_PO_STATUSES.includes(status);

export default {
  PO_STATUSES,
  LEGACY_PO_STATUSES,
  ALL_PO_STATUSES,
  OPEN_PO_STATUSES,
  PO_STATUS_FULLY_RECEIVED,
  PO_STATUS_PARTIALLY_RECEIVED,
  isOpenPurchaseOrder,
};

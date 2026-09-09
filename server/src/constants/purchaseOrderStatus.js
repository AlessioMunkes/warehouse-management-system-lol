// ─────────────────────────────────────────────────────────────
// server/src/constants/purchaseOrderStatus.js
//
// BR-07B's status vocabulary, in one place.
//
// THIS LIST IS THE CHECK CONSTRAINT, VERBATIM
// purchase_orders_status_check permits exactly these seven values.
// Writing anything else raises 23514 and rolls back the surrounding
// transaction — which for receiving means losing the delivery note and
// its stock movements, not just the status update. Verify with:
//
//   SELECT pg_get_constraintdef(oid) FROM pg_constraint
//   WHERE conrelid = 'public.purchase_orders'::regclass AND contype = 'c';
//
// There is no 'received' state. An earlier version of this file
// claimed there was, and that 'approved'/'completed' were legacy
// leftovers — the reverse of what the database says. delivery.
// repository.js was writing 'received' on full receipt, so no purchase
// order could ever be closed off.
//
// WHY THIS IS A CONSTANTS MODULE AND NOT PART OF THE SERVICE
// delivery.repository.js needs the list too, and a repository
// importing a service is a circular import (the service imports the
// repository). Rather than duplicating the list — which is exactly how
// movement_type drifted — it lives here and both layers import it.
// ─────────────────────────────────────────────────────────────

// Every value the constraint permits, in lifecycle order.
export const PO_STATUSES = [
  'pending',              // raised, not yet signed off
  'approved',             // a manager has signed off; ready to send to the supplier
  'in_transit',
  'partially_received',
  'completed',            // goods fully received; nothing further expected
  'returned',
  'follow_up_required',
];

// ── What can still be received against ────────────────────────
// Deliberately excludes 'completed' and 'returned' (already closed off
// — receiving again would add the stock twice) and 'follow_up_required'
// (a decision has been taken; reopening is a manager's action, not a
// receiver's).
export const OPEN_PO_STATUSES = [
  'pending',
  'approved',
  'in_transit',
  'partially_received',
];

// ── What counts as closed ─────────────────────────────────────
// Matches supplier.repository.js's open-order count, which reads
// `status NOT IN ('completed','returned')`. Kept here so the two
// cannot drift.
export const CLOSED_PO_STATUSES = ['completed', 'returned'];

// What a fully-received order becomes.
export const PO_STATUS_FULLY_RECEIVED = 'completed';

// Partial receipt against an order that still expects more. Not written
// automatically yet — see the note in delivery.repository.js createDelivery.
export const PO_STATUS_PARTIALLY_RECEIVED = 'partially_received';

export const isOpenPurchaseOrder = (status) => OPEN_PO_STATUSES.includes(status);
export const isClosedPurchaseOrder = (status) => CLOSED_PO_STATUSES.includes(status);

export default {
  PO_STATUSES,
  OPEN_PO_STATUSES,
  CLOSED_PO_STATUSES,
  PO_STATUS_FULLY_RECEIVED,
  PO_STATUS_PARTIALLY_RECEIVED,
  isOpenPurchaseOrder,
  isClosedPurchaseOrder,
};

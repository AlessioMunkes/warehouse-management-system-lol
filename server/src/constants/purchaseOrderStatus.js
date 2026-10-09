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
// What the floor may receive against: an order a manager has approved,
// and not yet closed. 'pending' is open (it counts as outstanding
// everywhere else) but is NOT here: until someone has signed it off,
// goods arriving against it are goods nobody agreed to buy. The
// receiving screen says as much ("ask your manager to approve the
// order"), and this is what makes that true.
//
// 'partially_received' is not here either. It now means "the rest is
// coming on a follow-up order" (migration 043): the remainder is
// received against that order, not this one.
export const RECEIVABLE_PO_STATUSES = [
  'approved',
  'in_transit',
];

export const CLOSED_PO_STATUSES = ['completed', 'returned'];

// ── The moves a manager may make by hand ──────────────────────
// From each status, the statuses its buttons lead to. Everything else
// is refused: before this any status could be set from any other, so a
// completed order could be sent back to Pending and an order could be
// approved by "reopening" it.
//
//   pending            -> approved                       Approve
//   approved           -> in_transit                     Mark as in transit
//                      -> follow_up_required             Record follow-up
//                      -> returned                       Mark as returned
//   in_transit         -> approved                       Not in transit after all
//                      -> follow_up_required, returned
//   follow_up_required -> approved                       Reopen for receiving
//                      -> completed                      Close order (accept it as it is)
//                      -> returned
//   partially_received -> approved                       Reopen for receiving (only while no
//                                                        follow-up order is on its way)
//                      -> completed                      Close order (accept it as it is)
//                      -> returned
//   completed, returned: closed. Nothing leads out.
//
// Two moves are the system's own and are not in this table:
//   receiving a delivery     -> completed, or partially_received when short
//                               (flagged "follow-up required" until a
//                               follow-up order is raised)
//   raising a follow-up order -> partially_received (and completed when
//                               that follow-up is received in full)
export const PO_MANUAL_TRANSITIONS = {
  pending:            ['approved'],
  approved:           ['in_transit', 'follow_up_required', 'returned'],
  in_transit:         ['approved', 'follow_up_required', 'returned'],
  follow_up_required: ['approved', 'completed', 'returned'],
  partially_received: ['approved', 'completed', 'returned'],
  completed:          [],
  returned:           [],
};

export const canMovePurchaseOrder = (from, to) => (PO_MANUAL_TRANSITIONS[from] ?? []).includes(to);

// What a fully-received order becomes.
export const PO_STATUS_FULLY_RECEIVED = 'completed';

// Partial receipt against an order that still expects more. Not written
// automatically yet — see the note in delivery.repository.js createDelivery.
export const PO_STATUS_PARTIALLY_RECEIVED = 'partially_received';

export const isOpenPurchaseOrder = (status) => OPEN_PO_STATUSES.includes(status);
export const isReceivablePurchaseOrder = (status) => RECEIVABLE_PO_STATUSES.includes(status);
export const isClosedPurchaseOrder = (status) => CLOSED_PO_STATUSES.includes(status);

export default {
  PO_STATUSES,
  OPEN_PO_STATUSES,
  RECEIVABLE_PO_STATUSES,
  CLOSED_PO_STATUSES,
  PO_STATUS_FULLY_RECEIVED,
  PO_STATUS_PARTIALLY_RECEIVED,
  isOpenPurchaseOrder,
  isReceivablePurchaseOrder,
  isClosedPurchaseOrder,
  PO_MANUAL_TRANSITIONS,
  canMovePurchaseOrder,
};

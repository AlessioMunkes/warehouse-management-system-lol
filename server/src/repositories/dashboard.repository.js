// ─────────────────────────────────────────────────────────────
// server/src/repositories/dashboard.repository.js
//
// The "hot numbers" for the manager dashboard home screen — a small,
// purpose-built set of COUNT queries, not a reuse of the heavier
// board/list endpoints (dispatch.repository.js's getBoard,
// delivery.repository.js's getDeliveries) that return full row
// payloads. A dashboard tile needs a number, not the rows behind it.
//
// Every threshold here mirrors an existing, already-shipped
// definition rather than inventing a new one:
//   - low stock:            reporting.repository.js's lowStockItems
//   - open purchase orders: purchaseOrder.service.js's PO_STATUSES,
//                            everything before 'completed'/'returned'
//   - pending dispatch:     dispatch.repository.js's getBoard, the
//                            same "no terminal collection yet" test,
//                            narrowed to today rather than gateToday's
//                            broader "today or overdue" scope — the
//                            gate queue itself is where overdue
//                            pallets belong, not a dashboard count.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { OPEN_PO_STATUSES } from '../constants/purchaseOrderStatus.js';

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

// Read from the constants module rather than hand-written here. This
// was a third copy of the open-PO list — the module exists because the
// first two drifted, and a fourth would have drifted too.
//
// SAST_TODAY, not CURRENT_DATE: Render runs UTC, so CURRENT_DATE is
// yesterday's date for the first two hours of every South African day
// and every "today" count below was answering for the wrong one.
const SAST_TODAY = `(now() AT TIME ZONE 'Africa/Johannesburg')::date`;

// One array, reused by every query that asks what is still open.
const openPoParams = [OPEN_PO_STATUSES];

// What a warehouse worker needs before choosing a task: what is left to
// pack, what is arriving, what is waiting at the gate. Deliberately not
// a subset of getSummary — low stock across the whole catalog and open
// POs across every supplier are management information, which is why
// /summary is manager-and-admin and this is a separate endpoint rather
// than a filtered view of that one.
//
// "Not yet packed" counts slips due today or earlier: a slip due
// Tuesday that is still pending on Thursday is more urgent, not less,
// so it stays on the list rather than dropping off it.
const getMyWork = async () => {
  const [toPack, deliveries, atGate] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM picking_slips
        WHERE status IN ('pending', 'in_progress')
          AND dispatch_date <= ${SAST_TODAY}`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM purchase_orders
        WHERE status = ANY($1)
          AND expected_delivery_date = ${SAST_TODAY}`, openPoParams
    ),
    // Packed and still in the building. Same shape as the gate queue in
    // dispatch.repository.js: a terminal dispatch_events row is what
    // takes a pallet off it, not the picking slip's own status.
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM picking_slips ps
         LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
        WHERE ps.status IN ('complete', 'dispatched')
          AND ps.dispatch_date <= ${SAST_TODAY}
          AND (de.id IS NULL OR de.status IS NULL
               OR de.status NOT IN ('collected', 'late_collected', 'cancelled'))`
    ),
  ]);

  return {
    slipsToPack:        num(toPack.rows[0]?.count),
    deliveriesExpected: num(deliveries.rows[0]?.count),
    palletsAtGate:      num(atGate.rows[0]?.count),
  };
};

const getSummary = async () => {
  const [lowStock, activeProducts, openPOs, deliveriesToday, dispatchesToday, pendingCommunityRequests] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM stock_levels sl
         JOIN products p ON p.id = sl.product_id
        WHERE p.is_active = true
          AND sl.reorder_threshold > 0
          AND sl.quantity_on_hand <= sl.reorder_threshold`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM products WHERE is_active = true`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM purchase_orders
        WHERE status = ANY($1)`, openPoParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM purchase_orders
        WHERE status = ANY($1)
          AND expected_delivery_date = ${SAST_TODAY}`, openPoParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM picking_slips ps
         LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
        WHERE ps.status IN ('complete', 'dispatched')
          AND ps.dispatch_date = ${SAST_TODAY}
          AND (de.id IS NULL OR de.status IS NULL
               OR de.status NOT IN ('collected', 'late_collected'))`
    ),
    // BR-28: call-in / walk-in requests from the public that have not
    // been resolved yet. A log-only feature — this counts records, it
    // does not reflect any stock reservation.
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM community_requests
        WHERE outcome = 'pending'`
    ),
  ]);

  return {
    lowStockCount:            num(lowStock.rows[0]?.count),
    activeProductCount:       num(activeProducts.rows[0]?.count),
    openPurchaseOrders:       num(openPOs.rows[0]?.count),
    deliveriesExpectedToday:  num(deliveriesToday.rows[0]?.count),
    pendingDispatchesToday:   num(dispatchesToday.rows[0]?.count),
    pendingCommunityRequests: num(pendingCommunityRequests.rows[0]?.count),
  };
};

export default { getSummary, getMyWork };

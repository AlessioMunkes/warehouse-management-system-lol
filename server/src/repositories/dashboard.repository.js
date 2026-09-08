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

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

// PO statuses that are still open — everything short of 'completed'
// or 'returned'. Matches purchaseOrder.service.js's PO_STATUSES list
// minus the two terminal ones. Inlined as a literal, not parameterised
// — it is a fixed constant, not caller-supplied, the same reasoning
// dispatch.repository.js's getBoard uses for its own status literals.
const OPEN_PO_STATUSES_SQL = `'pending', 'approved', 'in_transit', 'partially_received'`;

const getSummary = async () => {
  const [lowStock, activeProducts, openPOs, deliveriesToday, dispatchesToday] = await Promise.all([
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
        WHERE status IN (${OPEN_PO_STATUSES_SQL})`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM purchase_orders
        WHERE status IN (${OPEN_PO_STATUSES_SQL})
          AND expected_delivery_date = CURRENT_DATE`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM picking_slips ps
         LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
        WHERE ps.status IN ('complete', 'dispatched')
          AND ps.dispatch_date = CURRENT_DATE
          AND (de.id IS NULL OR de.status IS NULL
               OR de.status NOT IN ('collected', 'late_collected'))`
    ),
  ]);

  return {
    lowStockCount:           num(lowStock.rows[0]?.count),
    activeProductCount:      num(activeProducts.rows[0]?.count),
    openPurchaseOrders:      num(openPOs.rows[0]?.count),
    deliveriesExpectedToday: num(deliveriesToday.rows[0]?.count),
    pendingDispatchesToday:  num(dispatchesToday.rows[0]?.count),
  };
};

export default { getSummary };

// ─────────────────────────────────────────────────────────────
// server/src/repositories/committedStock.sql.js
//debug
//
// The single definition of "committed stock".
//
// WHY THIS FILE EXISTS
// Stock is deducted from stock_levels at DISPATCH, not at packing.
// That makes quantity_on_hand mean exactly one thing — what is
// physically inside the building — so Friday's count reconciles
// against it with no mental arithmetic about staged pallets.
//
// The cost of that choice is that a packed-but-not-yet-collected
// pallet still reads as on hand for a day or two. Wednesday's packers
// building Thursday's cohort would otherwise over-commit stock that
// Tuesday's pallets already own.
//
// We solve that by DERIVING the commitment rather than storing it in
// a quantity_reserved column. A stored column is a second number that
// can drift from the ledger, and it would need its own reserve /
// release write path with its own locking. Derived, there is nothing
// to drift: a commitment appears the moment a slip is completed and
// disappears the moment the pallet is dispatched or written off,
// because both of those facts are already recorded elsewhere.
//
// available = stock_levels.quantity_on_hand - committed
//
// Three call sites need this exact definition — the packing
// availability check (picking.repository.completeSlip), the stock
// manifest, and the dispatch gate view. Duplicating the SQL across
// them is how the three screens end up quietly disagreeing about how
// much rice there is, so it lives here.
//
// A slip counts as committed when:
//   - it is packed and closed          (picking_slips.status = 'complete')
//   - no dispatch event has closed it  (no row, or the row is 'awaiting')
//   - the line was actually packed     (confirmed / flagged, quantity > 0)
//
// Flagged lines with a recorded quantity count. A flag usually means
// "short — I packed 10 of the 20", and those 10 are physically on the
// pallet. A flagged line with no quantity is skipped; there is
// nothing on the pallet to commit.
//
// Once a dispatch event lands on 'collected', 'late_collected' or
// 'not_collected', the slip drops out of this query on its own:
//   - collected      → the stock left the building, the ledger was
//                      decremented, on_hand is already correct.
//   - not_collected  → nothing was ever deducted, so the goods simply
//                      become available again. No compensating
//                      movement is needed. This is the whole reason
//                      dispatch-time deduction is simpler than
//                      packing-time deduction.
// ─────────────────────────────────────────────────────────────

/**
 * Returns the SQL text of a subquery yielding (product_id, committed).
 *
 * @param {object}  [opts]
 * @param {string}  [opts.excludeSlipParam]  A positional parameter
 *   placeholder — e.g. '$1' — for a slip to leave out of the total.
 *   completeSlip uses this defensively: at the point it runs the
 *   availability check the slip is still 'in_progress' and would be
 *   excluded anyway, but relying on transaction ordering for
 *   correctness is the kind of thing that breaks silently when
 *   someone reorders two statements later.
 *
 *   Only ever pass a literal placeholder built by the caller, never a
 *   user-supplied value — it is interpolated into the SQL text.
 */
export const committedStockSql = ({ excludeSlipParam = null } = {}) => `
  SELECT
    i.product_id,
    SUM(i.packed_quantity)::numeric AS committed
  FROM picking_slip_items i
  JOIN picking_slips ps ON ps.id = i.picking_slip_id
  LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
  WHERE ps.status = 'complete'
    AND (de.id IS NULL OR de.status = 'awaiting')
    AND i.status IN ('confirmed', 'flagged')
    AND i.packed_quantity IS NOT NULL
    AND i.packed_quantity > 0
    ${excludeSlipParam ? `AND ps.id <> ${excludeSlipParam}` : ''}
  GROUP BY i.product_id
`;

export default { committedStockSql };
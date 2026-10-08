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

//
// BENEVOLENT REQUESTS ALSO SET STOCK ASIDE
// A manager approves a benevolent request by choosing products and
// quantities (community_request_items). Those quantities are held back
// from Available from approval until the worker confirms what went out,
// or the request is declined. Same idea as a packed pallet: derived,
// never stored, so declining or confirming releases them with no write
// of their own. A request counts while its status is 'approved'; a line
// flagged short_at has stopped reserving (see
// communityRequestStock.repository.js).
//
// PALLETS COME FIRST. Packing a pallet must never be blocked or
// shortened by a benevolent request, so the packing check asks for the
// total WITHOUT the benevolent branch (includeBenevolent: false).
// Inventory's Committed and Available, and the approval check, include
// it.
import { toStockUnitSql } from '../features/units/unitConversion.js';

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
 * @param {boolean} [opts.includeBenevolent=true]  false = pallets only.
 *   The packing check passes false so benevolent reservations never
 *   count against a pallet.
 * @param {string}  [opts.excludeRequestParam]  A positional placeholder
 *   for a benevolent request to leave out, so re-choosing the items on
 *   a request does not count its own old lines against it.
 *
 *   Only ever pass a literal placeholder built by the caller, never a
 *   user-supplied value — it is interpolated into the SQL text.
 */
// A pallet line is in the slip's unit, which is not always the unit the
// product's stock is kept in (kilograms packed from crates), so each
// line is turned into the stock unit before it is added up.
const PALLETS_BRANCH = (excludeSlipParam) => `
  SELECT
    i.product_id,
    SUM(${toStockUnitSql('i.packed_quantity', 'i.unit', 'isl.unit')})::numeric AS committed
  FROM picking_slip_items i
  JOIN picking_slips ps ON ps.id = i.picking_slip_id
  LEFT JOIN stock_levels isl ON isl.product_id = i.product_id
  LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
  WHERE ps.status = 'complete'
    AND (de.id IS NULL OR de.status = 'awaiting')
    AND i.status IN ('confirmed', 'flagged')
    AND i.packed_quantity IS NOT NULL
    AND i.packed_quantity > 0
    ${excludeSlipParam ? `AND ps.id <> ${excludeSlipParam}` : ''}
  GROUP BY i.product_id
`;

// Approved, not yet confirmed, and not flagged short.
export const benevolentBranchSql = ({ excludeRequestParam = null } = {}) => `
  SELECT
    cri.product_id,
    SUM(cri.quantity_approved - cri.quantity_released)::numeric AS committed
  FROM community_request_items cri
  JOIN community_requests cr ON cr.id = cri.request_id
  WHERE cr.outcome = 'approved'
    AND cri.short_at IS NULL
    ${excludeRequestParam ? `AND cr.id <> ${excludeRequestParam}` : ''}
  GROUP BY cri.product_id
`;

export const committedStockSql = ({
  excludeSlipParam = null, includeBenevolent = true, excludeRequestParam = null,
} = {}) => {
  const pallets = PALLETS_BRANCH(excludeSlipParam);
  if (!includeBenevolent) return pallets;
  return `
  SELECT u.product_id, SUM(u.committed)::numeric AS committed
  FROM (
    ${pallets}
    UNION ALL
    ${benevolentBranchSql({ excludeRequestParam })}
  ) u
  GROUP BY u.product_id
`;
};

export default { committedStockSql, benevolentBranchSql };

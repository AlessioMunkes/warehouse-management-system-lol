// ─────────────────────────────────────────────────────────────
// server/src/repositories/communityRequestStock.repository.js
//
// How benevolent requests meet stock: what is available to set aside
// when a manager approves, and what happens when stock runs short
// after a request has been approved.
//
// Every function takes the caller's TRANSACTION CLIENT. Both the
// approval check and the shortage check lock the product's
// stock_levels row first (in product_id order, like every other
// writer — see stock.repository.js), so two approvals racing for the
// same stock, or an approval racing a pallet being packed, cannot both
// pass.
//
// PALLETS COME FIRST. A pallet is core business; a benevolent request
// is not allowed to hold one up. So:
//   - the packing check never counts benevolent reservations
//     (committedStockSql({ includeBenevolent: false }));
//   - when stock then falls short, it is the benevolent request that
//     gives way: its line stops reserving and the request is flagged
//     "needs new items", most recently approved first, until the
//     numbers fit again.
// ─────────────────────────────────────────────────────────────
import { committedStockSql, benevolentBranchSql } from './committedStock.sql.js';
import { communityRequestItemsShort } from '../features/communications/notices.js';

const uniqueSorted = (ids) =>
  [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);

// ── Statements (exported so they can be checked against the live
// schema without running them) ────────────────────────────────

export const LOCK_STOCK_SQL = `
  SELECT sl.product_id
    FROM stock_levels sl
   WHERE sl.product_id = ANY($1::int[])
   ORDER BY sl.product_id
     FOR UPDATE`;

// For each product asked about: on hand, the unit, what is committed
// (pallets + other approved requests), and what is available. $2 is a
// request to leave out (0 when none) so re-choosing a request's items
// does not count its own old lines against it.
export const AVAILABLE_SQL = `
  SELECT p.id                                   AS product_id,
         p.name                                 AS product_name,
         COALESCE(sl.unit, p.default_unit)      AS unit,
         COALESCE(sl.quantity_on_hand, 0)::numeric AS quantity_on_hand,
         COALESCE(c.committed, 0)::numeric      AS committed,
         (COALESCE(sl.quantity_on_hand, 0) - COALESCE(c.committed, 0))::numeric AS available
    FROM products p
    LEFT JOIN stock_levels sl ON sl.product_id = p.id
    LEFT JOIN (${committedStockSql({ excludeRequestParam: '$2' })}) c ON c.product_id = p.id
   WHERE p.id = ANY($1::int[])
   ORDER BY p.id`;

// The three numbers the shortage check compares, for one product.
export const SHORTAGE_STATE_SQL = `
  SELECT COALESCE(sl.quantity_on_hand, 0)::numeric AS quantity_on_hand,
         COALESCE((SELECT c.committed
                     FROM (${committedStockSql({ includeBenevolent: false })}) c
                    WHERE c.product_id = $1), 0)::numeric AS pallets,
         COALESCE((SELECT b.committed
                     FROM (${benevolentBranchSql()}) b
                    WHERE b.product_id = $1), 0)::numeric AS benevolent
    FROM (SELECT $1::int AS product_id) x
    LEFT JOIN stock_levels sl ON sl.product_id = x.product_id`;

// Approved, unflagged lines for the product, most recently approved
// request first.
export const SHORTAGE_CANDIDATES_SQL = `
  SELECT cri.id AS line_id, cri.request_id,
         (cri.quantity_approved - cri.quantity_released)::numeric AS reserved,
         cr.items_short_at AS request_flagged_at
    FROM community_request_items cri
    JOIN community_requests cr ON cr.id = cri.request_id
   WHERE cr.outcome = 'approved'
     AND cri.short_at IS NULL
     AND cri.product_id = $1
   ORDER BY cr.approved_at DESC NULLS LAST, cr.id DESC, cri.id DESC`;

export const FLAG_LINE_SQL = `
  UPDATE community_request_items
     SET short_at = NOW(), updated_at = NOW()
   WHERE id = $1 AND short_at IS NULL`;

// Sets the request-level flag only the first time; RETURNING tells the
// caller whether this call is the one that raised it (so only one
// notification is ever sent while the request stays flagged).
export const FLAG_REQUEST_SQL = `
  UPDATE community_requests
     SET items_short_at = NOW()
   WHERE id = $1 AND outcome = 'approved' AND items_short_at IS NULL
   RETURNING id`;

// ── What can be set aside ─────────────────────────────────────

/**
 * Locks the stock rows, then returns each product's availability.
 * Products with no stock_levels row read as 0 on hand.
 */
export const getAvailability = async (client, productIds, { excludeRequestId = 0 } = {}) => {
  const ids = uniqueSorted(productIds);
  if (ids.length === 0) return [];
  await client.query(LOCK_STOCK_SQL, [ids]);
  const { rows } = await client.query(AVAILABLE_SQL, [ids, Number(excludeRequestId) || 0]);
  return rows.map((r) => ({
    productId:      r.product_id,
    productName:    r.product_name,
    unit:           r.unit,
    quantityOnHand: Number(r.quantity_on_hand),
    committed:      Number(r.committed),
    available:      Number(r.available),
  }));
};

// ── When stock runs short ─────────────────────────────────────

/**
 * Which lines must give way, given the numbers. Pure, so the rule can
 * be tested without a database.
 *
 *   short = onHand - pallets - benevolent
 *
 * While short is negative, the candidates are taken in the order given
 * (most recently approved first) and each one's reservation is
 * released, until the numbers fit or there is nothing left to release.
 */
export const planShortage = ({ onHand, pallets, benevolent, candidates }) => {
  let balance = Number(onHand) - Number(pallets) - Number(benevolent);
  const toFlag = [];
  for (const line of candidates) {
    if (balance >= 0) break;
    toFlag.push(line);
    balance += Number(line.reserved);
  }
  return toFlag;
};

// The products, of those given, that an approved request is waiting on.
// One query, so a pallet of 21 products with no request against any of
// them costs one round trip instead of three per product: on a hosted
// database that was the 14 seconds "Finishing…" sat on the screen.
// If it cannot be answered, every product is checked the slow way.
export const PRODUCTS_WITH_APPROVED_LINES_SQL = `
  SELECT DISTINCT cri.product_id
    FROM community_request_items cri
    JOIN community_requests cr ON cr.id = cri.request_id
   WHERE cr.outcome = 'approved'
     AND cri.short_at IS NULL
     AND cri.product_id = ANY($1::int[])`;

const withApprovedLines = async (client, ids) => {
  if (ids.length === 0) return ids;
  await client.query('SAVEPOINT community_request_products');
  try {
    const { rows } = await client.query(PRODUCTS_WITH_APPROVED_LINES_SQL, [ids]);
    await client.query('RELEASE SAVEPOINT community_request_products');
    const waiting = new Set(rows.map((r) => r.product_id));
    return ids.filter((id) => waiting.has(id));
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT community_request_products');
    await client.query('RELEASE SAVEPOINT community_request_products');
    console.error('[communityRequestStock] checking every product:', err.message);
    return ids;
  }
};

/**
 * Re-checks each product after something took stock or committed it
 * (a pallet packed, an adjustment, wastage, a dispatch). Flags approved
 * requests that no longer fit, most recently approved first, releasing
 * their reservation for the affected product, and tells managers ONCE
 * per request.
 *
 * Runs inside the caller's transaction, inside a savepoint: a fault
 * here must never fail the packing or the stock change that triggered
 * it, so it is undone and logged instead.
 *
 * @param {object} client
 * @param {number[]} productIds
 * @param {{cause?: 'pallet'|'stock'}} [opts]
 * @returns {Promise<number[]>} ids of the requests newly flagged
 */
export const recheckProducts = async (client, productIds, { cause = 'stock' } = {}) => {
  const flagged = [];
  for (const productId of await withApprovedLines(client, uniqueSorted(productIds))) {
    await client.query('SAVEPOINT community_request_shortage');
    try {
      const { rows: candidates } = await client.query(SHORTAGE_CANDIDATES_SQL, [productId]);
      if (candidates.length > 0) {
        await client.query(LOCK_STOCK_SQL, [[productId]]);
        const { rows: [state] } = await client.query(SHORTAGE_STATE_SQL, [productId]);
        const toFlag = planShortage({
          onHand:     state.quantity_on_hand,
          pallets:    state.pallets,
          benevolent: state.benevolent,
          candidates,
        });
        for (const line of toFlag) {
          await client.query(FLAG_LINE_SQL, [line.line_id]);
          const raised = await client.query(FLAG_REQUEST_SQL, [line.request_id]);
          if (raised.rowCount > 0) {
            flagged.push(line.request_id);
            await communityRequestItemsShort(client, { requestId: line.request_id, cause });
          }
        }
      }
      await client.query('RELEASE SAVEPOINT community_request_shortage');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT community_request_shortage');
      await client.query('RELEASE SAVEPOINT community_request_shortage');
      console.error('[communityRequestStock] shortage check failed:', err.message);
    }
  }
  return flagged;
};

export default { getAvailability, recheckProducts, planShortage };

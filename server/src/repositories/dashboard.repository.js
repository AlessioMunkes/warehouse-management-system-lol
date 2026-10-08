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
import { OPEN_PO_STATUSES, CLOSED_PO_STATUSES } from '../constants/purchaseOrderStatus.js';
import stockRepo from './stock.repository.js';
import { COUNTED_UNITS } from '../features/recipes/recipeSeason.js';
import { toStockUnitSql, unitRatioSql } from '../features/units/unitConversion.js';

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

// STOCK HEALTH, FROM THE INVENTORY SCREEN'S OWN ROWS
// The tiles used to count `quantity_on_hand <= reorder_threshold`
// where a threshold was set. That missed every product with no stock
// row or no threshold — 33 of 60 in the demo data had nothing
// available and the dashboard called them healthy — and it used on
// hand where the inventory screen uses AVAILABLE (on hand minus what
// is promised to slips). So the tile said 1 and the inventory filter
// it links to said 34. Counting getManifest's rows cannot disagree
// with that screen, because it is that screen's query.
//   out of stock — nothing available
//   low          — some available, at or below the reorder level
//   healthy      — everything else
const stockHealth = (rows) => {
  let out = 0;
  let low = 0;
  for (const r of rows) {
    const available = Number(r.available);
    if (available <= 0) out += 1;
    else if (available <= Number(r.reorder_threshold)) low += 1;
  }
  return { active: rows.length, out, low, healthy: rows.length - out - low };
};

const getSummary = async () => {
  const [manifest, openPOs, deliveriesToday, dispatchesToday, pendingCommunityRequests] = await Promise.all([
    stockRepo.getManifest(),
    // Open = not finished. follow_up_required is not in
    // OPEN_PO_STATUSES (that list is "still expecting goods", which
    // receiving needs), but an order waiting on a supplier problem is
    // exactly one a manager has to look at — leaving it out made the
    // tile 4 short of the orders actually outstanding.
    pool.query(
      `SELECT COUNT(*)::int AS count
         FROM purchase_orders
        WHERE NOT (status = ANY($1))`, [CLOSED_PO_STATUSES]
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

  const health = stockHealth(manifest);
  return {
    // Low OR out: what the inventory screen's low-stock filter shows.
    lowStockCount:            health.low + health.out,
    belowReorderCount:        health.low,
    outOfStockCount:          health.out,
    healthyStockCount:        health.healthy,
    activeProductCount:       health.active,
    openPurchaseOrders:       num(openPOs.rows[0]?.count),
    deliveriesExpectedToday:  num(deliveriesToday.rows[0]?.count),
    pendingDispatchesToday:   num(dispatchesToday.rows[0]?.count),
    pendingCommunityRequests: num(pendingCommunityRequests.rows[0]?.count),
  };
};

// ── What needs a manager, and where ────────────────────────────
// One read behind the dashboard's "Needs attention" list and the
// counts on the manager sidebar, so the two can never disagree.
//
// Each count is the size of a tab a manager can open:
//   inventory      — the Inventory tabs (same rules as inventoryViews.js:
//                    low stock excludes shortfalls; expiring is a
//                    delivery line due within 30 days, today included)
//   pickingSlips   — this week (Monday to Sunday, SAST), the Picking
//                    Slips page's default range
//   purchaseOrders — awaiting approval, and those flagged for follow-up
//   communityRequests — awaiting approval; approved but nobody has
//                    claimed or been assigned them; and approved ones that
//                    need new items because a pallet used their stock
const EXPIRY_WINDOW_DAYS = 30;

const sastDay = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(date);

const getAttention = async ({ now = new Date() } = {}) => {
  const [manifest, slips, pos, requests] = await Promise.all([
    stockRepo.getManifest(),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE ps.status = 'pending')::int          AS unassigned,
         COUNT(*) FILTER (WHERE de.status = 'not_collected')::int     AS not_collected
       FROM picking_slips ps
       LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
       WHERE ps.dispatch_date >= date_trunc('week', ${SAST_TODAY})::date
         AND ps.dispatch_date <  date_trunc('week', ${SAST_TODAY})::date + 7`
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int            AS awaiting_approval,
         COUNT(*) FILTER (WHERE status = 'follow_up_required')::int AS follow_up
       FROM purchase_orders`
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE outcome = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE outcome = 'approved'
                            AND items_short_at IS NULL
                            AND handled_by IS NULL
                            AND assigned_to IS NULL)::int AS unclaimed,
         COUNT(*) FILTER (WHERE outcome = 'approved'
                            AND items_short_at IS NOT NULL)::int AS needs_items
       FROM community_requests`
    ),
  ]);

  const today = sastDay(now);
  const horizon = sastDay(new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 86400000));
  let shortfall = 0; let lowStock = 0; let expiring = 0;
  for (const p of manifest) {
    if (p.is_shortfall) shortfall += 1;
    else if (p.is_low_stock) lowStock += 1;
    // 'YYYY-MM-DD' strings compare correctly as text.
    if (p.earliest_expiry && p.earliest_expiry >= today && p.earliest_expiry <= horizon) expiring += 1;
  }

  return {
    inventory:         { shortfall, lowStock, expiring },
    pickingSlips:      { unassigned: num(slips.rows[0]?.unassigned), notCollected: num(slips.rows[0]?.not_collected) },
    purchaseOrders:    { awaitingApproval: num(pos.rows[0]?.awaiting_approval), followUp: num(pos.rows[0]?.follow_up) },
    communityRequests: {
      pending:    num(requests.rows[0]?.pending),
      unclaimed:  num(requests.rows[0]?.unclaimed),
      needsItems: num(requests.rows[0]?.needs_items),
    },
  };
};

// ── Three figures for the manager's board ──────────────────────
// Behind the "Weeks of stock left", "Slips packed this week" and
// "Centres missing collections" widgets.
//
//   stockCover        — for each product on the recipe in use: what one
//                       week of slips takes (every active centre with a
//                       child count that follows the recipe, counted the
//                       way its slip is — banded, cans rounded up) against
//                       what is on hand. Fewest weeks first. Empty when no
//                       recipe with products applies today: slips then
//                       come from standing orders, which are not weekly
//                       amounts.
//   packing           — this week's slips (Monday to Sunday, SAST), and
//                       how many are packed.
//   missedCollections — centres with two or more pallets not collected
//                       in the last eight weeks.
const MISSED_WEEKS = 8;
const MISSED_AT_LEAST = 2;
const COVER_ROWS = 8;

const getInsights = async ({ recipe = null, childBand = 1 } = {}) => {
  const [cover, packing, missed] = await Promise.all([
    recipe
      ? pool.query(
        `WITH centres AS (
           SELECT CEIL(e.child_count::numeric / $2::numeric) * $2::numeric AS children
             FROM ecd_centres e
            WHERE e.is_active AND e.approved_at IS NOT NULL
              AND COALESCE(e.child_count, 0) > 0
              AND NOT EXISTS (SELECT 1 FROM recipe_own_order_centres o WHERE o.ecd_id = e.id)
         ),
         weekly AS (
           SELECT rl.product_id, rl.unit,
                  SUM(CASE WHEN rl.unit = ANY($3::text[])
                           THEN CEIL(rl.quantity_per_child * c.children)
                           ELSE ROUND(rl.quantity_per_child * c.children, 2) END) AS quantity
             FROM recipe_lines rl
             CROSS JOIN centres c
            WHERE rl.recipe_id = $1
            GROUP BY rl.product_id, rl.unit
         )
         SELECT p.id, p.name,
                COALESCE(sl.unit, w.unit)                 AS unit,
                COALESCE(sl.quantity_on_hand, 0)::numeric AS on_hand,
                w.unit                                    AS weekly_unit,
                ${toStockUnitSql('w.quantity', 'w.unit', 'sl.unit')}::numeric AS weekly_use,
                -- Stock in crates against a recipe in kilograms, with no
                -- crate weight set: the two cannot be compared.
                (sl.unit IS NULL OR ${unitRatioSql('w.unit', 'sl.unit')} IS NOT NULL) AS comparable
           FROM weekly w
           JOIN products p ON p.id = w.product_id AND p.archived_at IS NULL
           LEFT JOIN stock_levels sl ON sl.product_id = w.product_id
          WHERE w.quantity > 0
          ORDER BY (sl.unit IS NULL OR ${unitRatioSql('w.unit', 'sl.unit')} IS NOT NULL) DESC,
                   COALESCE(sl.quantity_on_hand, 0) / ${toStockUnitSql('w.quantity', 'w.unit', 'sl.unit')} ASC, p.name ASC
          LIMIT ${COVER_ROWS}`,
        [recipe.id, childBand, COUNTED_UNITS]
      )
      : { rows: [] },
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status NOT IN ('pending', 'in_progress'))::int AS packed,
              COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress
         FROM picking_slips
        WHERE status <> 'cancelled'
          AND dispatch_date >= date_trunc('week', ${SAST_TODAY})::date
          AND dispatch_date <  date_trunc('week', ${SAST_TODAY})::date + 7`
    ),
    pool.query(
      `SELECT e.id, e.name, COUNT(*)::int AS missed, MAX(ps.dispatch_date)::text AS last_missed
         FROM dispatch_events de
         JOIN picking_slips ps ON ps.id = de.picking_slip_id
         JOIN ecd_centres e ON e.id = ps.ecd_id
        WHERE de.status = 'not_collected'
          AND ps.dispatch_date >= ${SAST_TODAY} - ${MISSED_WEEKS * 7}
        GROUP BY e.id, e.name
       HAVING COUNT(*) >= ${MISSED_AT_LEAST}
        ORDER BY COUNT(*) DESC, MAX(ps.dispatch_date) DESC, e.name ASC
        LIMIT 8`
    ),
  ]);

  return {
    recipeName: recipe?.name ?? null,
    stockCover: cover.rows.map((r) => {
      const weeklyUse = num(r.weekly_use);
      return {
        productId: r.id, name: r.name, unit: r.unit,
        onHand: num(r.on_hand), weeklyUse, weeklyUnit: r.weekly_unit,
        // One decimal: "3.4 weeks" is as fine as this estimate is. No
        // figure at all where the two units cannot be compared.
        weeks: r.comparable && weeklyUse > 0 ? Math.round((num(r.on_hand) / weeklyUse) * 10) / 10 : null,
      };
    }),
    packing: {
      total: num(packing.rows[0]?.total),
      packed: num(packing.rows[0]?.packed),
      inProgress: num(packing.rows[0]?.in_progress),
    },
    missedWeeks: MISSED_WEEKS,
    missedCollections: missed.rows.map((r) => ({ id: r.id, name: r.name, missed: num(r.missed), lastMissed: r.last_missed })),
  };
};

export default { getSummary, getMyWork, getAttention, getInsights, stockHealth };

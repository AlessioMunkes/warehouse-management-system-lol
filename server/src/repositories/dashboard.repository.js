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
import { poSyncKeySql } from './quickbooks.repository.js';
import { overdueSql } from './communityRequest.repository.js';
import { idleKitSql } from './collectionKit.repository.js';

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
//   purchaseOrders — awaiting approval; flagged for follow-up; the
//                    Finance email failed; needs a match in QuickBooks
//   communityRequests — awaiting approval; approved and waiting to go
//                    out; approved and still not gone out after
//                    OVERDUE_AFTER_DAYS (communityRequest.repository.js);
//                    and approved ones that need new items because a
//                    pallet used their stock
//   feedTheSoil    — kits nobody has logged compost for (IDLE_KIT_MONTHS,
//                    collectionKit.repository.js)
const EXPIRY_WINDOW_DAYS = 30;

const sastDay = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(date);

const getAttention = async ({ now = new Date() } = {}) => {
  const [manifest, slips, pos, requests, kits] = await Promise.all([
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
         -- Flagged for follow-up: part received with no follow-up order on
         -- its way, or marked by a manager.
         COUNT(*) FILTER (WHERE (status = 'follow_up_required' OR (status = 'partially_received' AND NOT EXISTS (
                   SELECT 1 FROM purchase_orders c
                    WHERE c.follow_up_of = purchase_orders.id AND c.status NOT IN ('completed', 'returned')))))::int AS follow_up,
         -- Finance was never told about the order; Resend is on the order.
         COUNT(*) FILTER (WHERE finance_email_status = 'failed')::int AS finance_email_failed,
         -- A supplier or product not found in QuickBooks by name: a
         -- person has to add it there, then Send again.
         COUNT(*) FILTER (WHERE EXISTS (
                   SELECT 1 FROM quickbooks_sync_queue q
                    WHERE q.idempotency_key = ${poSyncKeySql('purchase_orders.id')}
                      AND q.payload->>'state' = 'needs_match'))::int AS needs_quickbooks_match
       FROM purchase_orders`
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE outcome = 'pending')::int AS pending,
         -- The Approved tab: set aside and waiting to go out.
         COUNT(*) FILTER (WHERE outcome = 'approved'
                            AND items_short_at IS NULL)::int AS approved,
         COUNT(*) FILTER (WHERE ${overdueSql('community_requests')})::int AS overdue,
         COUNT(*) FILTER (WHERE outcome = 'approved'
                            AND items_short_at IS NOT NULL)::int AS needs_items
       FROM community_requests`
    ),
    // A warehouse without the kit tables has no kits to chase.
    pool.query(`SELECT COUNT(*)::int AS idle FROM collection_kits k WHERE ${idleKitSql('k')}`)
      .catch((err) => { if (err.code === '42P01') return { rows: [{ idle: 0 }] }; throw err; }),
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
    purchaseOrders:    {
      awaitingApproval:     num(pos.rows[0]?.awaiting_approval),
      followUp:             num(pos.rows[0]?.follow_up),
      financeEmailFailed:   num(pos.rows[0]?.finance_email_failed),
      needsQuickbooksMatch: num(pos.rows[0]?.needs_quickbooks_match),
    },
    communityRequests: {
      pending:    num(requests.rows[0]?.pending),
      approved:   num(requests.rows[0]?.approved),
      overdue:    num(requests.rows[0]?.overdue),
      needsItems: num(requests.rows[0]?.needs_items),
    },
    feedTheSoil: { idleKits: num(kits.rows[0]?.idle) },
  };
};

// ── Three figures for the manager's board ──────────────────────
// Behind the "Weeks of stock left", "Slips packed this week" and
// "Centres missing collections" widgets.
//
//   stockCover        — the stock outlook: which products are likely to
//                       run short or expire in the coming weeks
//                       (stockOutlook below).
//   packing           — this week's slips (Monday to Sunday, SAST), and
//                       how many are packed.
//   missedCollections — centres with two or more pallets not collected
//                       in the last eight weeks.
const MISSED_WEEKS = 8;
const MISSED_AT_LEAST = 2;

// ── The stock outlook ─────────────────────────────────────────
// Nothing a manager could not work out with a calculator, so every
// figure can be explained in one line:
//
//   available    on hand less what is promised: packed pallets not yet
//                collected and approved benevolent requests. The
//                Inventory screen's own figure (stock.repository.js
//                getManifest), so the two never disagree.
//   due in       what open purchase orders (approved, in transit or
//                part received) still have to bring, where the order is
//                due within DUE_IN_WEEKS, in the stock's own unit.
//   weekly use   for a product on the recipe in use: what one week of
//                slips takes (every active centre with a child count
//                that follows the recipe, counted the way its slip is,
//                banded, cans rounded up). For anything else: the
//                average dispatched a week over the last USAGE_WEEKS.
//   weeks        (available + due in) / weekly use, to one decimal.
//   runs short   today plus those weeks, when that is inside
//                SHORT_WITHIN_WEEKS.
//   may expire   the soonest use-by date on the shelf comes before the
//                available stock would be used up at that rate. Use-by
//                dates are kept per delivery, not per unit left, so this
//                assumes the oldest stock goes first: an estimate.
//
// Products that run short or may expire come first, soonest first;
// then the rest, fewest weeks first. A product with no weekly use has
// nothing to measure and is left out.
const OUTLOOK_ROWS = 8;
const USAGE_WEEKS = 8;
const DUE_IN_WEEKS = 4;
const SHORT_WITHIN_WEEKS = 8;
const DUE_IN_STATUSES = ['approved', 'in_transit', 'partially_received'];

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const recipeWeeklyUse = (recipe, childBand) => pool.query(
  `WITH centres AS (
     SELECT CEIL(e.child_count::numeric / $2::numeric) * $2::numeric AS children
       FROM ecd_centres e
      WHERE e.is_active AND e.approved_at IS NOT NULL
        AND COALESCE(e.child_count, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM recipe_own_order_centres o WHERE o.ecd_id = e.id)
   ),
   weekly AS (
     SELECT rl.product_id, rl.unit,
            SUM(CASE WHEN rl.unit = ANY($3::text[]) OR NOT rp.is_decantable
                     THEN CEIL(rl.quantity_per_child * c.children)
                     ELSE ROUND(rl.quantity_per_child * c.children, 2) END) AS quantity
       FROM recipe_lines rl
       JOIN products rp ON rp.id = rl.product_id
       CROSS JOIN centres c
      WHERE rl.recipe_id = $1
      GROUP BY rl.product_id, rl.unit
   )
   SELECT w.product_id AS id,
          w.unit                                    AS weekly_unit,
          ${toStockUnitSql('w.quantity', 'w.unit', 'sl.unit')}::numeric AS weekly_use,
          -- Stock in crates against a recipe in kilograms, with no
          -- crate weight set: the two cannot be compared.
          (sl.unit IS NULL OR ${unitRatioSql('w.unit', 'sl.unit')} IS NOT NULL) AS comparable
     FROM weekly w
     LEFT JOIN stock_levels sl ON sl.product_id = w.product_id
    WHERE w.quantity > 0`,
  [recipe.id, childBand, COUNTED_UNITS]
);

const stockOutlook = async ({ recipe, childBand, now }) => {
  const today = sastDay(now);
  const [manifest, fromRecipe, dispatched, dueIn] = await Promise.all([
    stockRepo.getManifest(),
    recipe ? recipeWeeklyUse(recipe, childBand) : { rows: [] },
    pool.query(
      `SELECT product_id, (-SUM(quantity) / ${USAGE_WEEKS})::numeric AS weekly_out
         FROM stock_movements
        WHERE movement_type = 'dispatched' AND quantity < 0
          AND created_at >= now() - make_interval(weeks => ${USAGE_WEEKS})
        GROUP BY product_id`
    ),
    pool.query(
      `SELECT poi.product_id,
              SUM(${toStockUnitSql('GREATEST(poi.expected_quantity - COALESCE(rcv.received, 0), 0)', 'p.default_unit', 'sl.unit')})::numeric AS due_in,
              MIN(po.expected_delivery_date)::text AS next_due
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         JOIN products p ON p.id = poi.product_id
         LEFT JOIN stock_levels sl ON sl.product_id = poi.product_id
         LEFT JOIN LATERAL (
           SELECT SUM(dni.received_quantity) AS received
             FROM delivery_note_items dni
            WHERE dni.purchase_order_item_id = poi.id
         ) rcv ON TRUE
        WHERE po.status = ANY($1::text[])
          AND po.expected_delivery_date IS NOT NULL
          AND po.expected_delivery_date <= ${SAST_TODAY} + ${DUE_IN_WEEKS * 7}
        GROUP BY poi.product_id`,
      [DUE_IN_STATUSES]
    ),
  ]);

  const byId = (rows) => new Map(rows.map((r) => [String(r.id ?? r.product_id), r]));
  const recipeBy = byId(fromRecipe.rows);
  const usedBy = byId(dispatched.rows);
  const dueBy = byId(dueIn.rows);

  const rows = manifest
    .filter((p) => recipeBy.has(String(p.id)) || usedBy.has(String(p.id)))
    .map((p) => {
      const id = String(p.id);
      const r = recipeBy.get(id);
      const weeklyUse = r ? num(r.weekly_use) : num(usedBy.get(id)?.weekly_out);
      const comparable = r ? Boolean(r.comparable) : true;
      const available = num(p.available);
      const due = num(dueBy.get(id)?.due_in);
      const usable = Math.max(available, 0);
      const weeks = comparable && weeklyUse > 0 ? Math.round(((usable + due) / weeklyUse) * 10) / 10 : null;
      const runsShortOn = weeks !== null && weeks < SHORT_WITHIN_WEEKS ? addDays(today, Math.floor(weeks * 7)) : null;
      // Gone at this rate, from what is on the shelf now.
      const usedUpOn = comparable && weeklyUse > 0 && usable > 0 ? addDays(today, Math.floor((usable / weeklyUse) * 7)) : null;
      const mayExpireOn = usedUpOn && p.earliest_expiry && p.earliest_expiry < usedUpOn ? p.earliest_expiry : null;
      return {
        productId: p.id, name: p.name, unit: p.unit || r?.weekly_unit || '',
        available, dueIn: due, nextDue: dueBy.get(id)?.next_due ?? null,
        weeklyUse, weeklyUnit: r ? r.weekly_unit : (p.unit || ''),
        usage: r ? 'recipe' : 'history',
        weeks, runsShortOn, mayExpireOn,
      };
    })
    .filter((p) => p.weeklyUse > 0);

  // Something to act on first, soonest first; then fewest weeks.
  const soonest = (p) => [p.runsShortOn, p.mayExpireOn].filter(Boolean).sort()[0] ?? null;
  rows.sort((a, b) => {
    const sa = soonest(a);
    const sb = soonest(b);
    if (sa && sb) return sa.localeCompare(sb) || a.name.localeCompare(b.name);
    if (sa || sb) return sa ? -1 : 1;
    if (a.weeks === null || b.weeks === null) return Number(a.weeks === null) - Number(b.weeks === null);
    return a.weeks - b.weeks || a.name.localeCompare(b.name);
  });
  return rows.slice(0, OUTLOOK_ROWS);
};

const getInsights = async ({ recipe = null, childBand = 1, now = new Date() } = {}) => {
  const [stockCover, packing, missed] = await Promise.all([
    stockOutlook({ recipe, childBand, now }),
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
    stockCover,
    outlook: { usageWeeks: USAGE_WEEKS, dueInWeeks: DUE_IN_WEEKS },
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

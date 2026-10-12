// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reorderPlan.js
//
// THE REORDER PLANNER: for each product, when it runs out at the rate
// it is going, and what has to be ordered by which date so that it
// does not. No SQL here; the repository hands over one row a product.
//
// DEMAND comes from one of two places, and the plan says which:
//   standing orders    what the active centres are due each week. This
//                      is known in advance, so it is used when there
//                      is any. Only lines in the unit the product is
//                      stocked in count; the rest are reported as a
//                      number of lines left out, never converted.
//   dispatch history   the weekly average actually dispatched over the
//                      last eight weeks, for a product with no standing
//                      order (kitchens, ad hoc slips).
//
// THE DATES
//   stock-out   today + (on hand + on order) ÷ daily demand
//   order by    stock-out − supplier lead time. Lead time is the
//               median days from PO raised to first receipt for that
//               product over the last year; with no history a default
//               is assumed and flagged as assumed.
//
// THE QUANTITY to order is what the planning horizon needs, less what
// is on hand and already on order.
//
// What is on order is counted as if it had arrived: the plan answers
// "do I need to raise another order", not "will this one be late".
// An overdue order shows in its own report.
// ─────────────────────────────────────────────────────────────

export const DEFAULT_LEAD_DAYS = 7;
export const HISTORY_WEEKS = 8;
export const SOON_DAYS = 7;
export const HORIZONS = [4, 8, 12];

const DAY = 86400000;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export const STATUS_ORDER = ['out_of_stock', 'order_now', 'order_soon', 'planned', 'covered', 'no_demand'];

/** One product's plan. `row` is a listReorderInputs() row. */
export const planProduct = (row, { today, horizonWeeks = 8, defaultLeadDays = DEFAULT_LEAD_DAYS } = {}) => {
  const onHand = Math.max(0, num(row.on_hand));
  const onOrder = Math.max(0, num(row.on_order));
  const standing = num(row.standing_weekly);
  const actual = num(row.dispatched_recent) / HISTORY_WEEKS;
  const weekly = standing > 0 ? standing : actual;
  const basis = standing > 0 ? 'standing_orders' : actual > 0 ? 'dispatch_history' : null;
  const leadKnown = row.lead_days !== null && row.lead_days !== undefined;
  const leadDays = Math.max(0, Math.round(leadKnown ? num(row.lead_days) : defaultLeadDays));

  const base = {
    productId: row.product_id,
    product: row.name,
    unit: row.unit,
    supplier: row.supplier_name ?? null,
    onHand: round(onHand, 2),
    onOrder: round(onOrder, 2),
    nextDelivery: row.next_delivery ? String(row.next_delivery).slice(0, 10) : null,
    weeklyDemand: round(weekly, 2),
    demandBasis: basis,
    standingWeekly: round(standing, 2),
    actualWeekly: round(actual, 2),
    excludedOrderLines: num(row.other_unit_lines),
    leadDays,
    leadAssumed: !leadKnown,
    reorderLevel: round(num(row.reorder_threshold), 2),
  };

  if (weekly <= 0) {
    return { ...base, status: 'no_demand', daysOfCover: null, stockOut: null, orderBy: null, suggestedQuantity: 0, projection: [] };
  }

  const perDay = weekly / 7;
  const daysOfCover = onHand / perDay;
  const coverWithOrders = (onHand + onOrder) / perDay;
  const stockOut = addDays(today, Math.floor(daysOfCover));
  const stockOutWithOrders = addDays(today, Math.floor(coverWithOrders));
  const orderBy = addDays(stockOutWithOrders, -leadDays);
  const needed = weekly * horizonWeeks - onHand - onOrder;
  const suggestedQuantity = needed > 0 ? Math.ceil(needed * 10) / 10 : 0;

  let status;
  if (suggestedQuantity <= 0) status = 'covered';
  else if (onHand <= 0 && onOrder <= 0) status = 'out_of_stock';
  else if (orderBy <= today) status = 'order_now';
  else if (orderBy <= addDays(today, SOON_DAYS)) status = 'order_soon';
  else status = 'planned';

  // Closing balance at the end of each week of the horizon, with what
  // is on order added in the week it is due (or straight away when no
  // date was given). Never below nothing: a shelf cannot hold less.
  const dueWeek = base.nextDelivery && base.nextDelivery > today
    ? Math.min(horizonWeeks, Math.max(1, Math.ceil((Date.parse(base.nextDelivery) - Date.parse(today)) / (7 * DAY))))
    : 1;
  const projection = [];
  let balance = onHand;
  for (let week = 1; week <= horizonWeeks; week += 1) {
    if (onOrder > 0 && week === dueWeek) balance += onOrder;
    balance = Math.max(0, balance - weekly);
    projection.push({ week, weekEnding: addDays(today, week * 7), balance: round(balance, 1) });
  }

  return {
    ...base,
    status,
    daysOfCover: round(daysOfCover, 1),
    stockOut,
    stockOutWithOrders,
    orderBy,
    suggestedQuantity,
    projection,
  };
};

export const buildReorderPlan = (rows, { today, horizonWeeks = 8 } = {}) => {
  const items = rows.map((r) => planProduct(r, { today, horizonWeeks }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      || String(a.orderBy ?? '9999').localeCompare(String(b.orderBy ?? '9999'))
      || a.product.localeCompare(b.product));
  const summary = Object.fromEntries(STATUS_ORDER.map((s) => [s, items.filter((i) => i.status === s).length]));
  return {
    today,
    horizonWeeks,
    historyWeeks: HISTORY_WEEKS,
    defaultLeadDays: DEFAULT_LEAD_DAYS,
    items,
    summary,
    assumedLeadTimes: items.filter((i) => i.leadAssumed && i.status !== 'no_demand').length,
  };
};

export default { buildReorderPlan, planProduct, HORIZONS, STATUS_ORDER };

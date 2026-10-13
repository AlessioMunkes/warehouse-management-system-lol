// ─────────────────────────────────────────────────────────────
// server/src/features/stock/stockCover.js
//
// STOCK COVER: how long each product lasts, when it runs out, when to
// order and how much. The one definition behind the "Days of stock
// left" report, the dashboard's stock outlook and the reorder planner,
// so the three can never disagree. No SQL and no clock here: the
// repository (stockCover.repository.js) hands over one row a product,
// already in the product's stock unit.
//
// AVAILABLE   on hand less what is promised: packed pallets not yet
//             collected and approved benevolent requests
//             (committedStock.sql.js). It can be below nothing; the
//             dates then start from today and the shortfall is added
//             to the suggested quantity.
//
// INCOMING    what open orders (approved, in transit, part received)
//             still owe, each landing on its expected delivery date
//             (or the date it was raised plus the lead time, when it
//             has none). An order whose date has passed is OVERDUE: it
//             does not count towards cover, because nobody knows when
//             it will come, but it is taken off the suggested quantity
//             so the plan never says to re-order stock already owed.
//
// WEEKLY DEMAND, the first of these that can be worked out:
//   1. planned   what a week of slips takes, made the way slip
//                generation makes them: the recipe in use for each
//                approved centre with a child count that does not keep
//                its own order, the standing order for every other
//                approved centre. Turned into the stock unit. If any
//                line cannot be turned (kilograms against crates with
//                no crate weight set), the planned figure is incomplete
//                and is not used; the reason is given.
//   2. history   the average sent out a week over the last
//                HISTORY_WEEKS ('dispatched' movements, which include
//                benevolent requests).
//   3. none      nothing to measure: no dates, nothing to order.
//
//   SEASONS: the recipe in use TODAY is taken for the whole horizon. A
//   plan that crosses a season change (summer to winter on 1 May) uses
//   the wrong recipe for the weeks after it. Working demand out week by
//   week would fix that; it is not done yet.
//
// LEAD TIME, the first of these that is known:
//   1. agreed    suppliers.expected_lead_time_days, for the supplier on
//                the product's latest order, or else its only linked
//                supplier, or else the longest agreed time among its
//                linked suppliers.
//   2. median    days from an order being raised to its first delivery,
//                over the last year.
//   3. assumed   DEFAULT_LEAD_DAYS.
//
// THE FIGURES
//   runs out on        drawing available down a day at a time at the
//                      weekly rate, each incoming order added on its
//                      day: the first day there is nothing left. An
//                      order that comes after a gap does not hide it.
//   weeks of cover     days until then, in weeks.
//   runs out on shelf  the same with nothing incoming.
//   order by           runs out on, less the lead time.
//   suggested          a horizon's demand, less available, incoming and
//                      overdue. Whole units for anything not decantable.
//
// BATCHES: available is one number because stock_levels holds one
// balance a product. Once the stock left from each delivery is known,
// pass lots ({ quantity, expiresOn }) instead and draw them down oldest
// first in drawDown(), leaving out what expires before it is used. That
// gives usable stock, expected waste and a truer runs-out date with no
// change to the three screens.
// ─────────────────────────────────────────────────────────────
import { UNIT_SIZE_SETTINGS } from '../units/unitConversion.js';

export const HISTORY_WEEKS = 8;
export const DEFAULT_LEAD_DAYS = 7;
export const DEFAULT_HORIZON_WEEKS = 8;
export const SOON_DAYS = 7;
export const STATUS_ORDER = ['out_of_stock', 'order_now', 'order_soon', 'planned', 'covered', 'no_demand'];

const DAY = 86400000;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
export const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Why a quantity in `from` cannot be turned into `to`: a size nobody
// has set, or two units that never convert.
export const unconvertedReason = ({ from, lines }, to, kind = 'line') => {
  const sized = [to, from].find((u) => UNIT_SIZE_SETTINGS[u]);
  return sized
    ? `${plural(lines, kind)} in ${from}, no ${sized} weight set`
    : `${plural(lines, kind)} in ${from}, which does not convert to ${to}`;
};

// The day the balance first runs out, as days from today (fractional),
// with each arrival ({ day, quantity }) added on its day.
export const drawDown = (available, perDay, arrivals = []) => {
  let balance = available;
  let at = 0;
  for (const { day, quantity } of [...arrivals].sort((a, b) => a.day - b.day)) {
    const reach = at + Math.max(balance, 0) / perDay;
    if (reach < day) return reach;
    balance -= perDay * (day - at);
    at = day;
    balance += quantity;
  }
  return at + Math.max(balance, 0) / perDay;
};

const chooseSupplier = (row) => {
  if (row.supplier_name) return { name: row.supplier_name, agreedDays: row.supplier_agreed_days ?? null };
  const linked = row.linked_suppliers ?? [];
  if (linked.length === 1) return { name: linked[0].name, agreedDays: linked[0].agreedDays ?? null };
  const agreed = linked.filter((s) => s.agreedDays !== null && s.agreedDays !== undefined);
  if (agreed.length > 0) {
    const longest = agreed.reduce((a, b) => (num(b.agreedDays) > num(a.agreedDays) ? b : a));
    return { name: longest.name, agreedDays: longest.agreedDays, ofLinked: linked.length };
  }
  return { name: null, agreedDays: null };
};

export const leadTimeFor = (row, defaultLeadDays = DEFAULT_LEAD_DAYS) => {
  const supplier = chooseSupplier(row);
  if (supplier.agreedDays !== null && supplier.agreedDays !== undefined) {
    const days = Math.max(0, Math.round(num(supplier.agreedDays)));
    return {
      days, source: 'agreed', supplier: supplier.name,
      label: supplier.ofLinked
        ? `Longest agreed of ${supplier.ofLinked} suppliers: ${days} days`
        : `Agreed with ${supplier.name}: ${days} days`,
      limit: null,
    };
  }
  const missing = supplier.name ? `No agreed lead time for ${supplier.name}` : 'No agreed lead time';
  if (row.median_lead_days !== null && row.median_lead_days !== undefined) {
    const days = Math.max(0, Math.round(num(row.median_lead_days)));
    return { days, source: 'median', supplier: supplier.name, label: `Median of ${plural(num(row.lead_orders), 'order')}: ${days} days`, limit: missing };
  }
  return { days: defaultLeadDays, source: 'assumed', supplier: supplier.name, label: `Assumed ${defaultLeadDays} days`, limit: `${missing} or delivery history` };
};

export const demandFor = (row, { recipeName = null, historyWeeks = HISTORY_WEEKS } = {}) => {
  const recipeWeekly = num(row.recipe_weekly);
  const standingWeekly = num(row.standing_weekly);
  const planned = recipeWeekly + standingWeekly;
  const historyWeekly = num(row.dispatched) / historyWeeks;
  const unconverted = (row.unconverted ?? []).filter((u) => num(u.lines) > 0);
  const reason = unconverted.map((u) => unconvertedReason({ from: u.from, lines: num(u.lines) }, row.unit)).join('; ');
  const parts = { recipeWeekly: round(recipeWeekly), standingWeekly: round(standingWeekly), historyWeekly: round(historyWeekly) };

  if (planned > 0 && unconverted.length === 0) {
    const recipe = `${recipeName ?? 'Recipe'} recipe`;
    const label = recipeWeekly > 0 && standingWeekly > 0 ? `${recipe} and standing orders`
      : recipeWeekly > 0 ? recipe : 'Standing orders';
    return { weekly: planned, source: 'planned', label, limit: null, ...parts };
  }
  const limit = reason ? `Planned demand not used: ${reason}` : null;
  if (historyWeekly > 0) {
    return { weekly: historyWeekly, source: 'history', label: `Sent out, last ${historyWeeks} weeks`, limit, ...parts };
  }
  return { weekly: 0, source: null, label: 'No demand', limit, ...parts };
};

/** One product's cover. `row` is a stockCover.repository listCoverInputs() row. */
export const coverFor = (row, {
  today, horizonWeeks = DEFAULT_HORIZON_WEEKS, historyWeeks = HISTORY_WEEKS,
  defaultLeadDays = DEFAULT_LEAD_DAYS, recipeName = null,
} = {}) => {
  const onHand = num(row.on_hand);
  const committed = num(row.committed);
  const available = onHand - committed;
  const demand = demandFor(row, { recipeName, historyWeeks });
  const lead = leadTimeFor(row, defaultLeadDays);
  const limits = [demand.limit, lead.limit].filter(Boolean);

  // Each open order line: due, overdue, or left out for want of a unit.
  const arrivals = [];
  let incoming = 0;
  let overdue = 0;
  let overdueOrders = 0;
  const unconvertedOrders = {};
  for (const line of row.incoming ?? []) {
    const quantity = num(line.quantity);
    if (quantity <= 0) continue;
    if (line.convertible === false) {
      unconvertedOrders[line.unit] = (unconvertedOrders[line.unit] ?? 0) + 1;
      continue;
    }
    const due = line.expectedOn ?? (line.raisedOn ? addDays(line.raisedOn, lead.days) : today);
    if (due < today) {
      overdue += quantity;
      overdueOrders += 1;
    } else {
      incoming += quantity;
      arrivals.push({ day: daysBetween(today, due), quantity, due });
    }
  }
  for (const [from, lines] of Object.entries(unconvertedOrders)) {
    limits.push(`Not counted on order: ${unconvertedReason({ from, lines }, row.unit, 'order line')}`);
  }
  if (overdueOrders > 0) limits.push('Overdue, chase supplier');

  const base = {
    productId: row.product_id,
    name: row.name,
    unit: row.unit ?? '',
    programmeId: row.programme_id ?? null,
    onHand: round(onHand),
    committed: round(committed),
    available: round(available),
    incoming: round(incoming),
    nextDelivery: arrivals.length > 0 ? arrivals.reduce((a, b) => (a.due < b.due ? a : b)).due : null,
    overdue: round(overdue),
    overdueOrders,
    weeklyDemand: round(demand.weekly),
    demandSource: demand.source,
    demandLabel: demand.label,
    recipeWeekly: demand.recipeWeekly,
    standingWeekly: demand.standingWeekly,
    historyWeekly: demand.historyWeekly,
    leadDays: lead.days,
    leadSource: lead.source,
    leadLabel: lead.label,
    supplier: lead.supplier,
    reorderLevel: round(num(row.reorder_threshold)),
    earliestExpiry: row.earliest_expiry ?? null,
    limits,
  };

  if (demand.weekly <= 0) {
    return {
      ...base, status: 'no_demand', weeksOfCover: null, runsOutOn: null, shelfRunsOutOn: null,
      orderBy: null, suggestedQuantity: 0, ifOverdueArrived: null, projection: [],
    };
  }

  const perDay = demand.weekly / 7;
  const days = drawDown(available, perDay, arrivals);
  const runsOutOn = addDays(today, Math.floor(days));
  const shelfRunsOutOn = addDays(today, Math.floor(Math.max(available, 0) / perDay));
  const orderBy = addDays(runsOutOn, -lead.days);

  // What the cover would be if the overdue orders turned up today.
  let ifOverdueArrived = null;
  if (overdue > 0) {
    const late = drawDown(available, perDay, [...arrivals, { day: 0, quantity: overdue }]);
    ifOverdueArrived = { weeksOfCover: round(late / 7, 1), runsOutOn: addDays(today, Math.floor(late)) };
  }

  const needed = demand.weekly * horizonWeeks - available - incoming - overdue;
  const whole = Boolean(row.whole_units);
  const suggestedQuantity = needed <= 0 ? 0
    : whole ? Math.ceil(round(needed, 6)) : Math.ceil(round(needed * 10, 6)) / 10;

  let status;
  if (available <= 0) status = 'out_of_stock';
  else if (suggestedQuantity <= 0) status = 'covered';
  else if (orderBy <= today) status = 'order_now';
  else if (orderBy <= addDays(today, SOON_DAYS)) status = 'order_soon';
  else status = 'planned';

  // Closing balance at the end of each week of the horizon, with each
  // order added in the week it is due. Never below nothing: a shelf
  // cannot hold less.
  const projection = [];
  let balance = Math.max(available, 0);
  for (let week = 1; week <= horizonWeeks; week += 1) {
    balance += arrivals.filter((a) => Math.max(1, Math.ceil(a.day / 7)) === week).reduce((s, a) => s + a.quantity, 0);
    balance = Math.max(0, balance - demand.weekly);
    projection.push({ week, weekEnding: addDays(today, week * 7), balance: round(balance, 1) });
  }

  return {
    ...base,
    status,
    weeksOfCover: round(days / 7, 1),
    runsOutOn,
    shelfRunsOutOn,
    orderBy,
    suggestedQuantity,
    ifOverdueArrived,
    projection,
  };
};

// Most urgent first: by status, then the soonest order-by date.
export const byUrgency = (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  || String(a.orderBy ?? '9999').localeCompare(String(b.orderBy ?? '9999'))
  || a.name.localeCompare(b.name);

export default { coverFor, demandFor, leadTimeFor, drawDown, byUrgency, HISTORY_WEEKS, DEFAULT_LEAD_DAYS };

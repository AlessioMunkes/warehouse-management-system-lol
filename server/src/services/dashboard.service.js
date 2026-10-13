// ─────────────────────────────────────────────────────────────
// server/src/services/dashboard.service.js
//
// Little validation to do — these take no input — but kept as its own
// layer rather than having the controller call the repository
// directly, matching every other feature's controller/service/
// repository split.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/dashboard.repository.js';
import stockCoverRepo from '../repositories/stockCover.repository.js';
import { HISTORY_WEEKS } from '../features/stock/stockCover.js';

const getSummary = async () => repo.getSummary();
const getMyWork  = async () => repo.getMyWork();
const getAttention = async () => repo.getAttention();

// ── The stock outlook ("Weeks of stock left") ──────────────────
// The shared stock cover (features/stock/stockCover.js): the same
// available, incoming, weekly demand, lead time and dates as the
// "Days of stock left" report and the reorder planner. The outlook
// adds one thing of its own:
//
//   may expire   a delivery estimated to be still on the shelf will not
//                all be used by its use-by date at the weekly rate (the
//                lots in features/stock/shelfLots.js). Use-by dates are
//                kept per delivery, not per unit left, so this assumes
//                the oldest stock goes first: an estimate. A manager can
//                dismiss a delivery's warning, and it is then left out.
//                Batch tracking would make it exact.
//
// Products that run short within SHORT_WITHIN_WEEKS or may expire come
// first, soonest first; then the rest, fewest weeks first. A product
// with no weekly demand has nothing to measure and is left out; those
// left out for want of data are counted so the panel can say so.
export const OUTLOOK_ROWS = 8;
export const SHORT_WITHIN_WEEKS = 8;

export const stockOutlook = (items) => {
  const rows = items
    .filter((i) => i.weeklyDemand > 0)
    .map((i) => ({
      productId: i.productId,
      name: i.name,
      unit: i.unit,
      available: i.available,
      dueIn: i.incoming,
      nextDue: i.nextDelivery,
      overdue: i.overdue,
      ifOverdueArrived: i.ifOverdueArrived,
      weeklyUse: i.weeklyDemand,
      demandSource: i.demandSource,
      demandLabel: i.demandLabel,
      leadLabel: i.leadLabel,
      orderBy: i.orderBy,
      limits: i.limits,
      weeks: i.weeksOfCover,
      runsShortOn: i.weeksOfCover < SHORT_WITHIN_WEEKS ? i.runsOutOn : null,
      mayExpireOn: i.mayExpireOn,
      mayExpireQuantity: i.mayExpireQuantity,
    }));

  // Something to act on first, soonest first; then fewest weeks.
  const soonest = (p) => [p.runsShortOn, p.mayExpireOn].filter(Boolean).sort()[0] ?? null;
  rows.sort((a, b) => {
    const sa = soonest(a);
    const sb = soonest(b);
    if (sa && sb) return sa.localeCompare(sb) || a.name.localeCompare(b.name);
    if (sa || sb) return sa ? -1 : 1;
    return a.weeks - b.weeks || a.name.localeCompare(b.name);
  });
  return {
    stockCover: rows.slice(0, OUTLOOK_ROWS),
    unmeasured: items.filter((i) => i.weeklyDemand <= 0 && i.limits.some((l) => l.startsWith('Planned demand not used'))).length,
  };
};

const getInsights = async () => {
  const [cover, rest] = await Promise.all([stockCoverRepo.loadStockCover(), repo.getInsights()]);
  const { stockCover, unmeasured } = stockOutlook(cover.items);
  return {
    ...rest,
    recipeName: cover.recipeName,
    stockCover,
    outlook: { usageWeeks: HISTORY_WEEKS, unmeasured },
  };
};

export default { getSummary, getMyWork, getAttention, getInsights };

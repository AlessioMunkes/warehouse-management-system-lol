// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/reorderPlan.js
//
// THE REORDER PLANNER: for each product, when it runs out at the rate
// it is going, and what has to be ordered by which date so that it
// does not. Every figure is the shared stock cover calculation
// (features/stock/stockCover.js), the same one the "Days of stock
// left" report and the dashboard's stock outlook use; this only counts
// each status for the planner's filter chips.
// ─────────────────────────────────────────────────────────────
import { STATUS_ORDER } from '../stock/stockCover.js';

export const HORIZONS = [4, 8, 12];

/** `cover` is stockCover.repository loadStockCover()'s result. */
export const buildReorderPlan = (cover) => {
  const { items } = cover;
  const active = items.filter((i) => i.status !== 'no_demand');
  return {
    ...cover,
    summary: Object.fromEntries(STATUS_ORDER.map((s) => [s, items.filter((i) => i.status === s).length])),
    assumedLeadTimes: active.filter((i) => i.leadSource === 'assumed').length,
    agreedLeadTimes: active.filter((i) => i.leadSource === 'agreed').length,
    limited: items.filter((i) => i.limits.length > 0).length,
  };
};

export default { buildReorderPlan, HORIZONS };

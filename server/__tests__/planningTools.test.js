// ─────────────────────────────────────────────────────────────
// __tests__/planningTools.test.js
//
// The arithmetic of three tools on the Operations reports page: the
// reorder planner, the exception alerts and the workload heatmap. Each
// is tested as arithmetic: known rows in, known answer out.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { planProduct, buildReorderPlan } from '../src/features/reporting/reorderPlan.js';
import { assess, alignWeeks, completeWeeks, rankAlerts } from '../src/features/reporting/controlLimits.js';
import { buildWorkload, weekdayCounts } from '../src/features/reporting/workload.js';

const TODAY = '2026-10-12';   // a Monday

describe('the reorder planner', () => {
  const row = (over = {}) => ({
    product_id: 1, name: 'Rice 2 kg', unit: 'bag', on_hand: 70, reorder_threshold: 20,
    standing_weekly: 35, other_unit_lines: 0, dispatched_recent: 160, on_order: 0, next_delivery: null,
    lead_days: 4, supplier_name: 'Cape Dry Goods', ...over,
  });
  const plan = (over, options) => planProduct(row(over), { today: TODAY, horizonWeeks: 8, ...options });

  it('works out cover, the stock-out date, the order-by date and what to order', () => {
    const p = plan();
    expect(p).toMatchObject({
      weeklyDemand: 35, demandBasis: 'standing_orders', daysOfCover: 14,
      stockOut: '2026-10-26', orderBy: '2026-10-22', leadDays: 4, leadAssumed: false,
      suggestedQuantity: 210, status: 'planned',
    });
  });

  it('plans on standing orders when there are any, and on dispatch history when there are none', () => {
    expect(plan().actualWeekly).toBe(20);
    const adHoc = plan({ standing_weekly: 0 });
    expect(adHoc).toMatchObject({ weeklyDemand: 20, demandBasis: 'dispatch_history' });
  });

  it('says when to order: now, soon, later, or not at all', () => {
    expect(plan({ on_hand: 15 }).status).toBe('order_now');            // 3 days of cover, 4 days lead
    expect(plan({ on_hand: 50 }).status).toBe('order_soon');           // order by the 18th
    expect(plan({ on_hand: 200 }).status).toBe('planned');
    expect(plan({ on_hand: 400 })).toMatchObject({ status: 'covered', suggestedQuantity: 0 });
    expect(plan({ on_hand: 0 }).status).toBe('out_of_stock');
    expect(plan({ standing_weekly: 0, dispatched_recent: 0 })).toMatchObject({ status: 'no_demand', stockOut: null, suggestedQuantity: 0 });
  });

  it('counts what is already on order towards the plan', () => {
    const p = plan({ on_hand: 15, on_order: 140, next_delivery: '2026-10-15' });
    expect(p.stockOut).toBe('2026-10-15');                 // what is on hand alone
    expect(p.stockOutWithOrders).toBe('2026-11-12');       // 155 at 5 a day
    expect(p.orderBy).toBe('2026-11-08');
    expect(p.suggestedQuantity).toBe(125);                 // 280 needed, 155 on hand or coming
    expect(p.status).toBe('planned');
  });

  it('assumes a lead time when there is no history, and says so', () => {
    const p = plan({ lead_days: null });
    expect(p).toMatchObject({ leadDays: 7, leadAssumed: true, orderBy: '2026-10-19' });
  });

  it('projects the closing balance week by week, never below nothing', () => {
    const p = plan({ on_hand: 80, on_order: 100, next_delivery: '2026-10-28' }, { horizonWeeks: 4 });
    expect(p.projection.map((w) => w.balance)).toEqual([45, 10, 75, 40]);
    expect(plan({ on_hand: 40 }, { horizonWeeks: 4 }).projection.map((w) => w.balance)).toEqual([5, 0, 0, 0]);
  });

  it('reports order lines in another unit instead of converting them', () => {
    expect(plan({ other_unit_lines: 3 }).excludedOrderLines).toBe(3);
  });

  it('lists the most urgent first and counts each status', () => {
    const out = buildReorderPlan([
      row({ product_id: 1, name: 'Beans', on_hand: 400 }),
      row({ product_id: 2, name: 'Rice', on_hand: 15 }),
      row({ product_id: 3, name: 'Oil', on_hand: 0 }),
      row({ product_id: 4, name: 'Salt', standing_weekly: 0, dispatched_recent: 0, lead_days: null }),
      row({ product_id: 5, name: 'Samp', on_hand: 50, lead_days: null }),
    ], { today: TODAY, horizonWeeks: 8 });
    expect(out.items.map((i) => i.product)).toEqual(['Oil', 'Rice', 'Samp', 'Beans', 'Salt']);
    expect(out.summary).toMatchObject({ out_of_stock: 1, order_now: 1, order_soon: 1, covered: 1, no_demand: 1 });
    // Salt has no demand, so its missing lead time is nobody's problem.
    expect(out.assumedLeadTimes).toBe(1);
  });
});

describe('exception alerts', () => {
  const pts = (values) => values.map((value, i) => ({ label: `W${i + 1}`, value }));

  it('takes the last complete weeks, leaving out the week in progress', () => {
    const w = completeWeeks('2026-10-14', 3);        // a Wednesday
    expect(w).toEqual({ from: '2026-09-21', to: '2026-10-11', labels: ['2026-W39', '2026-W40', '2026-W41'] });
  });

  it('lines a report up with the weeks, a missing week being zero for a volume and no reading for a rate', () => {
    const series = [{ label: '2026-W39', value: 5 }, { label: '2026-W41', value: 7 }];
    const labels = ['2026-W39', '2026-W40', '2026-W41'];
    expect(alignWeeks(series, labels).map((p) => p.value)).toEqual([5, null, 7]);
    expect(alignWeeks(series, labels, { fillZero: true }).map((p) => p.value)).toEqual([5, 0, 7]);
  });

  it('sets limits two standard deviations either side of the baseline mean', () => {
    const a = assess(pts([4, 6, 4, 6, 4, 6, 5]), 'down');
    expect(a).toMatchObject({ mean: 5, sigma: 1.1, lower: 2.81, upper: 7.19, status: 'in_control', signal: null, baselineWeeks: 6 });
  });

  it('calls a week beyond the limit adverse or favourable by which way is good', () => {
    const wastage = assess(pts([4, 6, 4, 6, 4, 6, 12]), 'down');
    expect(wastage).toMatchObject({ status: 'out_of_control', side: 'above', signal: 'adverse', deviation: 6.4 });
    expect(assess(pts([4, 6, 4, 6, 4, 6, 12]), 'up').signal).toBe('favourable');
    expect(assess(pts([4, 6, 4, 6, 4, 6, 1]), 'up')).toMatchObject({ side: 'below', signal: 'adverse' });
    expect(assess(pts([4, 6, 4, 6, 4, 6, 12]), null).signal).toBe('unusual');
  });

  it('flags three weeks running the wrong way before a limit is crossed', () => {
    const a = assess(pts([5, 3, 6, 4, 5.2, 5.4, 5.6, 5.8]), 'down');
    expect(a).toMatchObject({ status: 'in_control', signal: 'trend', trend: true });
    expect(assess(pts([5, 3, 6, 4, 5.2, 5.4, 5.6, 5.8]), 'up').signal).toBeNull();
  });

  it('does not judge a measure with too little history, or no reading this week', () => {
    expect(assess(pts([4, 6, 4, 12]), 'down')).toMatchObject({ status: 'insufficient', signal: null, upper: null });
    expect(assess(pts([4, 6, 4, 6, 4, 6, null]), 'down').status).toBe('insufficient');
  });

  it('treats any change from a flat baseline as out of control', () => {
    expect(assess(pts([5, 5, 5, 5, 5, 5, 6]), 'down')).toMatchObject({ status: 'out_of_control', signal: 'adverse', deviation: null });
    expect(assess(pts([5, 5, 5, 5, 5, 5, 5]), 'down').status).toBe('in_control');
  });

  it('puts the adverse first, then the worsening, the unusual, the favourable, the quiet', () => {
    const item = (label, signal, status = 'in_control', deviation = 1) => ({ label, signal, status, deviation });
    const ranked = rankAlerts([
      item('quiet', null), item('good', 'favourable', 'out_of_control'), item('odd', 'unusual', 'out_of_control'),
      item('new', null, 'insufficient'), item('worse', 'trend'), item('bad', 'adverse', 'out_of_control', 2.5),
      item('very bad', 'adverse', 'out_of_control', -4),
    ]);
    expect(ranked.map((i) => i.label)).toEqual(['very bad', 'bad', 'worse', 'odd', 'good', 'quiet', 'new']);
  });
});

describe('the workload heatmap', () => {
  const RANGE = { from: '2026-09-28', to: '2026-10-11' };   // two full weeks
  const rows = [
    { area: 'receiving', weekday: 1, hour: 8, events: 6 },
    { area: 'receiving', weekday: 1, hour: 9, events: 2 },
    { area: 'receiving', weekday: 3, hour: 8, events: 2 },
    { area: 'gate', weekday: 2, hour: 10, events: 30 },
    { area: 'gate', weekday: 4, hour: 19, events: 1 },
  ];

  it('counts how often each weekday falls in the period', () => {
    expect(weekdayCounts('2026-09-28', '2026-10-11')).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(weekdayCounts('2026-10-12', '2026-10-14')).toEqual([1, 1, 1, 0, 0, 0, 0]);
  });

  it('lays work out by weekday and hour, with the average for that weekday', () => {
    const out = buildWorkload(rows, RANGE);
    const receiving = out.areas.find((a) => a.id === 'receiving');
    expect(receiving.total).toBe(10);
    expect(receiving.cells.find((c) => c.weekday === 0 && c.hour === 8)).toMatchObject({ total: 6, average: 3 });
    expect(receiving.peak).toMatchObject({ weekday: 'Monday', hour: 8, average: 3 });
    expect(receiving.busiestDay).toMatchObject({ label: 'Monday', total: 8, average: 4 });
    expect(receiving.byHour.find((h) => h.hour === 8).total).toBe(8);
  });

  it('always shows the working day, and stretches for work outside it', () => {
    expect(buildWorkload(rows.slice(0, 3), RANGE).hours).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(buildWorkload(rows, RANGE).hours[buildWorkload(rows, RANGE).hours.length - 1]).toBe(19);
  });

  it('says an area with nothing recorded has no peak, and a period with nothing is empty', () => {
    const out = buildWorkload(rows, RANGE);
    expect(out.areas.find((a) => a.id === 'packing')).toMatchObject({ total: 0, peak: null });
    expect(out.empty).toBe(false);
    expect(buildWorkload([], RANGE).empty).toBe(true);
  });
});

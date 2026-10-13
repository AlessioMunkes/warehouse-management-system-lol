// ─────────────────────────────────────────────────────────────
// __tests__/stockCover.test.js
//
// The shared stock cover calculation (features/stock/stockCover.js),
// worked by hand. Every example starts from Monday 12 October 2026 and
// 100 kg available used at 35 kg a week, which is 5 kg a day: 20 days.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  coverFor, demandFor, leadTimeFor, drawDown, unconvertedReason, byUrgency,
} from '../src/features/stock/stockCover.js';

const TODAY = '2026-10-12';

const row = (over = {}) => ({
  product_id: 1, name: 'Maize meal', unit: 'kg', programme_id: null, whole_units: false,
  on_hand: 120, committed: 20, reorder_threshold: 0,
  recipe_weekly: 35, standing_weekly: 0, unconverted: [], dispatched: 0,
  incoming: [], supplier_name: 'Cape Mills', supplier_agreed_days: 4, linked_suppliers: [],
  median_lead_days: null, lead_orders: 0, lots: [],
  ...over,
});
const cover = (over, opts) => coverFor(row(over), { today: TODAY, horizonWeeks: 8, recipeName: 'Summer', ...opts });

describe('stock cover', () => {
  describe('use-by dates, from the estimated lots', () => {
    // 100 available at 5 kg a day. A: 60 left, 8 days to its date, 40 usable, so 20 left over.
    // B: 80 left, 49 days, 245 usable with 140 ahead of it: all used in time.
    const lot = (lineId, expiryDate, left, dismissal = null) => ({ lineId, expiryDate, left, dismissal });
    const lots = [lot(1, '2026-10-20', 60), lot(2, '2026-11-30', 80)];

    it('takes the earliest expiry from the lots and flags the one that will not be used in time', () => {
      expect(cover({ lots })).toMatchObject({ earliestExpiry: '2026-10-20', mayExpireOn: '2026-10-20', mayExpireQuantity: 20 });
    });

    it('leaves a dismissed lot out of both', () => {
      const c = cover({ lots: [lot(1, '2026-10-20', 60, { reason: 'checked' }), lot(2, '2026-11-30', 80)] });
      expect(c).toMatchObject({ earliestExpiry: '2026-11-30', mayExpireOn: null, mayExpireQuantity: 0 });
    });

    it('flags nothing when everything is already committed, and nothing for a product with no demand', () => {
      expect(cover({ lots, on_hand: 20, committed: 20 })).toMatchObject({ mayExpireOn: null });
      expect(cover({ lots, recipe_weekly: 0 })).toMatchObject({ earliestExpiry: '2026-10-20', mayExpireOn: null, mayExpireQuantity: 0 });
    });

    it('has no use-by date for a product with no lots', () => {
      expect(cover()).toMatchObject({ earliestExpiry: null, mayExpireOn: null });
    });
  });

  it('works out available, cover, the runs-out date, the order-by date and what to order', () => {
    expect(cover()).toMatchObject({
      available: 100, weeklyDemand: 35, demandSource: 'planned', demandLabel: 'Summer recipe', daysOfCover: 20,
      weeksOfCover: 2.9,                 // 20 days
      runsOutOn: '2026-11-01', shelfRunsOutOn: '2026-11-01',
      leadDays: 4, leadSource: 'agreed', leadLabel: 'Agreed with Cape Mills: 4 days',
      orderBy: '2026-10-28',
      suggestedQuantity: 180,            // 8 weeks of 35 is 280, less 100 available
      status: 'planned', limits: [],
    });
  });

  it('gives whole days of cover, always rounded down', () => {
    // 100 available at 5 a day is 20 days exactly.
    expect(cover().coverDays).toBe(20);
    // 99 at 5 a day is 19.8 days: 19, not 20, though daysOfCover shows 19.8.
    expect(cover({ on_hand: 119 })).toMatchObject({ daysOfCover: 19.8, coverDays: 19 });
    // 100 at 50 a week (7.142857 a day) is exactly 14 days; a float must not make it 13.
    expect(cover({ recipe_weekly: 50 })).toMatchObject({ coverDays: 14 });
    // Nothing available: none.
    expect(cover({ on_hand: 20 }).coverDays).toBe(0);
    // No demand, nothing to measure.
    expect(cover({ recipe_weekly: 0 }).coverDays).toBeNull();
  });

  it('gives the whole days of cover there would be if the overdue orders arrived today', () => {
    // 100 available + 50 overdue at 5 a day = 30 days.
    const c = cover({ incoming: [{ quantity: 50, expectedOn: '2026-10-05' }] });
    expect(c.ifOverdueArrived).toMatchObject({ coverDays: 30 });
  });

  it('adds an order on the day it is due', () => {
    // 70 kg on day 14: 30 left then, 100 after, 20 more days.
    const c = cover({ incoming: [{ quantity: 70, expectedOn: '2026-10-26' }] });
    expect(c).toMatchObject({ incoming: 70, nextDelivery: '2026-10-26', runsOutOn: '2026-11-15', weeksOfCover: 4.9 });
    expect(c.shelfRunsOutOn).toBe('2026-11-01');
    expect(c.suggestedQuantity).toBe(110);
  });

  it('does not let an order that comes after the stock has run out hide the gap', () => {
    const c = cover({ incoming: [{ quantity: 70, expectedOn: '2026-11-11' }] });
    expect(c).toMatchObject({ runsOutOn: '2026-11-01', weeksOfCover: 2.9 });
  });

  it('dates an order with no expected date from when it was raised plus the lead time', () => {
    // Raised on the 10th, 4 days' lead: due on the 14th.
    const c = cover({ incoming: [{ quantity: 70, expectedOn: null, raisedOn: '2026-10-10' }] });
    expect(c.nextDelivery).toBe('2026-10-14');
  });

  it('leaves an overdue order out of cover but off the suggested quantity, and says to chase it', () => {
    const c = cover({ incoming: [{ quantity: 50, expectedOn: '2026-10-05' }] });
    expect(c).toMatchObject({
      incoming: 0, overdue: 50, overdueOrders: 1, runsOutOn: '2026-11-01', weeksOfCover: 2.9,
      suggestedQuantity: 130,            // 280 less 100 available and 50 owed
      ifOverdueArrived: { weeksOfCover: 4.3, runsOutOn: '2026-11-11' },   // 150 kg is 30 days
    });
    expect(c.limits).toContain('Overdue, chase supplier');
  });

  it('counts stock promised beyond what is on hand as a shortfall to order', () => {
    const c = cover({ on_hand: 10, committed: 25 });
    expect(c).toMatchObject({
      available: -15, status: 'out_of_stock', runsOutOn: TODAY, shelfRunsOutOn: TODAY, weeksOfCover: 0,
      suggestedQuantity: 295,            // 280 plus the 15 short
    });
    // An order arriving today first fills the shortfall: 85 left, 17 days.
    expect(cover({ on_hand: 10, committed: 25, incoming: [{ quantity: 100, expectedOn: TODAY }] }).runsOutOn).toBe('2026-10-29');
  });

  it('has nothing to work out for a product with no demand and no history', () => {
    expect(cover({ recipe_weekly: 0 })).toMatchObject({
      status: 'no_demand', demandSource: null, demandLabel: 'No demand',
      weeksOfCover: null, runsOutOn: null, orderBy: null, suggestedQuantity: 0, projection: [],
    });
  });

  it('rounds a suggested quantity up to a whole unit for a product that is not decantable', () => {
    expect(cover({ on_hand: 119.8 }).suggestedQuantity).toBe(180.2);
    expect(cover({ on_hand: 119.8, whole_units: true }).suggestedQuantity).toBe(181);
    expect(cover({ on_hand: 119.79 }).suggestedQuantity).toBe(180.3);
  });

  it('says when to order: now, soon, later, or not at all', () => {
    expect(cover({ on_hand: 35 }).status).toBe('order_now');      // 15 kg, 3 days, 4 days' lead
    expect(cover({ on_hand: 70 }).status).toBe('order_soon');     // 50 kg, order by the 18th
    expect(cover({ on_hand: 400 })).toMatchObject({ status: 'covered', suggestedQuantity: 0 });
  });

  it('projects the closing balance week by week, never below nothing', () => {
    const c = cover({ incoming: [{ quantity: 70, expectedOn: '2026-10-26' }] }, { horizonWeeks: 4 });
    expect(c.projection.map((w) => w.balance)).toEqual([65, 100, 65, 30]);
    expect(cover({ on_hand: 60 }, { horizonWeeks: 4 }).projection.map((w) => w.balance)).toEqual([5, 0, 0, 0]);
  });
});

describe('weekly demand', () => {
  const demand = (over) => demandFor(row(over), { recipeName: 'Summer' });

  it('adds the recipe and the standing orders, as slips are made', () => {
    expect(demand({ recipe_weekly: 30, standing_weekly: 5 }))
      .toMatchObject({ weekly: 35, source: 'planned', label: 'Summer recipe and standing orders' });
    expect(demand({ recipe_weekly: 0, standing_weekly: 5 })).toMatchObject({ weekly: 5, label: 'Standing orders' });
  });

  it('uses the recipe already turned into the stock unit', () => {
    // 50 kg a week on the recipe against crates of 10 kg arrives as 5.
    expect(demand({ unit: 'crate', recipe_weekly: 5 })).toMatchObject({ weekly: 5, source: 'planned' });
  });

  it('falls back to dispatch history when a planned line cannot be turned into the stock unit, and says why', () => {
    const d = demand({ unit: 'crate', recipe_weekly: 2, unconverted: [{ from: 'kg', lines: 3 }], dispatched: 80 });
    expect(d).toMatchObject({
      weekly: 10, source: 'history', label: 'Sent out, last 8 weeks',
      limit: 'Planned demand not used: 3 lines in kg, no crate weight set',
    });
  });

  it('uses dispatch history for a product with no planned demand', () => {
    expect(demand({ recipe_weekly: 0, dispatched: 160 })).toMatchObject({ weekly: 20, source: 'history', limit: null });
  });

  it('still says why when nothing can be measured', () => {
    const d = demand({ unit: 'crate', recipe_weekly: 0, unconverted: [{ from: 'kg', lines: 1 }] });
    expect(d).toMatchObject({ weekly: 0, source: null, limit: 'Planned demand not used: 1 line in kg, no crate weight set' });
  });

  it('names units that never convert', () => {
    expect(unconvertedReason({ from: 'each', lines: 2 }, 'kg')).toBe('2 lines in each, which does not convert to kg');
  });
});

describe('lead time', () => {
  const lead = (over) => leadTimeFor(row(over));

  it('prefers the time agreed with the supplier', () => {
    expect(lead({ median_lead_days: 9 })).toMatchObject({ days: 4, source: 'agreed', limit: null });
  });

  it('uses the median of past orders when none is agreed, and says what is missing', () => {
    expect(lead({ supplier_agreed_days: null, median_lead_days: 9.6, lead_orders: 4 })).toMatchObject({
      days: 10, source: 'median', label: 'Median of 4 orders: 10 days', limit: 'No agreed lead time for Cape Mills',
    });
  });

  it('assumes seven days with neither', () => {
    expect(lead({ supplier_name: null, supplier_agreed_days: null })).toMatchObject({
      days: 7, source: 'assumed', label: 'Assumed 7 days', limit: 'No agreed lead time or delivery history',
    });
  });

  it('takes a linked supplier when nothing has been ordered, the longest agreed time when there are several', () => {
    expect(lead({ supplier_name: null, linked_suppliers: [{ name: 'Fresh Co', agreedDays: 3 }] }))
      .toMatchObject({ days: 3, label: 'Agreed with Fresh Co: 3 days' });
    expect(lead({
      supplier_name: null,
      linked_suppliers: [{ name: 'A', agreedDays: null }, { name: 'B', agreedDays: 5 }, { name: 'C', agreedDays: 9 }],
    })).toMatchObject({ days: 9, supplier: 'C', label: 'Longest agreed of 3 suppliers: 9 days' });
  });
});

describe('drawing stock down', () => {
  it('runs out when the balance is gone, orders landing on their day', () => {
    expect(drawDown(100, 5)).toBe(20);
    expect(drawDown(100, 5, [{ day: 20, quantity: 50 }])).toBe(30);   // lands the day it would run out
    expect(drawDown(100, 5, [{ day: 21, quantity: 50 }])).toBe(20);   // a day too late
  });

  it('puts the most urgent first', () => {
    const items = [
      { name: 'B', status: 'planned', orderBy: '2026-11-01' },
      { name: 'A', status: 'planned', orderBy: '2026-10-30' },
      { name: 'C', status: 'order_now', orderBy: '2026-10-10' },
    ];
    expect(items.sort(byUrgency).map((i) => i.name)).toEqual(['C', 'A', 'B']);
  });
});

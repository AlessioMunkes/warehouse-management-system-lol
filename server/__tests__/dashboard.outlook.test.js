// ─────────────────────────────────────────────────────────────
// server/__tests__/dashboard.outlook.test.js
//
// The stock outlook on the manager's dashboard ("Weeks of stock
// left"): the shared stock cover (stockCover.test.js works its figures
// by hand), narrowed to what needs acting on, with a flag when the
// lot will not all be used by its use-by date.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';

const coverMock = { loadStockCover: vi.fn() };
vi.mock('../src/repositories/stockCover.repository.js', () => ({ default: coverMock }));
const repoMock = { getInsights: vi.fn() };
vi.mock('../src/repositories/dashboard.repository.js', () => ({ default: repoMock }));

const { default: service, stockOutlook } = await import('../src/services/dashboard.service.js');

// Figures as the shared stock cover gives them, from Monday 12 October 2026.
const item = (over = {}) => ({
  productId: 1, name: 'Maize meal', unit: 'kg', available: 100, incoming: 50, nextDelivery: '2026-10-19',
  overdue: 0, ifOverdueArrived: null, weeklyDemand: 50, demandSource: 'planned', demandLabel: 'Summer recipe',
  leadLabel: 'Assumed 7 days', orderBy: '2026-10-26', limits: ['No agreed lead time or delivery history'],
  weeksOfCover: 3, runsOutOn: '2026-11-02', shelfRunsOutOn: '2026-10-26', earliestExpiry: null,
  mayExpireOn: null, mayExpireQuantity: 0,
  ...over,
});

describe('stock outlook', () => {
  it('shows the shared figures, with where demand and lead time came from', () => {
    const [maize] = stockOutlook([item()]).stockCover;
    expect(maize).toMatchObject({
      name: 'Maize meal', available: 100, dueIn: 50, nextDue: '2026-10-19', weeklyUse: 50, weeks: 3,
      runsShortOn: '2026-11-02', demandLabel: 'Summer recipe', leadLabel: 'Assumed 7 days', orderBy: '2026-10-26',
      limits: ['No agreed lead time or delivery history'],
    });
  });

  it('gives no runs-short date beyond eight weeks', () => {
    expect(stockOutlook([item({ weeksOfCover: 20 })]).stockCover[0].runsShortOn).toBeNull();
  });

  it('carries the use-by date the stock cover says will not be met, and how much will be left', () => {
    const [maize] = stockOutlook([item({ mayExpireOn: '2026-10-20', mayExpireQuantity: 20 })]).stockCover;
    expect(maize).toMatchObject({ mayExpireOn: '2026-10-20', mayExpireQuantity: 20 });
    expect(stockOutlook([item()]).stockCover[0]).toMatchObject({ mayExpireOn: null, mayExpireQuantity: 0 });
  });

  it('carries an overdue order and what cover would be if it came', () => {
    const [maize] = stockOutlook([item({ overdue: 30, ifOverdueArrived: { weeksOfCover: 3.6, runsOutOn: '2026-11-06' } })]).stockCover;
    expect(maize).toMatchObject({ overdue: 30, ifOverdueArrived: { weeksOfCover: 3.6 } });
  });

  it('leaves out products with no demand, counts those left out for want of data, and puts what needs acting on first', () => {
    const out = stockOutlook([
      item({ productId: 3, name: 'Peanut butter', weeksOfCover: 20 }),
      item({ productId: 1, name: 'Maize meal' }),
      item({ productId: 2, name: 'Pilchards', weeksOfCover: 4, runsOutOn: '2026-11-09', mayExpireOn: '2026-10-20' }),
      item({ productId: 4, name: 'Salt', weeklyDemand: 0, limits: [] }),
      item({ productId: 5, name: 'Onions', weeklyDemand: 0, limits: ['Planned demand not used: 1 line in kg, no bag weight set'] }),
    ]);
    expect(out.stockCover.map((r) => r.name)).toEqual(['Pilchards', 'Maize meal', 'Peanut butter']);
    expect(out.unmeasured).toBe(1);
  });
});

describe('dashboard insights', () => {
  it('puts the outlook beside the board figures', async () => {
    coverMock.loadStockCover.mockResolvedValue({ recipeName: 'Summer', items: [item()] });
    repoMock.getInsights.mockResolvedValue({ packing: { total: 4, packed: 1 }, missedWeeks: 8, missedCollections: [] });
    const out = await service.getInsights();
    // Only the outlook reads use-by dates, so only it asks for the estimated lots.
    expect(coverMock.loadStockCover).toHaveBeenCalledWith({ shelfLots: true });
    expect(out).toMatchObject({
      recipeName: 'Summer', packing: { total: 4, packed: 1 }, outlook: { usageWeeks: 8, unmeasured: 0 },
    });
    expect(out.stockCover).toHaveLength(1);
  });
});

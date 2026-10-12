// ─────────────────────────────────────────────────────────────
// server/__tests__/dashboard.outlook.repository.test.js
//
// The stock outlook on the manager's dashboard ("Weeks of stock
// left"): available stock plus what is due in, against a weekly use,
// gives weeks of cover; a date it runs short; and a flag when the
// soonest use-by date comes before the stock would be used up.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const stockRepoMock = { getManifest: vi.fn() };
vi.mock('../src/repositories/stock.repository.js', () => ({ default: stockRepoMock }));

const { default: repo } = await import('../src/repositories/dashboard.repository.js');

// 10:00 SAST on Monday 12 October 2026.
const NOW = new Date('2026-10-12T08:00:00Z');
const RECIPE = { id: 7, name: 'Summer' };

let recipeRows; let dispatchedRows; let dueRows;

beforeEach(() => {
  vi.clearAllMocks();
  recipeRows = [];
  dispatchedRows = [];
  dueRows = [];
  poolMock.query.mockImplementation(async (sql) => {
    if (/FROM recipe_lines/.test(sql)) return { rows: recipeRows };
    if (/FROM stock_movements/.test(sql)) return { rows: dispatchedRows };
    if (/FROM purchase_order_items/.test(sql)) return { rows: dueRows };
    return { rows: [{}] };
  });
  stockRepoMock.getManifest.mockResolvedValue([
    { id: 1, name: 'Maize meal', unit: 'kg', available: '100', earliest_expiry: null },
    { id: 2, name: 'Pilchards', unit: 'cans', available: '40', earliest_expiry: '2026-10-20' },
    { id: 3, name: 'Peanut butter', unit: 'kg', available: '500', earliest_expiry: null },
    { id: 4, name: 'Nothing used', unit: 'kg', available: '10', earliest_expiry: null },
  ]);
});

const outlook = async (opts = {}) => (await repo.getInsights({ recipe: RECIPE, now: NOW, ...opts })).stockCover;

describe('stock outlook', () => {
  it('counts available plus due in against the recipe\'s weekly use', async () => {
    recipeRows = [{ id: 1, weekly_unit: 'kg', weekly_use: '50', comparable: true }];
    dueRows = [{ product_id: 1, due_in: '50', next_due: '2026-10-19' }];
    const [maize] = await outlook();
    expect(maize).toMatchObject({
      name: 'Maize meal', available: 100, dueIn: 50, nextDue: '2026-10-19', weeklyUse: 50, usage: 'recipe', weeks: 3,
    });
    // Three weeks from Monday 12 October.
    expect(maize.runsShortOn).toBe('2026-11-02');
  });

  it('uses the last eight weeks of dispatches for a product not on the recipe', async () => {
    dispatchedRows = [{ product_id: 3, weekly_out: '25' }];
    const [pb] = await outlook({ recipe: null });
    expect(pb).toMatchObject({ name: 'Peanut butter', weeklyUse: 25, usage: 'history', weeks: 20, runsShortOn: null });
  });

  it('flags stock whose next use-by date comes before it would be used up', async () => {
    // 40 cans at 10 a week lasts four weeks; the use-by date is in eight days.
    recipeRows = [{ id: 2, weekly_unit: 'cans', weekly_use: '10', comparable: true }];
    const [pilchards] = await outlook();
    expect(pilchards.mayExpireOn).toBe('2026-10-20');
  });

  it('does not flag stock that will be used before its use-by date', async () => {
    recipeRows = [{ id: 2, weekly_unit: 'cans', weekly_use: '40', comparable: true }];
    const [pilchards] = await outlook();
    expect(pilchards.mayExpireOn).toBeNull();
  });

  it('gives no weeks where the recipe and stock units cannot be compared', async () => {
    recipeRows = [{ id: 1, weekly_unit: 'kg', weekly_use: '50', comparable: false }];
    const [maize] = await outlook();
    expect(maize.weeks).toBeNull();
    expect(maize.runsShortOn).toBeNull();
  });

  it('leaves out products with no weekly use, and puts what needs acting on first', async () => {
    recipeRows = [
      { id: 1, weekly_unit: 'kg', weekly_use: '50', comparable: true },
      { id: 2, weekly_unit: 'cans', weekly_use: '10', comparable: true },
    ];
    dispatchedRows = [{ product_id: 3, weekly_out: '25' }];
    const rows = await outlook();
    expect(rows.map((r) => r.name)).toEqual(['Pilchards', 'Maize meal', 'Peanut butter']);
  });

  it('counts only orders that are on their way and due within four weeks', async () => {
    recipeRows = [{ id: 1, weekly_unit: 'kg', weekly_use: '50', comparable: true }];
    await outlook();
    const call = poolMock.query.mock.calls.find(([sql]) => /FROM purchase_order_items/.test(sql));
    expect(call[1][0]).toEqual(['approved', 'in_transit', 'partially_received']);
    expect(call[0].replace(/\s+/g, ' ')).toContain('+ 28');
  });
});

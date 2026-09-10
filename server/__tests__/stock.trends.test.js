// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.trends.test.js
//
// The service layer of the sparkline feed: day validation and the
// reshaping of flat rows into one series per product.
//
// The repository is mocked. The SQL itself — the window over full
// history, the pre-window carry-in, the forward fill — was verified
// against a real Postgres 16 instance, which is the only thing that
// can prove a window function.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  getStockTrends:    vi.fn(),
  getManifest:       vi.fn(),
  getMovements:      vi.fn(),
  manualAdjust:      vi.fn(),
  getLedger:         vi.fn(),
  getLedgerSummary:  vi.fn(),
  getReconciliation: vi.fn(),
  getLedgerActors:   vi.fn(),
};

vi.mock('../src/repositories/stock.repository.js', () => ({ default: repoMock }));

const { default: stockService } = await import('../src/services/stock.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getStockTrends.mockResolvedValue([]);
});

describe('stockService.getStockTrends — validation', () => {
  it('defaults to a 30 day window', async () => {
    const res = await stockService.getStockTrends({});
    expect(repoMock.getStockTrends).toHaveBeenCalledWith({ days: 30 });
    expect(res.days).toBe(30);
  });

  it('accepts an explicit window', async () => {
    await stockService.getStockTrends({ days: '7' });
    expect(repoMock.getStockTrends).toHaveBeenCalledWith({ days: 7 });
  });

  it('rejects a window longer than the cap', async () => {
    await expect(stockService.getStockTrends({ days: '400' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a single-day window — one point is not a line', async () => {
    await expect(stockService.getStockTrends({ days: '1' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a non-integer window', async () => {
    await expect(stockService.getStockTrends({ days: '7.5' }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('stockService.getStockTrends — reshaping', () => {
  it('groups flat rows into one ordered series per product', async () => {
    repoMock.getStockTrends.mockResolvedValue([
      { product_id: 1, day: '2026-09-01', balance: '100' },
      { product_id: 1, day: '2026-09-02', balance: '90'  },
      { product_id: 2, day: '2026-09-01', balance: '300' },
      { product_id: 2, day: '2026-09-02', balance: '300' },
    ]);

    const res = await stockService.getStockTrends({});
    expect(res.series).toEqual({ 1: [100, 90], 2: [300, 300] });
  });

  it('casts NUMERIC strings to numbers', async () => {
    // node-postgres returns NUMERIC as a string. A series of strings
    // renders no line at all — Math.min over strings, and arithmetic
    // that concatenates.
    repoMock.getStockTrends.mockResolvedValue([
      { product_id: 1, day: '2026-09-01', balance: '12.5' },
      { product_id: 1, day: '2026-09-02', balance: '10' },
    ]);

    const res = await stockService.getStockTrends({});
    expect(res.series[1].every((n) => typeof n === 'number')).toBe(true);
    expect(res.series[1]).toEqual([12.5, 10]);
  });

  it('returns an empty map when nothing has ever moved', async () => {
    const res = await stockService.getStockTrends({});
    expect(res.series).toEqual({});
  });
});

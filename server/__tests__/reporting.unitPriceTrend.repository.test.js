// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.unitPriceTrend.repository.test.js
//
// Repository-level test for unitPriceTrend — the weighted-average
// price-per-unit metric, distinct from procurement_spend's total.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/reporting.repository.js');

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

beforeEach(() => vi.clearAllMocks());

describe('unitPriceTrend', () => {
  it('weights by quantity — SUM(spend)/SUM(quantity), not AVG(unit_price)', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ label: 'Maize meal 10kg', value: '45.20' }] });

    await repo.unitPriceTrend({ dimension: 'product', filters: {}, dateRange: RANGE });

    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/SUM\(dni\.received_quantity \* poi\.unit_price\)/);
    expect(sql).toMatch(/NULLIF\(SUM\(dni\.received_quantity\), 0\)/);
    expect(sql).not.toMatch(/AVG\(poi\.unit_price\)/);
  });

  it('excludes lines with no linked PO price', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.unitPriceTrend({ dimension: 'none', filters: {}, dateRange: RANGE });
    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/poi\.unit_price IS NOT NULL/);
  });

  it('applies the supplier_id filter', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.unitPriceTrend({ dimension: 'none', filters: { supplier_id: 7 }, dateRange: RANGE });
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/dn\.supplier_id = \$3/);
    expect(params).toContain(7);
  });
});

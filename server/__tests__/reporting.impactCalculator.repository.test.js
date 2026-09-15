// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.impactCalculator.repository.test.js
//
// Repository-level tests for the three Impact Calculator metrics
// added to reporting.repository.js: paperSaved, adultsReached,
// compostProcessed. No database — pool.query is mocked and each
// test asserts the SQL shape and parameter binding, the same
// approach reporting.catalog.test.js takes at the catalog level.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/reporting.repository.js');

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

beforeEach(() => vi.clearAllMocks());

describe('paperSaved', () => {
  it('unions delivery notes, collected dispatch events and decanting records', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ label: 'Total', value: '7' }] });

    const result = await repo.paperSaved({ dimension: 'none', dateRange: RANGE });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM delivery_notes/);
    expect(sql).toMatch(/FROM dispatch_events/);
    expect(sql).toMatch(/FROM decanting_records/);
    // Only collected dispatch events count as a note — a flagged
    // non-collection never produced anything to view or print.
    expect(sql).toMatch(/status = ANY\(\$3/);
    expect(sql).toMatch(/collected_at IS NOT NULL/);
    expect(params[2]).toEqual(['collected', 'late_collected']);
    expect(result).toEqual([{ label: 'Total', value: 7 }]);
  });

  it('buckets by month when asked', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.paperSaved({ dimension: 'month', dateRange: RANGE });
    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/GROUP BY to_char/);
  });

  it('rejects an unsupported dimension without querying', async () => {
    await expect(repo.paperSaved({ dimension: 'product', dateRange: RANGE }))
      .rejects.toThrow(/Unsupported dimension/);
    expect(poolMock.query).not.toHaveBeenCalled();
  });
});

describe('adultsReached', () => {
  it('forces the beneficiary_kind filter to soup_kitchen regardless of caller input', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ label: 'Total', value: '120' }] });

    await repo.adultsReached({
      dimension: 'none',
      dateRange: RANGE,
      filters: { beneficiary_kind: 'ecd' }, // an attempt to override — must lose
    });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/ps\.beneficiary_kind = \$\d+::beneficiary_type/);
    expect(params).toContain('soup_kitchen');
    expect(params).not.toContain('ecd');
  });

  it('does not apply the ECD+soup-kitchen impact clause — it is soup-kitchen only', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.adultsReached({ dimension: 'none', dateRange: RANGE, filters: {} });
    const [sql] = poolMock.query.mock.calls[0];
    // impactClause() pushes an ARRAY[...] parameter for ecd+soup_kitchen;
    // this metric filters by a single beneficiary_kind value instead.
    expect(sql).not.toMatch(/beneficiary_kind = ANY/);
  });
});

describe('compostProcessed', () => {
  it('sums kg_compost_returned for returned kits only', async () => {
    poolMock.query.mockResolvedValue({ rows: [{ label: 'Total', value: '16.5' }] });

    const result = await repo.compostProcessed({ dimension: 'none', dateRange: RANGE });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM collection_kits/);
    expect(sql).toMatch(/status = 'returned'/);
    expect(sql).toMatch(/SUM\(kg_compost_returned\)/);
    expect(params).toEqual([RANGE.from, RANGE.to]);
    expect(result).toEqual([{ label: 'Total', value: 16.5 }]);
  });

  it('rejects a dimension it does not support', async () => {
    await expect(repo.compostProcessed({ dimension: 'week', dateRange: RANGE }))
      .rejects.toThrow(/Unsupported dimension/);
  });
});

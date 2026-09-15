// ─────────────────────────────────────────────────────────────
// server/__tests__/reporting.tableNotReady.service.test.js
//
// reporting.service.js's runReport() should turn a Postgres 42P01
// (undefined_table) failure — e.g. compost_processed running before
// the collection_kits migration has been applied — into a clear 503,
// the same actionable-degradation treatment the missing-factor case
// already gets, rather than a raw 500 that reads as the feature being
// broken.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const repoMock = {
  compostProcessed: vi.fn(),
  getFactor: vi.fn(),
  countNonKgLines: vi.fn(),
};
vi.mock('../src/repositories/reporting.repository.js', () => ({ default: repoMock }));

const { default: service } = await import('../src/services/reporting.service.js');

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

beforeEach(() => vi.clearAllMocks());

describe('runReport: table not set up yet', () => {
  it('turns a 42P01 (undefined_table) error into a clear 503, not a 500', async () => {
    const pgError = new Error('relation "collection_kits" does not exist');
    pgError.code = '42P01';
    repoMock.compostProcessed.mockRejectedValue(pgError);

    await expect(
      service.runReport({ metric: 'compost_processed', dimension: 'none', dateRange: RANGE })
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/hasn't been set up yet|migration/i),
    });
  });

  it('re-throws any other repository error unchanged (a real bug still surfaces as one)', async () => {
    const boom = new Error('connection terminated unexpectedly');
    repoMock.compostProcessed.mockRejectedValue(boom);

    await expect(
      service.runReport({ metric: 'compost_processed', dimension: 'none', dateRange: RANGE })
    ).rejects.toThrow('connection terminated unexpectedly');
  });
});

// ─────────────────────────────────────────────────────────────
// server/__tests__/beneficiary.rollbackCohort.repository.test.js
//
// Repository-level test for rollbackCohort — the only write path in
// beneficiary.repository.js that opens a transaction and writes an
// audit row (updateBeneficiary's generic PATCH does neither). No
// database: pool.connect() is mocked and a fake client records every
// statement, the same approach collectionKit.repository.js's own
// tests use.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const makeClient = ({ onQuery } = {}) => {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (onQuery) return onQuery(sql, params);
      return { rows: [] };
    }),
    release: vi.fn(),
  };
};

let client;
const poolMock = { connect: vi.fn(async () => client) };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/beneficiary.repository.js');

beforeEach(() => vi.clearAllMocks());

describe('rollbackCohort', () => {
  it('flips week1 to week2', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^SELECT id, cohort/i.test(sql)) return { rows: [{ id: 6, cohort: 'week1' }] };
        if (/^UPDATE ecd_centres/i.test(sql)) return { rows: [{ id: 6, cohort: params[1] }] };
        return { rows: [] };
      },
    });

    const result = await repo.rollbackCohort(6, 3);

    expect(result).toEqual({ id: 6, cohort: 'week2' });
    const update = client.calls.find((c) => /^UPDATE ecd_centres/i.test(c.sql));
    expect(update.params).toEqual([6, 'week2']);
  });

  it('flips week2 to week1', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^SELECT id, cohort/i.test(sql)) return { rows: [{ id: 6, cohort: 'week2' }] };
        if (/^UPDATE ecd_centres/i.test(sql)) return { rows: [{ id: 6, cohort: params[1] }] };
        return { rows: [] };
      },
    });

    const result = await repo.rollbackCohort(6, 3);
    expect(result.cohort).toBe('week1');
  });

  it('locks the row with FOR UPDATE before flipping it', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^SELECT id, cohort/i.test(sql)) return { rows: [{ id: 6, cohort: 'week1' }] };
        if (/^UPDATE ecd_centres/i.test(sql)) return { rows: [{ id: 6, cohort: params[1] }] };
        return { rows: [] };
      },
    });

    await repo.rollbackCohort(6, 3);
    const select = client.calls.find((c) => /^SELECT id, cohort/i.test(c.sql));
    expect(select.sql).toMatch(/FOR UPDATE/);
  });

  it('writes an audit row recording the flip, unlike the generic update path', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^SELECT id, cohort/i.test(sql)) return { rows: [{ id: 6, cohort: 'week1' }] };
        if (/^UPDATE ecd_centres/i.test(sql)) return { rows: [{ id: 6, cohort: params[1] }] };
        return { rows: [] };
      },
    });

    await repo.rollbackCohort(6, 3);
    const audit = client.calls.find((c) => /INSERT INTO audit_log/i.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit.params).toContain('cohort_rollback');
    expect(audit.params).toContain(3);
  });

  it('rolls back and returns null when the beneficiary does not exist', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id, cohort/i.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    });

    const result = await repo.rollbackCohort(999, 3);

    expect(result).toBeNull();
    expect(client.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((c) => /^UPDATE ecd_centres/i.test(c.sql))).toBe(false);
  });

  it('rolls back and rethrows on a database error', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id, cohort/i.test(sql)) throw new Error('connection lost');
        return { rows: [] };
      },
    });

    await expect(repo.rollbackCohort(6, 3)).rejects.toThrow('connection lost');
    expect(client.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });
});

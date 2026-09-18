// ─────────────────────────────────────────────────────────────
// server/__tests__/collectionKit.repository.test.js
//
// collectionKit.repository.js had no repository-level test file
// before this — the transaction/lock/audit logic in logKitOut and
// markReturned was never exercised directly. Same fake-client-records-
// every-statement approach beneficiary.rollbackCohort.repository.test.js
// and purchaseOrder.setQuickbooksReference.repository.test.js use.
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

const { default: repo } = await import('../src/repositories/collectionKit.repository.js');

beforeEach(() => vi.clearAllMocks());

describe('logKitOut', () => {
  it('inserts a new "out" row when the label is not already out', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^SELECT id FROM collection_kits WHERE kit_label/i.test(sql)) return { rows: [] };
        if (/^INSERT INTO collection_kits/i.test(sql)) {
          return { rows: [{ id: 1, kit_label: params[0], status: 'out' }] };
        }
        return { rows: [] };
      },
    });

    const result = await repo.logKitOut({
      kitLabel: 'Bucket A1', location: null, dateOut: '2026-01-01',
      kgFoodWasteCollected: 10, notes: null, loggedBy: 5,
    });

    expect(result).toEqual({ ok: true, kit: { id: 1, kit_label: 'Bucket A1', status: 'out' } });
    const insert = client.calls.find((c) => /^INSERT INTO collection_kits/i.test(c.sql));
    expect(insert).toBeDefined();
  });

  it('locks the matching row and refuses a second "out" for the same label', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id FROM collection_kits WHERE kit_label/i.test(sql)) return { rows: [{ id: 3 }] };
        return { rows: [] };
      },
    });

    const result = await repo.logKitOut({
      kitLabel: 'Bucket A1', location: null, dateOut: '2026-01-01',
      kgFoodWasteCollected: 10, notes: null, loggedBy: 5,
    });

    expect(result).toEqual({ ok: false, code: 'already_out', kitId: 3 });
    expect(client.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((c) => /^INSERT INTO collection_kits/i.test(c.sql))).toBe(false);
    const select = client.calls.find((c) => /^SELECT id FROM collection_kits WHERE kit_label/i.test(c.sql));
    expect(select.sql).toMatch(/FOR UPDATE/);
  });

  it('writes an audit row on success', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^SELECT id FROM collection_kits WHERE kit_label/i.test(sql)) return { rows: [] };
        if (/^INSERT INTO collection_kits/i.test(sql)) return { rows: [{ id: 1, kit_label: params[0] }] };
        return { rows: [] };
      },
    });

    await repo.logKitOut({
      kitLabel: 'Bucket A1', location: null, dateOut: '2026-01-01',
      kgFoodWasteCollected: 10, notes: null, loggedBy: 5,
    });

    const audit = client.calls.find((c) => /INSERT INTO audit_log/i.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit.params).toContain('logged_out');
  });
});

describe('markReturned', () => {
  it('returns kit_not_found and rolls back when the id does not exist', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id, status FROM collection_kits/i.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    });

    const result = await repo.markReturned({ id: 999, kgCompostReturned: 5, actorId: 5 });
    expect(result).toEqual({ ok: false, code: 'kit_not_found' });
    expect(client.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
  });

  it('returns already_returned and rolls back without a second write', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id, status FROM collection_kits/i.test(sql)) return { rows: [{ id: 1, status: 'returned' }] };
        return { rows: [] };
      },
    });

    const result = await repo.markReturned({ id: 1, kgCompostReturned: 5, actorId: 5 });
    expect(result).toEqual({ ok: false, code: 'already_returned' });
    expect(client.calls.some((c) => /^UPDATE collection_kits/i.test(c.sql))).toBe(false);
  });

  it('sets status, returned_at and kg_compost_returned together, plus an audit row', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^SELECT id, status FROM collection_kits/i.test(sql)) return { rows: [{ id: 1, status: 'out' }] };
        if (/^UPDATE collection_kits/i.test(sql)) {
          return { rows: [{ id: 1, status: 'returned', kg_compost_returned: params[1] }] };
        }
        return { rows: [] };
      },
    });

    const result = await repo.markReturned({ id: 1, kgCompostReturned: 8.5, actorId: 5 });

    expect(result.ok).toBe(true);
    expect(result.kit).toEqual({ id: 1, status: 'returned', kg_compost_returned: 8.5 });
    const audit = client.calls.find((c) => /INSERT INTO audit_log/i.test(c.sql));
    expect(audit.params).toContain('returned');
  });
});

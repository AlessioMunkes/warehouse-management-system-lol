// ─────────────────────────────────────────────────────────────
// server/__tests__/collectionKit.repository.test.js
//
// Repository-level tests for Feed the Soil kit tracking: assigning a
// kit, logging a compost weigh-in, marking a record dispatched, and
// the ordering rule every record list shares (not-yet-dispatched
// first, dispatched at the bottom, newest first within each group).
// Same fake-client-records-every-statement approach
// beneficiary.rollbackCohort.repository.test.js uses.
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
const poolMock = { connect: vi.fn(async () => client), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/collectionKit.repository.js');

beforeEach(() => vi.clearAllMocks());

describe('createKit', () => {
  it('inserts the kit and writes an "assigned" audit row', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^INSERT INTO collection_kits/i.test(sql)) {
          return { rows: [{ id: 1, owner_name: params[0], suburb: params[1] }] };
        }
        return { rows: [] };
      },
    });

    const kit = await repo.createKit({ ownerName: 'Jane M.', suburb: 'Delft', assignedAt: '2026-09-01', actorId: 5 });

    expect(kit).toEqual({ id: 1, owner_name: 'Jane M.', suburb: 'Delft' });
    const audit = client.calls.find((c) => /INSERT INTO audit_log/i.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit.params).toContain('assigned');
  });
});

describe('logCompost', () => {
  it('returns kit_not_found and rolls back when the kit does not exist', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id FROM collection_kits/i.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    });

    const result = await repo.logCompost({ kitId: 999, kgCompost: 5, loggedAt: '2026-09-01', notes: null, actorId: 5 });

    expect(result).toEqual({ ok: false, code: 'kit_not_found' });
    expect(client.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((c) => /^INSERT INTO collection_kit_records/i.test(c.sql))).toBe(false);
  });

  it('inserts a "logged" record and writes an audit row', async () => {
    client = makeClient({
      onQuery: (sql, params) => {
        if (/^SELECT id FROM collection_kits/i.test(sql)) return { rows: [{ id: 1 }] };
        if (/^INSERT INTO collection_kit_records/i.test(sql)) {
          return { rows: [{ id: 10, kit_id: params[0], kg_compost: params[1], status: 'logged' }] };
        }
        return { rows: [] };
      },
    });

    const result = await repo.logCompost({ kitId: 1, kgCompost: 7.5, loggedAt: '2026-09-01', notes: null, actorId: 5 });

    expect(result).toEqual({ ok: true, record: { id: 10, kit_id: 1, kg_compost: 7.5, status: 'logged' } });
    const audit = client.calls.find((c) => /INSERT INTO audit_log/i.test(c.sql));
    expect(audit.params).toContain('logged');
  });
});

describe('markDispatched', () => {
  it('returns record_not_found and rolls back when the record does not exist', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id, status FROM collection_kit_records/i.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    });

    const result = await repo.markDispatched({ recordId: 999, actorId: 5 });
    expect(result).toEqual({ ok: false, code: 'record_not_found' });
    expect(client.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
  });

  it('returns already_dispatched without a second write', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id, status FROM collection_kit_records/i.test(sql)) return { rows: [{ id: 10, status: 'dispatched' }] };
        return { rows: [] };
      },
    });

    const result = await repo.markDispatched({ recordId: 10, actorId: 5 });
    expect(result).toEqual({ ok: false, code: 'already_dispatched' });
    expect(client.calls.some((c) => /^UPDATE collection_kit_records/i.test(c.sql))).toBe(false);
  });

  it('sets status and dispatched_at, and writes an audit row', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id, status FROM collection_kit_records/i.test(sql)) return { rows: [{ id: 10, status: 'logged' }] };
        if (/^UPDATE collection_kit_records/i.test(sql)) {
          return { rows: [{ id: 10, status: 'dispatched' }] };
        }
        return { rows: [] };
      },
    });

    const result = await repo.markDispatched({ recordId: 10, actorId: 5 });
    expect(result).toEqual({ ok: true, record: { id: 10, status: 'dispatched' } });
    const update = client.calls.find((c) => /^UPDATE collection_kit_records/i.test(c.sql));
    expect(update.sql).toMatch(/dispatched_at = NOW\(\)/);
    const audit = client.calls.find((c) => /INSERT INTO audit_log/i.test(c.sql));
    expect(audit.params).toContain('dispatched');
  });

  it('locks the record row before reading its status', async () => {
    client = makeClient({
      onQuery: (sql) => {
        if (/^SELECT id, status FROM collection_kit_records/i.test(sql)) return { rows: [{ id: 10, status: 'logged' }] };
        if (/^UPDATE collection_kit_records/i.test(sql)) return { rows: [{ id: 10, status: 'dispatched' }] };
        return { rows: [] };
      },
    });

    await repo.markDispatched({ recordId: 10, actorId: 5 });
    const select = client.calls.find((c) => /^SELECT id, status FROM collection_kit_records/i.test(c.sql));
    expect(select.sql).toMatch(/FOR UPDATE/);
  });
});

describe('listKits', () => {
  it('orders kits with a dispatched-only history to the bottom, like listRecords', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.listKits({});
    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/= 'dispatched'\) ASC/);
  });

  it('searches owner_name and suburb', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.listKits({ search: 'Delft' });
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/owner_name ILIKE|suburb ILIKE/);
    expect(params[0]).toBe('%Delft%');
  });
});

describe('listRecords', () => {
  it('orders not-yet-dispatched records before dispatched ones', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.listRecords({});
    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/status = 'dispatched'\) ASC/);
  });

  it('joins the owning kit for owner_name and suburb', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.listRecords({});
    const [sql] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/JOIN collection_kits k ON k\.id = r\.kit_id/);
  });

  it('filters by status when given one', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });
    await repo.listRecords({ status: 'dispatched' });
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/r\.status = \$1/);
    expect(params[0]).toBe('dispatched');
  });
});

describe('getKitById', () => {
  it('returns null when the kit does not exist', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });
    await expect(repo.getKitById(999)).resolves.toBeNull();
  });

  it('derives status "assigned" when the kit has no records', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id: 1, owner_name: 'Jane M.', status: 'assigned' }] })
      .mockResolvedValueOnce({ rows: [] });

    const kit = await repo.getKitById(1);
    expect(kit.status).toBe('assigned');
    expect(kit.records).toEqual([]);
  });

  it('orders the kit\'s own record history the same way listRecords does', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'logged' }] })
      .mockResolvedValueOnce({ rows: [] });

    await repo.getKitById(1);
    const [historySql] = poolMock.query.mock.calls[1];
    expect(historySql).toMatch(/status = 'dispatched'\) ASC/);
  });
});

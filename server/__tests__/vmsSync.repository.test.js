// ─────────────────────────────────────────────────────────────
// server/__tests__/vmsSync.repository.test.js
//
// Repository-level tests for vmsSync.repository.
// No database. The pool is mocked and each method accepts an
// optional client, so a fake client that records statements is
// enough to prove the SQL shape, the parameter binding and the
// optional-client behaviour.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: vmsSyncRepository } =
  await import('../src/repositories/vmsSync.repository.js');

const {
  createSyncRecord,
  findById,
  findByEntity,
  findPending,
  findFailed,
  updateSyncStatus,
  upsertSyncRecord,
} = vmsSyncRepository;

const CREATED_ROW = {
  sync_id: '11111111-1111-1111-1111-111111111111',
  entity_type: 'EVENT',
  entity_id: '22222222-2222-2222-2222-222222222222',
  external_id: 'VMS-EVT-100',
  sync_status: 'PENDING',
  last_attempt_at: null,
  last_success_at: null,
  error_message: null,
  created_at: '2026-09-08T10:00:00Z',
  updated_at: '2026-09-08T10:00:00Z',
};

// Fake client that records every statement + params and answers
// the way the database would for the given SQL.
const makeClient = ({ onQuery } = {}) => {
  const calls = [];
  const client = {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (onQuery) return onQuery(sql, params);
      return { rows: [] };
    }),
  };
  return client;
};

const sqlOf = (client) => client.calls.map((c) => c.sql);
const findCall = (client, re) => client.calls.find((c) => re.test(c.sql));

beforeEach(() => vi.clearAllMocks());

// ── createSyncRecord ──────────────────────────────────────────
describe('createSyncRecord', () => {
  it('inserts the sync record and returns the created row using the supplied client', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await createSyncRecord(
      {
        entityType: 'EVENT',
        entityId: '22222222-2222-2222-2222-222222222222',
        externalId: 'VMS-EVT-100',
        syncStatus: 'PENDING',
      },
      client
    );

    expect(result).toEqual(CREATED_ROW);

    const insert = findCall(client, /^INSERT INTO public\.vms_sync/i);
    expect(insert).toBeDefined();
    expect(insert.sql).toContain('entity_type, entity_id, external_id, sync_status');
    expect(insert.sql).toContain('RETURNING');
    expect(insert.params).toEqual([
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
      'VMS-EVT-100',
      'PENDING',
      null,
      null,
      null,
    ]);
    expect(client.calls).toHaveLength(1);
  });

  it('uses the shared pool when no client is supplied', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [CREATED_ROW] });

    const result = await createSyncRecord({
      entityType: 'TIMESLOT',
      entityId: '33333333-3333-3333-3333-333333333333',
      syncStatus: 'PENDING',
    });

    expect(result).toEqual(CREATED_ROW);
    expect(poolMock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO public\.vms_sync/i);
    expect(params).toEqual([
      'TIMESLOT',
      '33333333-3333-3333-3333-333333333333',
      null,
      'PENDING',
      null,
      null,
      null,
    ]);
  });
});

// ── findById ──────────────────────────────────────────────────
describe('findById', () => {
  it('selects the sync record by sync_id', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findById('11111111-1111-1111-1111-111111111111', client);

    expect(result).toEqual(CREATED_ROW);
    const select = findCall(client, /^SELECT.*FROM public\.vms_sync/i);
    expect(select.sql).toContain('WHERE sync_id = $1');
    expect(select.params).toEqual(['11111111-1111-1111-1111-111111111111']);
  });

  it('returns null when no record matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await findById('99999999-9999-9999-9999-999999999999', client);

    expect(result).toBeNull();
  });
});

// ── findPending ───────────────────────────────────────────────
describe('findPending', () => {
  it('selects pending sync records with no limit', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findPending({}, client);

    expect(result).toEqual([CREATED_ROW]);
    const select = findCall(client, /^SELECT.*FROM public\.vms_sync/i);
    expect(select.sql).toContain("sync_status = 'PENDING'");
    expect(select.sql).toContain('ORDER BY created_at ASC');
    expect(select.sql).not.toContain('LIMIT');
  });

  it('applies a limit when provided', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await findPending({ limit: 10 }, client);

    const select = findCall(client, /^SELECT.*FROM public\.vms_sync/i);
    expect(select.sql).toContain('LIMIT $1');
    expect(select.params).toEqual([10]);
  });
});

// ── findFailed ────────────────────────────────────────────────
describe('findFailed', () => {
  it('selects failed sync records with no limit', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findFailed({}, client);

    expect(result).toEqual([CREATED_ROW]);
    const select = findCall(client, /^SELECT.*FROM public\.vms_sync/i);
    expect(select.sql).toContain("sync_status = 'FAILED'");
    expect(select.sql).toContain('ORDER BY created_at ASC');
    expect(select.sql).not.toContain('LIMIT');
  });

  it('applies a limit when provided', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await findFailed({ limit: 5 }, client);

    const select = findCall(client, /^SELECT.*FROM public\.vms_sync/i);
    expect(select.sql).toContain('LIMIT $1');
    expect(select.params).toEqual([5]);
  });
});

// ── updateSyncStatus ──────────────────────────────────────────
describe('updateSyncStatus', () => {
  const UPDATED_ROW = {
    ...CREATED_ROW,
    sync_status: 'SYNCED',
    last_attempt_at: '2026-09-08T11:00:00Z',
    last_success_at: '2026-09-08T11:00:00Z',
  };

  it('updates sync status fields and sets updated_at', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [UPDATED_ROW] }) });

    const result = await updateSyncStatus(
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
      {
        syncStatus: 'SYNCED',
        lastAttemptAt: '2026-09-08T11:00:00Z',
        lastSuccessAt: '2026-09-08T11:00:00Z',
      },
      client
    );

    expect(result).toEqual(UPDATED_ROW);
    const update = findCall(client, /^UPDATE public\.vms_sync/i);
    expect(update.sql).toContain('SET sync_status = $1, last_attempt_at = $2, last_success_at = $3, updated_at = NOW()');
    expect(update.sql).toContain('WHERE entity_type = $4 AND entity_id = $5');
    expect(update.params).toEqual([
      'SYNCED',
      '2026-09-08T11:00:00Z',
      '2026-09-08T11:00:00Z',
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('never lets immutable fields reach the SET clause', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateSyncStatus(
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
      {
        syncStatus: 'FAILED',
        errorMessage: 'timeout',
        entityType: 'TIMESLOT',
        entityId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        createdAt: '2020-01-01T00:00:00Z',
      },
      client
    );

    const update = findCall(client, /^UPDATE public\.vms_sync/i);
    expect(update.sql).toContain('SET sync_status = $1, error_message = $2');
    // Inspect only the SET clause; immutable fields legitimately appear in WHERE.
    const setClause = update.sql.split('SET')[1].split('WHERE')[0];
    expect(setClause).not.toMatch(/\bentity_type\s*=/i);
    expect(setClause).not.toMatch(/\bentity_id\s*=/i);
    expect(setClause).not.toMatch(/\bcreated_at\s*=/i);
  });

  it('returns null when no row matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await updateSyncStatus(
      'EVENT',
      '99999999-9999-9999-9999-999999999999',
      { syncStatus: 'FAILED' },
      client
    );

    expect(result).toBeNull();
  });

  it('falls back to a read when changes contain no updatable fields', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await updateSyncStatus(
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
      { entityType: 'TIMESLOT' },
      client
    );

    expect(result).toEqual(CREATED_ROW);
    expect(sqlOf(client).some((s) => /^UPDATE public\.vms_sync/i.test(s))).toBe(false);
    expect(findCall(client, /^SELECT/i)).toBeDefined();
  });
});

// ── upsertSyncRecord ──────────────────────────────────────────
describe('upsertSyncRecord', () => {
  it('inserts a new sync record and returns it', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await upsertSyncRecord(
      {
        entityType: 'EVENT',
        entityId: '22222222-2222-2222-2222-222222222222',
        externalId: 'VMS-EVT-100',
        syncStatus: 'PENDING',
      },
      client
    );

    expect(result).toEqual(CREATED_ROW);
    const insert = findCall(client, /^INSERT INTO public\.vms_sync/i);
    expect(insert.sql).toContain('ON CONFLICT (entity_type, entity_id) DO UPDATE SET');
    expect(insert.sql).toContain('external_id = EXCLUDED.external_id');
    expect(insert.sql).toContain('sync_status = EXCLUDED.sync_status');
    expect(insert.sql).toContain('updated_at = NOW()');
    expect(insert.params).toEqual([
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
      'VMS-EVT-100',
      'PENDING',
      null,
      null,
      null,
    ]);
  });

  it('updates the existing row on conflicting entity', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await upsertSyncRecord(
      {
        entityType: 'EVENT',
        entityId: '22222222-2222-2222-2222-222222222222',
        syncStatus: 'SYNCED',
        lastAttemptAt: '2026-09-08T11:00:00Z',
        lastSuccessAt: '2026-09-08T11:00:00Z',
      },
      client
    );

    const insert = findCall(client, /^INSERT INTO public\.vms_sync/i);
    expect(insert.sql).toContain('ON CONFLICT (entity_type, entity_id) DO UPDATE SET');
    expect(insert.params).toEqual([
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
      null,
      'SYNCED',
      '2026-09-08T11:00:00Z',
      '2026-09-08T11:00:00Z',
      null,
    ]);
  });

  it('uses the shared pool when no client is supplied', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [CREATED_ROW] });

    const result = await upsertSyncRecord({
      entityType: 'TIMESLOT',
      entityId: '33333333-3333-3333-3333-333333333333',
      syncStatus: 'PENDING',
    });

    expect(result).toEqual(CREATED_ROW);
    expect(poolMock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO public\.vms_sync/i);
    expect(sql).toContain('ON CONFLICT (entity_type, entity_id) DO UPDATE SET');
    expect(params).toEqual([
      'TIMESLOT',
      '33333333-3333-3333-3333-333333333333',
      null,
      'PENDING',
      null,
      null,
      null,
    ]);
  });
});

// ── DB error propagation ──────────────────────────────────────
describe('DB error propagation', () => {
  it('propagates unexpected errors from createSyncRecord', async () => {
    const client = makeClient();
    client.query.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      createSyncRecord(
        { entityType: 'EVENT', entityId: '22222222-2222-2222-2222-222222222222', syncStatus: 'PENDING' },
        client
      )
    ).rejects.toThrow('connection lost');
  });

  it('propagates unexpected errors from updateSyncStatus', async () => {
    const client = makeClient();
    client.query.mockRejectedValueOnce(new Error('deadlock'));

    await expect(
      updateSyncStatus(
        'EVENT',
        '22222222-2222-2222-2222-222222222222',
        { syncStatus: 'FAILED' },
        client
      )
    ).rejects.toThrow('deadlock');
  });
});

// ── findByEntity ──────────────────────────────────────────────
describe('findByEntity', () => {
  it('selects the sync record by entity_type and entity_id', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findByEntity(
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
      client
    );

    expect(result).toEqual(CREATED_ROW);
    const select = findCall(client, /^SELECT.*FROM public\.vms_sync/i);
    expect(select.sql).toContain('WHERE entity_type = $1 AND entity_id = $2');
    expect(select.params).toEqual([
      'EVENT',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('returns null when no record matches the entity', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await findByEntity(
      'TIMESLOT',
      '99999999-9999-9999-9999-999999999999',
      client
    );

    expect(result).toBeNull();
  });
});
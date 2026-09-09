// ─────────────────────────────────────────────────────────────
// server/__tests__/eventSpace.repository.test.js
//
// Repository-level tests for eventSpace.repository.
// No database. The pool is mocked and each method accepts an
// optional client, so a fake client that records statements is
// enough to prove the SQL shape, the parameter binding and the
// optional-client behaviour.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: eventSpaceRepository } =
  await import('../src/repositories/eventSpace.repository.js');

const { createSpace, findById, findAll, updateSpace } = eventSpaceRepository;

const CREATED_ROW = {
  space_id: '22222222-2222-2222-2222-222222222222',
  space_name: 'Main Warehouse Hall',
  description: 'Large open area',
  location: 'Building A',
  is_active: true,
  created_at: '2026-09-08T10:00:00Z',
  updated_at: '2026-09-08T10:00:00Z',
};

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

// ── createSpace ───────────────────────────────────────────────
describe('createSpace', () => {
  it('inserts the space and returns the created row using the supplied client', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await createSpace(
      {
        spaceName: 'Main Warehouse Hall',
        description: 'Large open area',
        location: 'Building A',
        is_active: true,
      },
      client
    );

    expect(result).toEqual(CREATED_ROW);

    const insert = findCall(client, /^INSERT INTO public\.event_spaces/i);
    expect(insert).toBeDefined();
    expect(insert.sql).toContain('space_name, description, location, is_active');
    expect(insert.sql).toContain('RETURNING');
    expect(insert.params).toEqual(['Main Warehouse Hall', 'Large open area', 'Building A', true]);
    expect(client.calls).toHaveLength(1);
  });

  it('uses the shared pool when no client is supplied', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [CREATED_ROW] });

    const result = await createSpace({
      spaceName: 'Main Warehouse Hall',
      description: 'Large open area',
      location: 'Building A',
      is_active: true,
    });

    expect(result).toEqual(CREATED_ROW);
    expect(poolMock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO public\.event_spaces/i);
    expect(params).toEqual(['Main Warehouse Hall', 'Large open area', 'Building A', true]);
  });
});
// ── findAll ───────────────────────────────────────────────────
describe('findAll', () => {
  it('returns all spaces with no filters', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findAll({}, client);

    expect(result).toEqual([CREATED_ROW]);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).not.toContain('WHERE');
    expect(select.sql).toContain('ORDER BY space_name ASC, created_at ASC');
    expect(select.params).toEqual([]);
  });

  it('filters by isActive when provided', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await findAll({ isActive: false }, client);

    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE is_active = $1');
    expect(select.params).toEqual([false]);
  });
});

// ── updateSpace ───────────────────────────────────────────────
describe('updateSpace', () => {
  it('updates a single field', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateSpace('22222222-2222-2222-2222-222222222222', { spaceName: 'Renamed Hall' }, client);

    const update = findCall(client, /^UPDATE public\.event_spaces/i);
    expect(update.sql).toContain('SET space_name = $1, updated_at = NOW()');
    expect(update.sql).toContain('WHERE space_id = $2');
    expect(update.params).toEqual(['Renamed Hall', '22222222-2222-2222-2222-222222222222']);
  });

  it('updates multiple fields', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateSpace(
      '22222222-2222-2222-2222-222222222222',
      { description: 'Updated', location: 'Building B', isActive: false },
      client
    );

    const update = findCall(client, /^UPDATE public\.event_spaces/i);
    expect(update.sql).toContain('SET description = $1, location = $2, is_active = $3, updated_at = NOW()');
    expect(update.params).toEqual(['Updated', 'Building B', false, '22222222-2222-2222-2222-222222222222']);
  });

  it('never lets immutable fields reach the SET clause', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateSpace(
      '22222222-2222-2222-2222-222222222222',
      { spaceName: 'New Name', spaceId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', createdAt: '2020-01-01T00:00:00Z' },
      client
    );

    const update = findCall(client, /^UPDATE public\.event_spaces/i);
    expect(update.sql).toContain('SET space_name = $1');
    // Inspect only the SET clause; immutable fields legitimately appear in WHERE.
    const setClause = update.sql.split('SET')[1].split('WHERE')[0];
    expect(setClause).not.toMatch(/\bspace_id\s*=/i);
    expect(setClause).not.toMatch(/\bcreated_at\s*=/i);
  });

  it('returns null when no row matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await updateSpace('99999999-9999-9999-9999-999999999999', { spaceName: 'X' }, client);

    expect(result).toBeNull();
  });

  it('falls back to a read when changes contain no updatable fields', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await updateSpace('22222222-2222-2222-2222-222222222222', { spaceId: 'x' }, client);

    expect(result).toEqual(CREATED_ROW);
    expect(sqlOf(client).some((s) => /^UPDATE public\.event_spaces/i.test(s))).toBe(false);
  });

  it('propagates unexpected DB errors', async () => {
    const client = makeClient();
    client.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      updateSpace('22222222-2222-2222-2222-222222222222', { spaceName: 'X' }, client)
    ).rejects.toThrow('DB error');
  });
});

// ── findById ──────────────────────────────────────────────────
describe('findById', () => {
  it('selects the space by id', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findById('22222222-2222-2222-2222-222222222222', client);

    expect(result).toEqual(CREATED_ROW);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE space_id = $1');
    expect(select.params).toEqual(['22222222-2222-2222-2222-222222222222']);
  });

  it('returns null when no row matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await findById('99999999-9999-9999-9999-999999999999', client);

    expect(result).toBeNull();
  });
});
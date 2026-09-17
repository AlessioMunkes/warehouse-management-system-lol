// ─────────────────────────────────────────────────────────────
// server/__tests__/loveActivismEvent.repository.test.js
//
// Repository-level tests for loveActivismEvent.repository.
// No database. The pool is mocked and each method accepts an
// optional client, so a fake client that records statements is
// enough to prove the SQL shape, the parameter binding and the
// optional-client behaviour.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: loveActivismEventRepository } =
  await import('../src/repositories/loveActivismEvent.repository.js');

const { createEvent, findById, findAll, updateEvent } = loveActivismEventRepository;

const CREATED_ROW = {
  event_id: '11111111-1111-1111-1111-111111111111',
  event_name: 'Warehouse Food Drive',
  description: null,
  event_date: '2026-10-01',
  status: 'DRAFT',
  created_by: 5,
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

// ── createEvent ───────────────────────────────────────────────
describe('createEvent', () => {
  it('inserts the event and returns the created row using the supplied client', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await createEvent(
      {
        eventName: 'Warehouse Food Drive',
        description: null,
        eventDate: '2026-10-01',
        venueName: 'Warehouse',
        address: 'Cape Town',
        status: 'DRAFT',
        createdBy: 5,
      },
      client
    );

    expect(result).toEqual(CREATED_ROW);

    const insert = findCall(client, /^INSERT INTO public\.love_activism_events/i);
    expect(insert).toBeDefined();
    expect(insert.sql).toContain('event_name, description, event_date, venue_name, address, status, created_by');
    expect(insert.sql).toContain('RETURNING');
    expect(insert.params).toEqual(['Warehouse Food Drive', null, '2026-10-01', 'Warehouse', 'Cape Town', 'DRAFT', 5]);
    expect(client.calls).toHaveLength(1);
  });

  it('uses the shared pool when no client is supplied', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [CREATED_ROW] });

    const result = await createEvent({
      eventName: 'Warehouse Food Drive',
      description: null,
      eventDate: '2026-10-01',
      venueName: 'Warehouse',
      address: 'Cape Town',
      status: 'DRAFT',
      createdBy: 5,
    });

    expect(result).toEqual(CREATED_ROW);
    expect(poolMock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO public\.love_activism_events/i);
    expect(params).toEqual(['Warehouse Food Drive', null, '2026-10-01', 'Warehouse', 'Cape Town', 'DRAFT', 5]);
  });
});

// ── findById ──────────────────────────────────────────────────
describe('findById', () => {
  it('selects by event_id and returns the row', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findById('11111111-1111-1111-1111-111111111111', client);

    expect(result).toEqual(CREATED_ROW);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('FROM public.love_activism_events');
    expect(select.sql).toContain('WHERE event_id = $1');
    expect(select.params).toEqual(['11111111-1111-1111-1111-111111111111']);
  });

  it('returns null when no event matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await findById('99999999-9999-9999-9999-999999999999', client);

    expect(result).toBeNull();
  });
});
// ── findAll ───────────────────────────────────────────────────
describe('findAll', () => {
  it('returns all events with no filters and a deterministic order', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findAll({}, client);

    expect(result).toEqual([CREATED_ROW]);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).not.toContain('WHERE');
    expect(select.sql).toContain('ORDER BY event_date ASC, created_at ASC');
    expect(select.params).toEqual([]);
  });

  it('filters by status with a parameterised value', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await findAll({ status: 'SCHEDULED' }, client);

    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE status = $1');
    expect(select.params).toEqual(['SCHEDULED']);
  });

  it('filters by event date with a parameterised value', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await findAll({ eventDate: '2026-10-01' }, client);

    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE event_date = $1');
    expect(select.params).toEqual(['2026-10-01']);
  });

  it('combines status and event-date filters with an AND', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await findAll({ status: 'PUBLISHED', eventDate: '2026-10-01' }, client);

    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE status = $1 AND event_date = $2');
    expect(select.params).toEqual(['PUBLISHED', '2026-10-01']);
  });
});
// ── updateEvent ───────────────────────────────────────────────
describe('updateEvent', () => {
  it('updates a single supported field and returns the updated row', async () => {
    const client = makeClient({
      onQuery: () => ({ rows: [{ ...CREATED_ROW, status: 'PUBLISHED' }] }),
    });

    const result = await updateEvent(
      '11111111-1111-1111-1111-111111111111',
      { status: 'PUBLISHED' },
      client
    );

    expect(result.status).toBe('PUBLISHED');
    const update = findCall(client, /^UPDATE public\.love_activism_events/i);
    expect(update.sql).toContain('SET status = $1, updated_at = NOW()');
    expect(update.sql).toContain('WHERE event_id = $2');
    expect(update.params).toEqual(['PUBLISHED', '11111111-1111-1111-1111-111111111111']);
  });

  it('updates multiple fields in one statement', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateEvent(
      '11111111-1111-1111-1111-111111111111',
      { eventName: 'Renamed Drive', eventDate: '2026-11-15', status: 'SCHEDULED' },
      client
    );

    const update = findCall(client, /^UPDATE public\.love_activism_events/i);
    expect(update.sql).toContain('SET event_name = $1, event_date = $2, status = $3');
    expect(update.sql).toContain('updated_at = NOW()');
    expect(update.params).toEqual([
      'Renamed Drive',
      '2026-11-15',
      'SCHEDULED',
      '11111111-1111-1111-1111-111111111111',
    ]);
  });

  it('sets updated_at in SQL rather than accepting it as a client value', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateEvent(
      '11111111-1111-1111-1111-111111111111',
      { description: 'Updated notes', updatedAt: '2026-01-01T00:00:00Z' },
      client
    );

    const update = findCall(client, /^UPDATE public\.love_activism_events/i);
    expect(update.sql).toContain('updated_at = NOW()');
    // A client-supplied updatedAt must not become a bound value.
    expect(update.params).not.toContain('2026-01-01T00:00:00Z');
    expect(update.params).toEqual(['Updated notes', '11111111-1111-1111-1111-111111111111']);
  });

  it('never lets immutable fields reach the SET clause', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateEvent(
      '11111111-1111-1111-1111-111111111111',
      {
        status: 'CANCELLED',
        eventId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        createdBy: 99,
        createdAt: '2020-01-01T00:00:00Z',
      },
      client
    );

    const update = findCall(client, /^UPDATE public\.love_activism_events/i);
    expect(update.sql).toContain('SET status = $1');
    // Inspect only the SET clause; immutable fields legitimately appear in WHERE.
    const setClause = update.sql.split('SET')[1].split('WHERE')[0];
    expect(setClause).not.toMatch(/\bevent_id\s*=/i);
    expect(setClause).not.toMatch(/\bcreated_by\s*=/i);
    expect(setClause).not.toMatch(/\bcreated_at\s*=/i);
    expect(update.params).toEqual(['CANCELLED', '11111111-1111-1111-1111-111111111111']);
  });

  it('returns null when no row matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await updateEvent(
      '99999999-9999-9999-9999-999999999999',
      { status: 'CANCELLED' },
      client
    );

    expect(result).toBeNull();
  });

  it('falls back to a read when changes contain no updatable fields', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await updateEvent(
      '11111111-1111-1111-1111-111111111111',
      { eventId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
      client
    );

    expect(result).toEqual(CREATED_ROW);
    expect(sqlOf(client).some((s) => /^UPDATE public\.love_activism_events/i.test(s))).toBe(false);
    expect(findCall(client, /^SELECT/i)).toBeDefined();
  });
});

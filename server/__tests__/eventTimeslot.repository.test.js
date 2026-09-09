// ─────────────────────────────────────────────────────────────
// server/__tests__/eventTimeslot.repository.test.js
//
// Repository-level tests for eventTimeslot.repository.
// No database. The pool is mocked and each method accepts an
// optional client, so a fake client that records statements is
// enough to prove the SQL shape, the parameter binding and the
// optional-client behaviour.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: eventTimeslotRepository } =
  await import('../src/repositories/eventTimeslot.repository.js');

const {
  createTimeslot,
  findById,
  findByEventId,
  findByEventAndSpace,
  updateTimeslot,
  findPotentialOverlaps,
} = eventTimeslotRepository;

const CREATED_ROW = {
  timeslot_id: '33333333-3333-3333-3333-333333333333',
  event_id: '11111111-1111-1111-1111-111111111111',
  space_id: '22222222-2222-2222-2222-222222222222',
  start_time: '2026-09-10T09:00:00Z',
  end_time: '2026-09-10T11:00:00Z',
  capacity: 20,
  status: 'OPEN',
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

// ── findById ──────────────────────────────────────────────────
describe('findById', () => {
  it('selects the timeslot by id', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findById('33333333-3333-3333-3333-333333333333', client);

    expect(result).toEqual(CREATED_ROW);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE timeslot_id = $1');
    expect(select.params).toEqual(['33333333-3333-3333-3333-333333333333']);
  });

  it('returns null when no row matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await findById('99999999-9999-9999-9999-999999999999', client);

    expect(result).toBeNull();
  });
});

// ── findByEventId ─────────────────────────────────────────────
describe('findByEventId', () => {
  it('selects timeslots for an event', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findByEventId('11111111-1111-1111-1111-111111111111', client);

    expect(result).toEqual([CREATED_ROW]);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE event_id = $1');
    expect(select.sql).toContain('ORDER BY start_time ASC, created_at ASC');
    expect(select.params).toEqual(['11111111-1111-1111-1111-111111111111']);
  });
});

// ── findByEventAndSpace ───────────────────────────────────────
describe('findByEventAndSpace', () => {
  it('selects timeslots for a specific event + space', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findByEventAndSpace(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      client
    );

    expect(result).toEqual([CREATED_ROW]);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE event_id = $1 AND space_id = $2');
    expect(select.params).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });
});


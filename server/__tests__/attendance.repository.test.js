// ─────────────────────────────────────────────────────────────
// server/__tests__/attendance.repository.test.js
//
// Repository-level tests for attendance.repository.
// No database. The pool is mocked and each method accepts an
// optional client, so a fake client that records statements is
// enough to prove the SQL shape, the parameter binding and the
// optional-client behaviour.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: attendanceRepository } =
  await import('../src/repositories/attendance.repository.js');

const {
  createAttendance,
  findById,
  findByBookingId,
  updateAttendance,
  upsertByBookingId,
  countCheckedInByTimeslot,
} = attendanceRepository;

const CREATED_ROW = {
  attendance_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  booking_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  checked_in: false,
  check_in_time: null,
  source: 'WMS',
  last_synced_at: null,
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

// ── createAttendance ───────────────────────────────────────────
describe('createAttendance', () => {
  it('inserts attendance and returns the created row using the supplied client', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await createAttendance(
      {
        bookingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        checkedIn: false,
        checkInTime: null,
        source: 'WMS',
        lastSyncedAt: null,
      },
      client
    );

    expect(result).toEqual(CREATED_ROW);

    const insert = findCall(client, /^INSERT INTO public\.attendance/i);
    expect(insert).toBeDefined();
    expect(insert.sql).toContain('booking_id, checked_in, check_in_time, source, last_synced_at');
    expect(insert.sql).toContain('RETURNING');
    expect(insert.params).toEqual([
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      false,
      null,
      'WMS',
      null,
    ]);
    expect(client.calls).toHaveLength(1);
  });

  it('uses the shared pool when no client is supplied', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [CREATED_ROW] });

    const result = await createAttendance({
      bookingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    });

    expect(result).toEqual(CREATED_ROW);
    expect(poolMock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO public\.attendance/i);
    expect(params).toEqual(['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false, null, null, null]);
  });
});

// ── findById ───────────────────────────────────────────────────
describe('findById', () => {
  it('selects attendance by id', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findById('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', client);

    expect(result).toEqual(CREATED_ROW);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE attendance_id = $1');
    expect(select.params).toEqual(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);
  });

  it('returns null when no row matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await findById('99999999-9999-9999-9999-999999999999', client);

    expect(result).toBeNull();
  });
});

// ── updateAttendance ───────────────────────────────────────────
describe('updateAttendance', () => {
  it('updates a single field', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateAttendance(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      { checkedIn: true },
      client
    );

    const update = findCall(client, /^UPDATE public\.attendance/i);
    expect(update.sql).toContain('SET checked_in = $1, updated_at = NOW()');
    expect(update.sql).toContain('WHERE attendance_id = $2');
    expect(update.params).toEqual([true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);
  });

  it('updates multiple fields', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateAttendance(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      {
        checkedIn: true,
        checkInTime: '2026-09-08T11:00:00Z',
        source: 'VMS',
        lastSyncedAt: '2026-09-08T11:00:00Z',
      },
      client
    );

    const update = findCall(client, /^UPDATE public\.attendance/i);
    expect(update.sql).toContain(
      'SET checked_in = $1, check_in_time = $2, source = $3, last_synced_at = $4, updated_at = NOW()'
    );
    expect(update.params).toEqual([
      true,
      '2026-09-08T11:00:00Z',
      'VMS',
      '2026-09-08T11:00:00Z',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ]);
  });

  it('never lets immutable fields reach the SET clause', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await updateAttendance(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      {
        checkedIn: true,
        attendanceId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        bookingId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        createdAt: '2020-01-01T00:00:00Z',
      },
      client
    );

    const update = findCall(client, /^UPDATE public\.attendance/i);
    expect(update.sql).toContain('SET checked_in = $1');
    // Inspect only the SET clause; immutable fields legitimately appear in WHERE.
    const setClause = update.sql.split('SET')[1].split('WHERE')[0];
    expect(setClause).not.toMatch(/\battendance_id\s*=/i);
    expect(setClause).not.toMatch(/\bbooking_id\s*=/i);
    expect(setClause).not.toMatch(/\bcreated_at\s*=/i);
  });

  it('returns null when no row matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await updateAttendance(
      '99999999-9999-9999-9999-999999999999',
      { checkedIn: true },
      client
    );

    expect(result).toBeNull();
  });

  it('falls back to a read when changes contain no updatable fields', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await updateAttendance(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      { attendanceId: 'x' },
      client
    );

    expect(result).toEqual(CREATED_ROW);
    expect(sqlOf(client).some((s) => /^UPDATE public\.attendance/i.test(s))).toBe(false);
  });

  it('propagates unexpected DB errors', async () => {
    const client = makeClient();
    client.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      updateAttendance(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        { checkedIn: true },
        client
      )
    ).rejects.toThrow('DB error');
  });
});

// ── findByBookingId ────────────────────────────────────────────
describe('findByBookingId', () => {
  it('selects attendance by booking id', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await findByBookingId('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', client);

    expect(result).toEqual(CREATED_ROW);
    const select = findCall(client, /^SELECT/i);
    expect(select.sql).toContain('WHERE booking_id = $1');
    expect(select.params).toEqual(['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']);
  });

  it('returns null when no row matches', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [] }) });

    const result = await findByBookingId('99999999-9999-9999-9999-999999999999', client);

    expect(result).toBeNull();
  });
});
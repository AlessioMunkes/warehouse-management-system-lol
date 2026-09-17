// ─────────────────────────────────────────────────────────────
// server/__tests__/volunteerBooking.repository.test.js
//
// Repository-level tests for volunteerBooking.repository.
// No database. The pool is mocked and each method accepts an
// optional client, so a fake client that records statements is
// enough to prove the SQL shape, the parameter binding and the
// optional-client behaviour.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: volunteerBookingRepository } =
  await import('../src/repositories/volunteerBooking.repository.js');

const {
  createBooking,
  findById,
  findByTimeslotId,
  findByExternalBookingId,
  findByExternalVolunteerId,
  updateBooking,
  upsertExternalBooking,
  countConfirmedByTimeslot,
} = volunteerBookingRepository;

const CREATED_ROW = {
  booking_id: '11111111-1111-1111-1111-111111111111',
  timeslot_id: '22222222-2222-2222-2222-222222222222',
  external_booking_id: 'VMS-1001',
  external_volunteer_id: 'VMS-VOL-555',
  volunteer_first_name: 'Ada',
  volunteer_last_name: 'Lovelace',
  booking_source: 'VMS',
  booking_status: 'CONFIRMED',
  booked_at: '2026-09-08T10:00:00Z',
  last_synced_at: '2026-09-08T10:00:00Z',
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

// ── createBooking ─────────────────────────────────────────────
describe('createBooking', () => {
  it('inserts a VMS booking with external IDs as strings using the supplied client', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    const result = await createBooking(
      {
        timeslotId: '22222222-2222-2222-2222-222222222222',
        externalBookingId: 'VMS-1001',
        externalVolunteerId: 'VMS-VOL-555',
        volunteerFirstName: 'Ada',
        volunteerLastName: 'Lovelace',
        bookingSource: 'VMS',
        bookingStatus: 'CONFIRMED',
        lastSyncedAt: '2026-09-08T10:00:00Z',
      },
      client
    );

    expect(result).toEqual(CREATED_ROW);

    const insert = findCall(client, /^INSERT INTO public\.volunteer_bookings/i);
    expect(insert).toBeDefined();
    expect(insert.sql).toContain('external_booking_id, external_volunteer_id');
    expect(insert.sql).toContain('RETURNING');
    expect(insert.params).toEqual([
      '22222222-2222-2222-2222-222222222222',
      'VMS-1001',
      'VMS-VOL-555',
      'Ada',
      'Lovelace',
      'VMS',
      'CONFIRMED',
      '2026-09-08T10:00:00Z',
    ]);
    expect(client.calls).toHaveLength(1);
  });

  it('inserts a WMS_GUEST booking with null external IDs', async () => {
    const client = makeClient({ onQuery: () => ({ rows: [CREATED_ROW] }) });

    await createBooking(
      {
        timeslotId: '22222222-2222-2222-2222-222222222222',
        volunteerFirstName: 'Grace',
        volunteerLastName: null,
        bookingSource: 'WMS_GUEST',
        bookingStatus: 'CONFIRMED',
      },
      client
    );

    const insert = findCall(client, /^INSERT INTO public\.volunteer_bookings/i);
    expect(insert.params).toEqual([
      '22222222-2222-2222-2222-222222222222',
      null,
      null,
      'Grace',
      null,
      'WMS_GUEST',
      'CONFIRMED',
      null,
    ]);
  });

  it('uses the shared pool when no client is supplied', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [CREATED_ROW] });

    const result = await createBooking({
      timeslotId: '22222222-2222-2222-2222-222222222222',
      volunteerFirstName: 'Ada',
      bookingSource: 'WMS_GUEST',
      bookingStatus: 'CONFIRMED',
    });

    expect(result).toEqual(CREATED_ROW);
    expect(poolMock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO public\.volunteer_bookings/i);
    expect(params).toEqual([
      '22222222-2222-2222-2222-222222222222',
      null,
      null,
      'Ada',
      null,
      'WMS_GUEST',
      'CONFIRMED',
      null,
    ]);
  });
});
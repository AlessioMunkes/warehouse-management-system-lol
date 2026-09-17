process.env.JWT_SECRET ??= 'test-jwt-secret-do-not-use-in-production';
process.env.NODE_ENV ??= 'test';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pg from 'pg';

const TEST_DB_URL = process.env.VOLUNTEER_TEST_DATABASE_URL ?? null;
const TEST_USER_ID = process.env.VOLUNTEER_TEST_USER_ID
  ? Number(process.env.VOLUNTEER_TEST_USER_ID)
  : null;
const describeIfDb = TEST_DB_URL ? describe : describe.skip;
const BASE = '/api/love-activism';
const CAPACITY = 5;

describeIfDb('Scenario F — external booking idempotency integration', () => {
  let app;
  let pool;
  let spaceRepo;
  let volunteerBookingService;
  let eventId;
  let spaceId;
  let timeslotId;
  let bookingId;

  const externalBookingId = `SCENARIO-F-BOOKING-${crypto.randomUUID()}`;
  const externalVolunteerId = `SCENARIO-F-VOLUNTEER-${crypto.randomUUID()}`;

  const managerCookie = () => {
    const token = jwt.sign(
      { id: TEST_USER_ID, username: 'external.idempotency', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );
    return [`wms_token=${token}`];
  };

  beforeAll(async () => {
    if (!TEST_USER_ID || !Number.isInteger(TEST_USER_ID)) {
      throw new Error('VOLUNTEER_TEST_USER_ID must be an existing public.users id.');
    }
    pool = new pg.Pool({
      connectionString: TEST_DB_URL,
      ssl: process.env.VOLUNTEER_TEST_DB_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
    });
    vi.doMock('../src/config/db.js', () => ({ default: pool }));
    const { rows } = await pool.query('SELECT id FROM public.users WHERE id = $1', [TEST_USER_ID]);
    if (rows.length === 0) throw new Error(`TEST user ${TEST_USER_ID} missing in public.users.`);
    app = (await import('./helpers/loveActivismApp.js')).buildLoveActivismApp();
    spaceRepo = (await import('../src/repositories/eventSpace.repository.js')).default;
    volunteerBookingService = (await import('../src/services/volunteerBooking.service.js')).default;
  });

  afterAll(async () => {
    let cleanupError;
    if (pool && (eventId || spaceId || bookingId)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (bookingId) {
          await client.query(
            `DELETE FROM public.volunteer_bookings
              WHERE booking_id = $1 AND external_booking_id = $2`,
            [bookingId, externalBookingId],
          );
        }
        if (eventId) {
          await client.query(
            `DELETE FROM public.audit_log
              WHERE entity_id = $1 AND actor_id = $2
                AND entity_type = 'love_activism_event' AND action = 'CREATE'`,
            [eventId, TEST_USER_ID],
          );
          if (spaceId) {
            await client.query(
              `DELETE FROM public.audit_log
                WHERE entity_id = $1 AND actor_id = $2
                  AND entity_type = 'event_timeslot' AND action = 'BOOK_SPACE'
                  AND after_data @> $3::jsonb`,
              [eventId, TEST_USER_ID, JSON.stringify({ eventId, spaceId })],
            );
          }
          await client.query('DELETE FROM public.event_timeslots WHERE event_id = $1', [eventId]);
          await client.query(
            "DELETE FROM public.vms_sync WHERE entity_type = 'event_booking' AND entity_id = $1",
            [eventId],
          );
          await client.query('DELETE FROM public.love_activism_events WHERE event_id = $1', [eventId]);
        }
        if (spaceId) await client.query('DELETE FROM public.event_spaces WHERE space_id = $1', [spaceId]);
        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* preserve cleanup error */ }
        cleanupError = error;
      } finally {
        client.release();
      }
    }
    try { await pool?.end(); } catch { /* best-effort close */ }
    vi.doUnmock('../src/config/db.js');
    if (cleanupError) throw cleanupError;
  });

  it('reuses and updates one VMS booking row when the external booking ID repeats', async () => {
    const cookie = managerCookie();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const eventRes = await request(app)
      .post(`${BASE}/events`)
      .set('Cookie', cookie)
      .send({
        eventName: `External Idempotency Event ${crypto.randomUUID()}`,
        description: 'Phase 6 Scenario F',
        eventDate: tomorrow.toISOString().slice(0, 10),
      });
    expect(eventRes.status).toBe(201);
    eventId = eventRes.body.data.event_id;

    const space = await spaceRepo.createSpace({
      spaceName: `External Idempotency Space ${crypto.randomUUID()}`,
      description: 'Phase 6 Scenario F fixture',
      location: 'Warehouse A',
      is_active: true,
    });
    spaceId = space.space_id;

    const start = new Date(tomorrow);
    start.setUTCHours(12, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setUTCHours(14, 0, 0, 0);
    const slotRes = await request(app)
      .post(`${BASE}/events/${eventId}/booking`)
      .set('Cookie', cookie)
      .send({
        spaceId,
        timeslots: [{ startTime: start.toISOString(), endTime: end.toISOString(), capacity: CAPACITY }],
      });
    expect(slotRes.status).toBe(201);
    timeslotId = slotRes.body.data[0].timeslot_id;

    const firstSyncedAt = new Date(Date.now() - 1000).toISOString();
    const first = await volunteerBookingService.syncExternalBooking({
      externalBookingId,
      externalVolunteerId,
      timeslotId,
      volunteerFirstName: 'External',
      volunteerLastName: 'Original',
      bookingStatus: 'CONFIRMED',
      lastSyncedAt: firstSyncedAt,
    });
    bookingId = first.booking_id;
    expect(first).toMatchObject({
      booking_id: bookingId,
      timeslot_id: timeslotId,
      external_booking_id: externalBookingId,
      external_volunteer_id: externalVolunteerId,
      volunteer_last_name: 'Original',
      booking_source: 'VMS',
      booking_status: 'CONFIRMED',
    });

    const repeatedSyncedAt = new Date().toISOString();
    const repeated = await volunteerBookingService.syncExternalBooking({
      externalBookingId,
      externalVolunteerId,
      timeslotId,
      volunteerFirstName: 'External',
      volunteerLastName: 'Updated',
      bookingStatus: 'CONFIRMED',
      lastSyncedAt: repeatedSyncedAt,
    });
    expect(repeated).toMatchObject({
      booking_id: bookingId,
      timeslot_id: timeslotId,
      external_booking_id: externalBookingId,
      external_volunteer_id: externalVolunteerId,
      volunteer_last_name: 'Updated',
      booking_source: 'VMS',
      booking_status: 'CONFIRMED',
    });

    const persisted = await pool.query(
      `SELECT booking_id, timeslot_id, external_booking_id, external_volunteer_id,
              volunteer_last_name, booking_source, booking_status, last_synced_at
         FROM public.volunteer_bookings WHERE external_booking_id = $1`,
      [externalBookingId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({
      booking_id: bookingId,
      timeslot_id: timeslotId,
      external_booking_id: externalBookingId,
      external_volunteer_id: externalVolunteerId,
      volunteer_last_name: 'Updated',
      booking_source: 'VMS',
      booking_status: 'CONFIRMED',
    });
    expect(persisted.rows[0].last_synced_at.toISOString()).toBe(repeatedSyncedAt);

    const capacityRes = await request(app)
      .get(`${BASE}/timeslots/${timeslotId}/capacity`)
      .set('Cookie', cookie);
    expect(capacityRes.status).toBe(200);
    expect(capacityRes.body.data).toEqual({
      timeslotId,
      capacity: CAPACITY,
      booked: 1,
      remaining: CAPACITY - 1,
      isFull: false,
    });
  }, 60000);
});

if (!TEST_DB_URL) {
  describe('Scenario F — skipped (no volunteer test DB)', () => {
    it('skips without VOLUNTEER_TEST_DATABASE_URL', () => expect(true).toBe(true));
  });
}

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
const CAPACITY = 1;

describeIfDb('Scenario D — full slot integration', () => {
  let app;
  let pool;
  let spaceRepo;
  let eventId;
  let spaceId;
  let timeslotId;
  let bookingId;

  const managerCookie = () => {
    const token = jwt.sign(
      { id: TEST_USER_ID, username: 'full.slot', role: 'manager' },
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
  });

  afterAll(async () => {
    let cleanupError;
    if (pool && (eventId || spaceId || bookingId)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (bookingId) {
          await client.query(
            `DELETE FROM public.audit_log
              WHERE entity_type = 'volunteer_booking' AND entity_id = $1
                AND action = 'WALK_IN' AND actor_id = $2`,
            [bookingId, TEST_USER_ID],
          );
          await client.query('DELETE FROM public.volunteer_bookings WHERE booking_id = $1', [bookingId]);
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

  it('rejects an additional guest after capacity is full without creating another booking', async () => {
    const cookie = managerCookie();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const eventRes = await request(app)
      .post(`${BASE}/events`)
      .set('Cookie', cookie)
      .send({
        eventName: `Full Slot Event ${crypto.randomUUID()}`,
        description: 'Phase 6 Scenario D',
        eventDate: tomorrow.toISOString().slice(0, 10),
      });
    expect(eventRes.status).toBe(201);
    eventId = eventRes.body.data.event_id;

    const space = await spaceRepo.createSpace({
      spaceName: `Full Slot Space ${crypto.randomUUID()}`,
      description: 'Phase 6 Scenario D fixture',
      location: 'Warehouse A',
      is_active: true,
    });
    spaceId = space.space_id;

    const start = new Date(tomorrow);
    start.setUTCHours(9, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setUTCHours(10, 0, 0, 0);
    const slotRes = await request(app)
      .post(`${BASE}/events/${eventId}/booking`)
      .set('Cookie', cookie)
      .send({
        spaceId,
        timeslots: [{ startTime: start.toISOString(), endTime: end.toISOString(), capacity: CAPACITY }],
      });
    expect(slotRes.status).toBe(201);
    timeslotId = slotRes.body.data[0].timeslot_id;

    const initialCapacity = await request(app)
      .get(`${BASE}/timeslots/${timeslotId}/capacity`)
      .set('Cookie', cookie);
    expect(initialCapacity.body.data).toEqual({
      timeslotId,
      capacity: 1,
      booked: 0,
      remaining: 1,
      isFull: false,
    });

    const firstBooking = await request(app)
      .post(`${BASE}/timeslots/${timeslotId}/guests`)
      .set('Cookie', cookie)
      .send({ volunteerFirstName: 'First', volunteerLastName: 'Guest' });
    expect(firstBooking.status).toBe(201);
    bookingId = firstBooking.body.data.booking_id;
    expect(firstBooking.body.data.booking_status).toBe('CONFIRMED');

    const fullCapacity = await request(app)
      .get(`${BASE}/timeslots/${timeslotId}/capacity`)
      .set('Cookie', cookie);
    expect(fullCapacity.body.data).toEqual({
      timeslotId,
      capacity: 1,
      booked: 1,
      remaining: 0,
      isFull: true,
    });

    const rejected = await request(app)
      .post(`${BASE}/timeslots/${timeslotId}/guests`)
      .set('Cookie', cookie)
      .send({ volunteerFirstName: 'Second', volunteerLastName: 'Guest' });
    expect(rejected.status).toBe(409);
    expect(rejected.body.message).toContain('full capacity');

    const finalRows = await pool.query(
      `SELECT booking_id FROM public.volunteer_bookings
        WHERE timeslot_id = $1 AND booking_status = 'CONFIRMED'`,
      [timeslotId],
    );
    expect(finalRows.rows.map((row) => row.booking_id)).toEqual([bookingId]);

    const finalCapacity = await request(app)
      .get(`${BASE}/timeslots/${timeslotId}/capacity`)
      .set('Cookie', cookie);
    expect(finalCapacity.body.data).toEqual(fullCapacity.body.data);
  }, 60000);
});

if (!TEST_DB_URL) {
  describe('Scenario D — skipped (no volunteer test DB)', () => {
    it('skips without VOLUNTEER_TEST_DATABASE_URL', () => expect(true).toBe(true));
  });
}

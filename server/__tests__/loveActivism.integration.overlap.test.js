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

describeIfDb('Scenario E — overlapping timeslot rejection integration', () => {
  let app;
  let pool;
  let spaceRepo;
  let eventId;
  let spaceId;
  let timeslotId;

  const managerCookie = () => {
    const token = jwt.sign(
      { id: TEST_USER_ID, username: 'overlap.test', role: 'manager' },
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
    if (pool && (eventId || spaceId)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
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

  it('rejects an overlapping slot without changing persisted local or sync state', async () => {
    const cookie = managerCookie();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const eventRes = await request(app)
      .post(`${BASE}/events`)
      .set('Cookie', cookie)
      .send({
        eventName: `Overlap Event ${crypto.randomUUID()}`,
        description: 'Phase 6 Scenario E',
        eventDate: tomorrow.toISOString().slice(0, 10),
      });
    expect(eventRes.status).toBe(201);
    eventId = eventRes.body.data.event_id;

    const space = await spaceRepo.createSpace({
      spaceName: `Overlap Space ${crypto.randomUUID()}`,
      description: 'Phase 6 Scenario E fixture',
      location: 'Warehouse A',
      is_active: true,
    });
    spaceId = space.space_id;

    const firstStart = new Date(tomorrow);
    firstStart.setUTCHours(9, 0, 0, 0);
    const firstEnd = new Date(tomorrow);
    firstEnd.setUTCHours(11, 0, 0, 0);
    const validRes = await request(app)
      .post(`${BASE}/events/${eventId}/booking`)
      .set('Cookie', cookie)
      .send({
        spaceId,
        timeslots: [{ startTime: firstStart.toISOString(), endTime: firstEnd.toISOString(), capacity: 10 }],
      });
    expect(validRes.status).toBe(201);
    expect(validRes.body.data).toHaveLength(1);
    timeslotId = validRes.body.data[0].timeslot_id;

    const before = await pool.query(
      `SELECT
         (SELECT status FROM public.love_activism_events WHERE event_id = $1) AS event_status,
         (SELECT updated_at FROM public.love_activism_events WHERE event_id = $1) AS event_updated_at,
         (SELECT COUNT(*)::int FROM public.event_timeslots WHERE event_id = $1) AS timeslot_count,
         (SELECT sync_id FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_id,
         (SELECT sync_status FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_status,
         (SELECT external_id FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS external_id,
         (SELECT updated_at FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_updated_at`,
      [eventId],
    );
    expect(before.rows[0].event_status).toBe('PUBLISHED');
    expect(before.rows[0].timeslot_count).toBe(1);
    expect(before.rows[0].sync_status).toBe('SYNCED');

    const overlapStart = new Date(tomorrow);
    overlapStart.setUTCHours(10, 0, 0, 0);
    const overlapEnd = new Date(tomorrow);
    overlapEnd.setUTCHours(12, 0, 0, 0);
    const rejected = await request(app)
      .post(`${BASE}/events/${eventId}/booking`)
      .set('Cookie', cookie)
      .send({
        spaceId,
        timeslots: [{ startTime: overlapStart.toISOString(), endTime: overlapEnd.toISOString(), capacity: 10 }],
      });
    expect(rejected.status).toBe(409);
    expect(rejected.body.message).toContain('overlap');

    const slotsAfter = await pool.query(
      `SELECT timeslot_id, start_time, end_time, capacity, status
         FROM public.event_timeslots WHERE event_id = $1`,
      [eventId],
    );
    expect(slotsAfter.rows).toHaveLength(1);
    expect(slotsAfter.rows[0].timeslot_id).toBe(timeslotId);
    expect(slotsAfter.rows[0].capacity).toBe(10);
    expect(slotsAfter.rows[0].status).toBe('OPEN');

    const after = await pool.query(
      `SELECT
         (SELECT status FROM public.love_activism_events WHERE event_id = $1) AS event_status,
         (SELECT updated_at FROM public.love_activism_events WHERE event_id = $1) AS event_updated_at,
         (SELECT COUNT(*)::int FROM public.event_timeslots WHERE event_id = $1) AS timeslot_count,
         (SELECT sync_id FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_id,
         (SELECT sync_status FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_status,
         (SELECT external_id FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS external_id,
         (SELECT updated_at FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_updated_at`,
      [eventId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  }, 60000);
});

if (!TEST_DB_URL) {
  describe('Scenario E — skipped (no volunteer test DB)', () => {
    it('skips without VOLUNTEER_TEST_DATABASE_URL', () => expect(true).toBe(true));
  });
}

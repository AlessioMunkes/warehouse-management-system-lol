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
const CAPACITY = 12;

describeIfDb('Scenario B — VMS failure and retry integration', () => {
  let app;
  let pool;
  let vmsIntegrationService;
  let vmsSyncService;
  let realAdapter;
  let spaceRepo;
  let eventId;
  let spaceId;
  let timeslotId;

  const managerCookie = () => {
    const token = jwt.sign(
      { id: TEST_USER_ID, username: 'failure.retry', role: 'manager' },
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

    const { rows: users } = await pool.query(
      'SELECT id FROM public.users WHERE id = $1',
      [TEST_USER_ID],
    );
    if (users.length === 0) {
      throw new Error(`TEST user ${TEST_USER_ID} missing in public.users.`);
    }

    const { buildLoveActivismApp } = await import('./helpers/loveActivismApp.js');
    app = buildLoveActivismApp();

    vmsIntegrationService = (await import('../src/services/vmsIntegration.service.js')).default;
    vmsSyncService = (await import('../src/services/vmsSync.service.js')).default;
    realAdapter = (await import('../src/integrations/mockVMS.adapter.js')).default;
    spaceRepo = (await import('../src/repositories/eventSpace.repository.js')).default;

    realAdapter.resetMockVMS();
    vmsIntegrationService.setAdapter(realAdapter);
  });

  afterAll(async () => {
    try {
      realAdapter?.resetMockVMS();
      if (vmsIntegrationService && realAdapter) vmsIntegrationService.setAdapter(realAdapter);
    } catch { /* best-effort adapter restore */ }

    let cleanupError;
    if (pool && (eventId || spaceId)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (eventId) {
          await client.query(
            `DELETE FROM public.audit_log
              WHERE entity_id = $1
                AND actor_id = $2
                AND entity_type = 'love_activism_event'
                AND action = 'CREATE'`,
            [eventId, TEST_USER_ID],
          );
          if (spaceId) {
            await client.query(
              `DELETE FROM public.audit_log
                WHERE entity_id = $1
                  AND actor_id = $2
                  AND entity_type = 'event_timeslot'
                  AND action = 'BOOK_SPACE'
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
        if (spaceId) {
          await client.query('DELETE FROM public.event_spaces WHERE space_id = $1', [spaceId]);
        }
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

  it('keeps local data after publish failure and publishes it on retry without duplicates', async () => {
    const cookie = managerCookie();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const eventDate = tomorrow.toISOString().slice(0, 10);

    const createRes = await request(app)
      .post(`${BASE}/events`)
      .set('Cookie', cookie)
      .send({
        eventName: `Failure Retry Event ${crypto.randomUUID()}`,
        description: 'Phase 6B Scenario B',
        eventDate,
      });
    expect(createRes.status).toBe(201);
    eventId = createRes.body.data.event_id;
    expect(eventId).toBeTruthy();

    const space = await spaceRepo.createSpace({
      spaceName: `Failure Retry Space ${crypto.randomUUID()}`,
      description: 'Phase 6B Scenario B fixture',
      location: 'Warehouse A',
      is_active: true,
    });
    spaceId = space.space_id;

    const start = new Date(tomorrow);
    start.setUTCHours(12, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setUTCHours(14, 0, 0, 0);

    realAdapter.setForceFail(true);
    const bookingRes = await request(app)
      .post(`${BASE}/events/${eventId}/booking`)
      .set('Cookie', cookie)
      .send({
        spaceId,
        timeslots: [
          { startTime: start.toISOString(), endTime: end.toISOString(), capacity: CAPACITY },
        ],
      });
    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.data).toHaveLength(1);
    timeslotId = bookingRes.body.data[0].timeslot_id;

    const failedEvent = await pool.query(
      'SELECT status FROM public.love_activism_events WHERE event_id = $1',
      [eventId],
    );
    const failedSlots = await pool.query(
      'SELECT timeslot_id FROM public.event_timeslots WHERE event_id = $1',
      [eventId],
    );
    const failedSync = await pool.query(
      `SELECT sync_status, error_message, last_attempt_at, last_success_at
         FROM public.vms_sync
        WHERE entity_type = 'event_booking' AND entity_id = $1`,
      [eventId],
    );

    expect(failedEvent.rows).toHaveLength(1);
    expect(failedEvent.rows[0].status).not.toBe('PUBLISHED');
    expect(failedSlots.rows.map((row) => row.timeslot_id)).toEqual([timeslotId]);
    expect(failedSync.rows).toHaveLength(1);
    expect(failedSync.rows[0].sync_status).toBe('FAILED');
    expect(failedSync.rows[0].error_message).toContain('VMS unavailable');
    expect(failedSync.rows[0].last_attempt_at).not.toBeNull();
    expect(failedSync.rows[0].last_success_at).toBeNull();

    const countsBeforeRetry = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM public.love_activism_events WHERE event_id = $1) AS events,
         (SELECT COUNT(*)::int FROM public.event_timeslots WHERE event_id = $1) AS timeslots,
         (SELECT COUNT(*)::int FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_rows`,
      [eventId],
    );

    realAdapter.setForceFail(false);
    const retried = await vmsSyncService.retrySync('event_booking', eventId);
    expect(retried.sync_status).toBe('SYNCED');
    expect(retried.external_id).toBe(`VMS-EVENT_BOOKING-${eventId}`);
    expect(retried.last_success_at).not.toBeNull();
    expect(retried.error_message).toBeNull();

    const finalState = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM public.love_activism_events WHERE event_id = $1) AS events,
         (SELECT status FROM public.love_activism_events WHERE event_id = $1) AS event_status,
         (SELECT COUNT(*)::int FROM public.event_timeslots WHERE event_id = $1) AS timeslots,
         (SELECT COUNT(*)::int FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_rows,
         (SELECT sync_status FROM public.vms_sync
           WHERE entity_type = 'event_booking' AND entity_id = $1) AS sync_status`,
      [eventId],
    );

    expect(countsBeforeRetry.rows[0]).toEqual({ events: 1, timeslots: 1, sync_rows: 1 });
    expect(finalState.rows[0]).toEqual({
      events: 1,
      event_status: 'PUBLISHED',
      timeslots: 1,
      sync_rows: 1,
      sync_status: 'SYNCED',
    });
  }, 60000);
});

if (!TEST_DB_URL) {
  describe('Scenario B — skipped (no volunteer test DB)', () => {
    it('skips without VOLUNTEER_TEST_DATABASE_URL', () => {
      expect(true).toBe(true);
    });
  });
}

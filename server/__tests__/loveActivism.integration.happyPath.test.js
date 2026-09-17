// ─────────────────────────────────────────────────────────────
// server/__tests__/loveActivism.integration.happyPath.test.js
// Phase 6A Scenario A — happy-path BACKEND INTEGRATION (real layers).
// Flow: HTTP → auth/RBAC → controller → services → repositories
// → local txn → vms_sync PENDING → COMMIT → VMSSyncService →
// VMSIntegrationService → MockVMSAdapter → SYNCED → event PUBLISHED.
// SAFETY: runs ONLY when VOLUNTEER_TEST_DATABASE_URL is explicitly set.
// Scenario A may target the main development DB because its created rows are
// scoped by returned fixture IDs and removed in FK-safe order. Otherwise it
// SKIPS and never touches any database. Never point this at production data.
// VOLUNTEER_TEST_USER_ID must be an existing public.users id in that
// database (created_by FK); the test JWT carries role 'manager'. The existing
// user is read for validation/auth only and is never updated or deleted.
// Ordering evidence: wrapper around the REAL MockVMSAdapter (via the
// official setAdapter seam, delegating to real publishEventBooking)
// reads vms_sync + event_timeslots on a SEPARATE pool connection on
// publish entry. Seeing PENDING + timeslot rows there proves COMMIT
// already happened and sync success had not yet occurred.
// ─────────────────────────────────────────────────────────────
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

describeIfDb('Scenario A — volunteer happy-path backend integration', () => {
  let app;
  let pool;
  let vmsIntegrationService;
  let realAdapter;
  let spaceRepo;
  let eventId;
  let spaceId;
  let timeslotId;
  const order = [];
  let publishEntrySnapshot = null;

  const managerCookie = () => {
    const token = jwt.sign(
      { id: TEST_USER_ID, username: 'happy.path', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );
    return [`wms_token=${token}`];
  };

  beforeAll(async () => {
    if (!TEST_USER_ID || !Number.isInteger(TEST_USER_ID)) {
      throw new Error('VOLUNTEER_TEST_USER_ID must be an existing public.users id.');
    }
    // Test-only DB wiring: all dynamically imported repositories/services receive
    // this pool without replacing the application's normal DATABASE_URL.
    pool = new pg.Pool({
      connectionString: TEST_DB_URL,
      ssl: process.env.VOLUNTEER_TEST_DB_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
    });
    vi.doMock('../src/config/db.js', () => ({ default: pool }));

    const { rows: cons } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'public.vms_sync'::regclass
          AND conname = 'chk_vms_sync_entity_type'`,
    );
    if (!cons[0]?.def?.includes('event_booking')) {
      throw new Error('Volunteer test DB missing migration 016 (need event_booking).');
    }
    const { rows: users } = await pool.query(
      'SELECT id FROM public.users WHERE id = $1',
      [TEST_USER_ID],
    );
    if (users.length === 0) {
      throw new Error(`TEST user ${TEST_USER_ID} missing in public.users.`);
    }

    const { buildLoveActivismApp } = await import('./helpers/loveActivismApp.js');
    app = buildLoveActivismApp();

    const integMod = await import('../src/services/vmsIntegration.service.js');
    vmsIntegrationService = integMod.default;
    const adapterMod = await import('../src/integrations/mockVMS.adapter.js');
    realAdapter = adapterMod.default;
    realAdapter.resetMockVMS();

    const spaceMod = await import('../src/repositories/eventSpace.repository.js');
    spaceRepo = spaceMod.default;

    const realPublish = realAdapter.publishEventBooking.bind(realAdapter);
    vmsIntegrationService.setAdapter({
      publishEventBooking: async (payload) => {
        console.log('[dbg] publish-enter');
        const syncRes = await pool.query(
          `SELECT sync_status FROM public.vms_sync
            WHERE entity_type = 'event_booking' AND entity_id = $1`,
          [payload.entityId],
        );
        console.log('[dbg] publish-sync-query-done');
        const slotRes = await pool.query(
          'SELECT COUNT(*)::int AS n FROM public.event_timeslots WHERE event_id = $1',
          [payload.entityId],
        );
        console.log('[dbg] publish-slots-query-done');
        publishEntrySnapshot = {
          syncSeen: syncRes.rows[0]?.sync_status ?? null,
          timeslotsVisible: slotRes.rows[0]?.n ?? null,
        };
        order.push('publish-enter');
        const result = await realPublish(payload);
        order.push('publish-exit');
        console.log('[dbg] publish-exit');
        return result;
      },
    });
  });

  afterAll(async () => {
    try {
      if (vmsIntegrationService && realAdapter) {
        vmsIntegrationService.setAdapter(realAdapter);
        realAdapter.resetMockVMS();
      }
    } catch { /* best-effort restore */ }
    let cleanupError;
    if (pool && (eventId || spaceId)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Scenario A creates no volunteer_bookings or attendance rows, so neither
        // table is touched. Audit rows are test-owned because eventId is returned
        // from this test's newly inserted event.
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
        try { await client.query('ROLLBACK'); } catch { /* preserve original cleanup error */ }
        cleanupError = error;
      } finally {
        client.release();
      }
    }
    try { await pool?.end(); } catch { /* best-effort close */ }
    vi.doUnmock('../src/config/db.js');
    if (cleanupError) throw cleanupError;
  });

  it('happy path: event → booking → PENDING → COMMIT → publish → SYNCED → PUBLISHED', async () => {
    const cookie = managerCookie();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const eventDate = tomorrow.toISOString().slice(0, 10);

    // 1. Create Love Activism event (authorised manager, real HTTP).
    const createRes = await request(app)
      .post(`${BASE}/events`)
      .set('Cookie', cookie)
      .send({ eventName: `Happy Path Event ${crypto.randomUUID()}`, description: 'Phase 6A', eventDate });
    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    eventId = createRes.body.data.event_id;
    expect(eventId).toBeTruthy();
    // 2. Initially local / non-published.
    expect(createRes.body.data.status).not.toBe('PUBLISHED');
    // 3. Active event space (real repository — no HTTP surface exists).
    const space = await spaceRepo.createSpace({
      spaceName: `Happy Path Space ${crypto.randomUUID()}`,
      description: 'Phase 6A fixture',
      location: 'Warehouse A',
      is_active: true,
    });
    spaceId = space.space_id;
    expect(space.is_active).toBe(true);

    // 4. Booking: valid event + active space + valid timeslot + capacity, no overlap.
    const start = new Date(tomorrow);
    start.setUTCHours(9, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setUTCHours(11, 0, 0, 0);
    const bookRes = await request(app)
      .post(`${BASE}/events/${eventId}/booking`)
      .set('Cookie', cookie)
      .send({
        spaceId,
        timeslots: [
          { startTime: start.toISOString(), endTime: end.toISOString(), capacity: CAPACITY },
        ],
      });
    expect(bookRes.status).toBe(201);
    expect(bookRes.body).toEqual({ success: true, data: expect.any(Array) });
    expect(bookRes.body.data).toHaveLength(1);
    timeslotId = bookRes.body.data[0].timeslot_id;
    expect(timeslotId).toBeTruthy();

    // 5+6. Ordering: publish ran post-commit, PENDING pre-success.
    // The booking HTTP round-trip awaits triggerPostCommitSync, so both
    // markers are recorded by now.
    expect(order).toEqual(['publish-enter', 'publish-exit']);
    expect(publishEntrySnapshot).not.toBeNull();
    expect(publishEntrySnapshot.syncSeen).toBe('PENDING');
    expect(publishEntrySnapshot.timeslotsVisible).toBe(1);

    // 7+8. Sync row SYNCED with external id + timestamps, error cleared.
    const { rows: syncRows } = await pool.query(
      `SELECT sync_status, external_id, last_success_at, error_message
         FROM public.vms_sync
        WHERE entity_type = 'event_booking' AND entity_id = $1`,
      [eventId],
    );
    expect(syncRows).toHaveLength(1);
    expect(syncRows[0].sync_status).toBe('SYNCED');
    expect(syncRows[0].external_id).toBe(`VMS-EVENT_BOOKING-${eventId}`);
    expect(syncRows[0].last_success_at).not.toBeNull();
    expect(syncRows[0].error_message).toBeNull();

    // Event PUBLISHED only after successful sync.
    const eventRes = await request(app).get(`${BASE}/events/${eventId}`).set('Cookie', cookie);
    expect(eventRes.status).toBe(200);
    expect(eventRes.body).toEqual({ success: true, data: expect.any(Object) });
    expect(eventRes.body.data.status).toBe('PUBLISHED');

    // Timeslots remain persisted.
    const slotsRes = await request(app)
      .get(`${BASE}/events/${eventId}/timeslots`)
      .set('Cookie', cookie);
    expect(slotsRes.status).toBe(200);
    expect(slotsRes.body).toEqual({ success: true, data: expect.any(Array) });
    expect(slotsRes.body.data.map((s) => s.timeslot_id)).toContain(timeslotId);

    // 9. Capacity summary: booked=0, remaining=capacity, isFull=false.
    const capRes = await request(app)
      .get(`${BASE}/timeslots/${timeslotId}/capacity`)
      .set('Cookie', cookie);
    expect(capRes.status).toBe(200);
    expect(capRes.body).toEqual({
      success: true,
      data: {
        timeslotId,
        capacity: CAPACITY,
        booked: 0,
        remaining: CAPACITY,
        isFull: false,
      },
    });
  }, 30000);
});

if (!TEST_DB_URL) {
  describe('Scenario A — skipped (no isolated test DB)', () => {
    it('skips without VOLUNTEER_TEST_DATABASE_URL', () => {
      expect(true).toBe(true);
    });
  });
}



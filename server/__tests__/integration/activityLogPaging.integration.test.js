// ─────────────────────────────────────────────────────────────
// server/__tests__/integration/activityLogPaging.integration.test.js
//
// GET /api/admin/activity and GET /api/volunteers against a REAL
// Postgres, through the real routers, service and repositories.
//
// Why this exists: the paging change built LIMIT / OFFSET placeholders
// in a template string, lost a "$", and sent two parameters to a
// statement that had none. Every mocked test passed, because a mock
// never sees SQL; both endpoints returned 500 on a real database.
//
// RUN IT AGAINST A LOCAL DATABASE ONLY. It empties the tables it uses
// between tests, so it SKIPS unless DATABASE_URL points at localhost:
//
//   DATABASE_URL=postgres://postgres@localhost:55432/wmstest DB_SSL=false JWT_SECRET=x \
//     npm run test:integration -- activityLogPaging
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { resetTables } from '../helpers/resetTables.js';
import request from 'supertest';

// SKIPS, never fails, unless DATABASE_URL points at a LOCAL database.
const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

let pool, app, authCookie;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ authCookie } = await import('../helpers/testAuth.js'));
  const { default: express } = await import('express');
  const { default: cookieParser } = await import('cookie-parser');
  const { default: adminRouter } = await import('../../src/routes/admin.routes.js');
  const { default: volunteerRouter } = await import('../../src/routes/volunteer.routes.js');
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', adminRouter);
  app.use('/api/volunteers', volunteerRouter);
}

const q = (sql, params) => pool.query(sql, params);
const TABLES = ['audit_log', 'volunteers', 'users'];

let admin;
const asAdmin = (path) => request(app).get(path).set('Cookie', authCookie(admin));

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

describe.skipIf(!LOCAL)('activity log paging against a real database', () => {
  beforeAll(async () => { await resetTables(pool, TABLES); });
  afterAll(async () => {
    await resetTables(pool, TABLES);
    await pool.end();
  });

  beforeEach(async () => {
    await resetTables(pool, TABLES);
    const { rows } = await q(
      `INSERT INTO users (username, first_name, last_name, password_hash, role)
       VALUES ('ada', 'Ada', 'Admin', 'x', 'admin') RETURNING id, role, username`,
    );
    admin = rows[0];
  });

  // Twelve visits, one a day for the last twelve days, plus one a year ago.
  const seedVisits = async () => {
    for (let i = 0; i < 12; i += 1) {
      await q('INSERT INTO volunteers (full_name, signed_in_at) VALUES ($1, $2)', [`Visitor ${i}`, daysAgo(i)]);
    }
    await q('INSERT INTO volunteers (full_name, signed_in_at) VALUES ($1, $2)', ['Last year', daysAgo(400)]);
  };

  // Twelve audit rows an hour apart, all today.
  const seedAudit = async () => {
    for (let i = 0; i < 12; i += 1) {
      await q(
        `INSERT INTO audit_log (entity_type, entity_id, action, actor_id, created_at)
         VALUES ('user', $1, 'UPDATE', $2, now() - ($3 || ' minutes')::interval)`,
        [String(i), admin.id, String(i * 5)],
      );
    }
  };

  describe('GET /api/volunteers', () => {
    it('answers with no parameters at all (the dashboard tile)', async () => {
      await seedVisits();
      const res = await asAdmin('/api/volunteers');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(13);
      expect(res.body.hasMore).toBe(false);
      expect(res.body.data[0].full_name).toBe('Visitor 0');
    });

    it('pages with limit and offset, newest first, and says when there is more', async () => {
      await seedVisits();
      const first = await asAdmin('/api/volunteers?limit=5');
      expect(first.status).toBe(200);
      expect(first.body.data.map((v) => v.full_name)).toEqual(['Visitor 0', 'Visitor 1', 'Visitor 2', 'Visitor 3', 'Visitor 4']);
      expect(first.body.hasMore).toBe(true);

      const last = await asAdmin('/api/volunteers?limit=5&offset=10');
      expect(last.body.data.map((v) => v.full_name)).toEqual(['Visitor 10', 'Visitor 11', 'Last year']);
      expect(last.body.hasMore).toBe(false);
    });

    it('filters by dates and by name together with paging', async () => {
      await seedVisits();
      const range = await asAdmin(`/api/volunteers?from=${daysAgo(29).slice(0, 10)}&to=${tomorrow()}&limit=50`);
      expect(range.status).toBe(200);
      expect(range.body.data).toHaveLength(12);
      const named = await asAdmin('/api/volunteers?search=visitor%201&limit=50');
      expect(named.body.data.map((v) => v.full_name)).toEqual(['Visitor 1', 'Visitor 10', 'Visitor 11']);
    });
  });

  describe('GET /api/admin/activity', () => {
    it('answers with no parameters (the default 30 days)', async () => {
      await seedAudit();
      const res = await asAdmin('/api/admin/activity');
      expect(res.status).toBe(200);
      expect(res.body.data.entries).toHaveLength(12);
      expect(res.body.data.hasMore).toBe(false);
      expect(res.body.data.truncated).toBe(false);
    });

    it('pages with limit and offset, with no repeats or gaps, and says when there is more', async () => {
      await seedAudit();
      const first = await asAdmin('/api/admin/activity?limit=5');
      expect(first.status).toBe(200);
      expect(first.body.data.entries).toHaveLength(5);
      expect(first.body.data.hasMore).toBe(true);

      const second = await asAdmin('/api/admin/activity?limit=5&offset=5');
      const third = await asAdmin('/api/admin/activity?limit=5&offset=10');
      expect(third.body.data.entries).toHaveLength(2);
      expect(third.body.data.hasMore).toBe(false);

      const times = [first, second, third].flatMap((r) => r.body.data.entries.map((e) => e.at));
      expect(new Set(times).size).toBe(12);
      expect([...times]).toEqual([...times].sort().reverse());
    });

    it('narrows to one person with paging', async () => {
      await seedAudit();
      const res = await asAdmin(`/api/admin/activity?user=${admin.id}&limit=4`);
      expect(res.status).toBe(200);
      expect(res.body.data.entries).toHaveLength(4);
      expect(res.body.data.hasMore).toBe(true);
    });
  });
});

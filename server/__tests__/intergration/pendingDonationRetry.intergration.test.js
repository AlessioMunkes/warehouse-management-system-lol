// ─────────────────────────────────────────────────────────────
// server/__tests__/intergration/pendingDonationRetry.intergration.test.js
//
// Retrying a failed donation save against a REAL Postgres, through the
// real router, service and repositories, as a manager.
//
// The property that matters: retry creates a donation, adds its stock and
// emails the donor. Two retries arriving together (a double click, or a
// manager and an admin acting at once) must not both do that. The claim
// in claimPendingDonationForRetry is one conditional UPDATE, so one wins
// and the other is told it is already being retried. A mocked test cannot
// show that; only two real connections racing for one row can.
//
// RUN IT AGAINST A LOCAL DATABASE ONLY. It empties the tables it uses
// between tests, so it SKIPS unless DATABASE_URL points at localhost:
//
//   DATABASE_URL=postgres://postgres@localhost:55432/wmstest DB_SSL=false JWT_SECRET=x \
//     npm run test:integration -- pendingDonationRetry
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';

// SKIPS, never fails, unless DATABASE_URL points at a LOCAL database.
const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

let pool, app, authCookie;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ authCookie } = await import('../helpers/testAuth.js'));
  const { buildPendingDonationApp } = await import('../helpers/pendingDonationApp.js');
  app = buildPendingDonationApp();
}

const TABLES = [
  'donation_allocations', 'donation_items', 'donations', 'pending_donation_items',
  'warehouse_manager_flags', 'pending_donations', 'stock_movements', 'stock_levels',
  'donation_routing_defaults', 'donation_category_routing', 'notifications', 'audit_log',
  'products', 'users',
];

const q = (sql, params) => pool.query(sql, params);
const BASE = '/api/donations/pending';

let manager, admin, worker, product, pendingId;

const addUser = async (username, role) => {
  const { rows } = await q(
    `INSERT INTO users (username, first_name, last_name, password_hash, role)
     VALUES ($1, 'Test', $1, 'x', $2) RETURNING id, role, username`,
    [username, role],
  );
  return rows[0];
};

const asUser = (user) => ({
  post: (path) => request(app).post(path).set('Cookie', authCookie(user)).send({}),
  get: (path) => request(app).get(path).set('Cookie', authCookie(user)),
});

// A donation whose first save failed: one resolved line of 5 kg.
const seedPending = async (status = 'commit_failed', extra = {}) => {
  const { rows } = await q(
    `INSERT INTO pending_donations (status, draft_snapshot, donation_category, estimated_value_zar, created_by, committed_donation_id)
     VALUES ($1, '{}'::jsonb, 'recipe_food', 100, $2, $3) RETURNING id`,
    [status, worker.id, extra.committedDonationId ?? null],
  );
  const id = rows[0].id;
  await q(
    `INSERT INTO pending_donation_items
       (pending_donation_id, line_no, description, quantity, unit, status, product_id,
        resolved_category, routing_status, source)
     VALUES ($1, 1, 'Rice', 5, 'kg', 'resolved', $2, 'recipe_food', 'allocated', 'product_default')`,
    [id, product.id],
  );
  return id;
};

const stockOnHand = async () => {
  const { rows } = await q('SELECT quantity_on_hand FROM stock_levels WHERE product_id = $1', [product.id]);
  return rows.length ? Number(rows[0].quantity_on_hand) : 0;
};
const count = async (table) => Number((await q(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

describe.skipIf(!LOCAL)('retrying a failed donation against a real database', () => {
  beforeAll(async () => { await q(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`); });
  afterAll(async () => {
    await q(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    await pool.end();
  });

  beforeEach(async () => {
    await q(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    manager = await addUser('mo', 'manager');
    admin = await addUser('ada', 'admin');
    worker = await addUser('wendy', 'warehouse_worker');
    ({ rows: [product] } = await q(
      `INSERT INTO products (name, stock_keeping_unit, storage_type, is_active)
       VALUES ('Rice 5kg', 'RICE5', 'dry', true) RETURNING id`,
    ));
    await q(`INSERT INTO donation_category_routing (category, routing_outcome) VALUES ('recipe_food', 'allocated')`);
    await q(`INSERT INTO donation_routing_defaults (product_id, donation_category) VALUES ($1, 'recipe_food')`, [product.id]);
    pendingId = await seedPending();
  });

  it('lets a manager retry a failed save: one donation, stock added once', async () => {
    const res = await asUser(manager).post(`${BASE}/${pendingId}/retry-commit`);
    expect(res.status).toBe(200);

    expect(await count('donations')).toBe(1);
    expect(await count('donation_items')).toBe(1);
    expect(await stockOnHand()).toBe(5);
    expect(await count('stock_movements')).toBe(1);
    const { rows } = await q('SELECT status, committed_donation_id FROM pending_donations WHERE id = $1', [pendingId]);
    expect(rows[0].status).toBe('committed');
    expect(rows[0].committed_donation_id).not.toBeNull();
  });

  it('two retries at once: only one commits, the other is told it is being retried', async () => {
    const [a, b] = await Promise.all([
      asUser(manager).post(`${BASE}/${pendingId}/retry-commit`),
      asUser(admin).post(`${BASE}/${pendingId}/retry-commit`),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.message).toMatch(/already being retried|only valid for status/);

    // Exactly one donation, one set of stock movements, stock added once.
    expect(await count('donations')).toBe(1);
    expect(await count('donation_items')).toBe(1);
    expect(await count('stock_movements')).toBe(1);
    expect(await stockOnHand()).toBe(5);
  });

  it('five retries at once still commit exactly once', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => asUser(i % 2 ? manager : admin).post(`${BASE}/${pendingId}/retry-commit`)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await count('donations')).toBe(1);
    expect(await stockOnHand()).toBe(5);
  });

  it('refuses a retry once it has committed, and adds no more stock', async () => {
    await asUser(manager).post(`${BASE}/${pendingId}/retry-commit`);
    const again = await asUser(manager).post(`${BASE}/${pendingId}/retry-commit`);
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/current status is 'committed'/);
    expect(await stockOnHand()).toBe(5);
  });

  it('says 404 for a donation that does not exist', async () => {
    const res = await asUser(manager).post(`${BASE}/99999/retry-commit`);
    expect(res.status).toBe(404);
  });

  it('repairs commit_incomplete by linking items, without creating a second donation', async () => {
    // First save really did create the donation; only the linking was left.
    const first = await asUser(manager).post(`${BASE}/${pendingId}/retry-commit`);
    expect(first.status).toBe(200);
    const { rows: [{ committed_donation_id: donationId }] } = await q(
      'SELECT committed_donation_id FROM pending_donations WHERE id = $1', [pendingId],
    );
    await q(`UPDATE pending_donations SET status = 'commit_incomplete' WHERE id = $1`, [pendingId]);
    await q(`UPDATE pending_donation_items SET status = 'resolved', committed_donation_item_id = NULL WHERE pending_donation_id = $1`, [pendingId]);

    const [a, b] = await Promise.all([
      asUser(manager).post(`${BASE}/${pendingId}/retry-commit`),
      asUser(admin).post(`${BASE}/${pendingId}/retry-commit`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await count('donations')).toBe(1);
    expect(await stockOnHand()).toBe(5);
    const { rows } = await q('SELECT status, committed_donation_id FROM pending_donations WHERE id = $1', [pendingId]);
    expect(rows[0]).toMatchObject({ status: 'committed', committed_donation_id: donationId });
  });

  describe('the lists, as a manager', () => {
    it('GET /pending answers', async () => {
      await q(`UPDATE pending_donations SET status = 'awaiting_resolution' WHERE id = $1`, [pendingId]);
      const res = await asUser(manager).get(BASE);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p) => p.id)).toEqual([pendingId]);
    });

    it('GET /pending/reconciliation answers with the failed and incomplete ones', async () => {
      const res = await asUser(manager).get(`${BASE}/reconciliation`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p) => p.id)).toEqual([pendingId]);
    });

    it('a warehouse worker is still refused', async () => {
      expect((await asUser(worker).get(BASE)).status).toBe(403);
      expect((await asUser(worker).get(`${BASE}/reconciliation`)).status).toBe(403);
      expect((await asUser(worker).post(`${BASE}/${pendingId}/retry-commit`)).status).toBe(403);
    });
  });
});

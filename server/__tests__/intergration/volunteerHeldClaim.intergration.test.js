// ─────────────────────────────────────────────────────────────
// server/__tests__/intergration/volunteerHeldClaim.intergration.test.js
//
// A pallet a guest volunteer is packing, against a REAL Postgres, through
// the real picking router: POST /:id/assign and GET /.
//
// The gap: assignSlip only looked at assigned_to, so a worker could claim
// a pallet a volunteer held (assigned_volunteer_id) and leave two holders.
// And the board never returned the volunteer, so the pallet read as
// unassigned.
//
// RUN IT AGAINST A LOCAL DATABASE ONLY. It SKIPS unless DATABASE_URL
// points at localhost, and removes only the rows it made:
//
//   DATABASE_URL=postgres://postgres@localhost:55432/wmstest DB_SSL=false JWT_SECRET=x \
//     npm run test:integration -- volunteerHeldClaim
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// SKIPS, never fails, unless DATABASE_URL points at a LOCAL database.
const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

let pool, app, authCookie;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ authCookie } = await import('../helpers/testAuth.js'));
  const { buildPickingApp } = await import('../helpers/pickingApp.js');
  app = buildPickingApp();
}

const DAY = '2099-03-05';
const made = { users: [], ecds: [], slips: [], vols: [] };
const uniq = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

let worker, manager;

const addUser = async (role) => {
  const { rows } = await pool.query(
    `INSERT INTO users (username, first_name, last_name, password_hash, role)
     VALUES ($1, 'Itest', $2, 'x', $2) RETURNING id, role, username`,
    [`itest_${role}_${uniq()}`, role],
  );
  made.users.push(rows[0].id);
  return rows[0];
};

// A pallet on DAY, optionally held by a volunteer (a first and last name).
const pallet = async ({ volunteerName } = {}) => {
  const ecd = await pool.query(
    `INSERT INTO ecd_centres (name, cohort) VALUES ($1, 'tuesday') RETURNING id`,
    [`itest ecd ${uniq()}`],
  );
  made.ecds.push(ecd.rows[0].id);
  let volunteerId = null;
  if (volunteerName) {
    const v = await pool.query('INSERT INTO volunteers (full_name) VALUES ($1) RETURNING id', [volunteerName]);
    volunteerId = v.rows[0].id;
    made.vols.push(volunteerId);
  }
  const slip = await pool.query(
    `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, status, assigned_volunteer_id)
     VALUES ($1, $2, 'tuesday', $3, $4) RETURNING id`,
    [ecd.rows[0].id, DAY, volunteerId ? 'in_progress' : 'pending', volunteerId],
  );
  made.slips.push(slip.rows[0].id);
  return slip.rows[0].id;
};

const row = async (id) => (await pool.query(
  'SELECT status, assigned_to, assigned_volunteer_id FROM picking_slips WHERE id = $1', [id],
)).rows[0];

const assign = (user, id, body = {}) =>
  request(app).post(`/api/picking/${id}/assign`).set('Cookie', authCookie(user)).send(body);
const board = (user) =>
  request(app).get(`/api/picking?dispatchDate=${DAY}`).set('Cookie', authCookie(user));

describe.skipIf(!LOCAL)('a pallet a volunteer is packing, against a real database', () => {
  beforeAll(async () => {
    worker = await addUser('warehouse_worker');
    manager = await addUser('manager');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM picking_events WHERE picking_slip_id = ANY($1)', [made.slips]);
    await pool.query('DELETE FROM picking_slips WHERE id = ANY($1)', [made.slips]);
    await pool.query('DELETE FROM ecd_centres WHERE id = ANY($1)', [made.ecds]);
    await pool.query('DELETE FROM volunteers WHERE id = ANY($1)', [made.vols]);
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [made.users]);
    await pool.end();
  });

  it('refuses a worker claiming it, and changes nothing', async () => {
    const id = await pallet({ volunteerName: 'Thandi Mokoena' });
    const res = await assign(worker, id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('A volunteer is packing this pallet.');
    const after = await row(id);
    expect(after.assigned_to).toBeNull();
    expect(after.assigned_volunteer_id).not.toBeNull();
  });

  it('lets a manager override take it: the volunteer is cleared in the same step', async () => {
    const id = await pallet({ volunteerName: 'Pieter Botha' });
    const res = await assign(manager, id, { packerId: worker.id });
    expect(res.status).toBe(200);
    const after = await row(id);
    expect(after).toMatchObject({ status: 'in_progress', assigned_to: worker.id, assigned_volunteer_id: null });
    const { rows } = await pool.query(
      `SELECT detail FROM picking_events WHERE picking_slip_id = $1 AND event_type = 'assigned'`, [id],
    );
    expect(rows[0].detail).toMatchObject({ packer_id: worker.id });
    expect(rows[0].detail.taken_from_volunteer_id).toBeDefined();
  });

  it('still lets a worker claim a pallet nobody holds', async () => {
    const id = await pallet();
    const res = await assign(worker, id);
    expect(res.status).toBe(200);
    expect(await row(id)).toMatchObject({ assigned_to: worker.id, assigned_volunteer_id: null });
  });

  it('shows the volunteer on the board, first name only', async () => {
    const held = await pallet({ volunteerName: 'Lerato Dlamini' });
    const free = await pallet();
    const res = await board(manager);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((s) => [s.id, s]));
    expect(byId[held].volunteer_name).toBe('Lerato');
    expect(byId[held].assigned_volunteer_id).not.toBeNull();
    expect(byId[held].packer_name).toBeNull();
    expect(byId[free].volunteer_name).toBeNull();
    expect(byId[free].assigned_volunteer_id).toBeNull();
  });

  it('shows the volunteer on the single-pallet read too', async () => {
    const id = await pallet({ volunteerName: 'Sipho Khumalo' });
    const res = await request(app).get(`/api/picking/${id}`).set('Cookie', authCookie(worker));
    expect(res.status).toBe(200);
    expect(res.body.data.volunteer_name).toBe('Sipho');
  });
});

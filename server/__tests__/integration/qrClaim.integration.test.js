// ─────────────────────────────────────────────────────────────
// server/__tests__/integration/qrClaim.integration.test.js
//
// Real SQL for the QR claim: a volunteer arriving by QR is created in the
// same transaction as the claim, a guest holds one pallet at a time, and
// release and sign-out free every pallet a guest holds.
//
// SKIPS unless DATABASE_URL points at localhost: the live database is
// production and must never be written to by a test.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const url = process.env.DATABASE_URL || '';
const isLocal = /^postgres(ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1)[:/]/.test(url);

const suite = isLocal ? describe : describe.skip;

suite('QR claim (real SQL)', () => {
  let pool, slipAccessService, slipAccessRepo;
  const DAY = '2099-04-05';
  const PREFIX = 'itest qr ';
  const made = { ecds: [], slips: [], vols: [], products: [] };
  const uniq = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const volunteer = async (name) => {
    const { rows } = await pool.query(
      `INSERT INTO volunteers (full_name) VALUES ($1) RETURNING id`, [`${PREFIX}${name}`]);
    made.vols.push(rows[0].id);
    return String(rows[0].id);
  };

  const pallet = async (status = 'pending') => {
    const ecd = await pool.query(
      `INSERT INTO ecd_centres (name, cohort) VALUES ($1, 'week1') RETURNING id`, [`itest ecd ${uniq()}`]);
    made.ecds.push(ecd.rows[0].id);
    const slip = await pool.query(
      `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, status)
       VALUES ($1, $2, 'week1', $3) RETURNING id, public_token`, [ecd.rows[0].id, DAY, status]);
    made.slips.push(slip.rows[0].id);
    const p = await pool.query(
      `INSERT INTO products (name, stock_keeping_unit) VALUES ($1, $2) RETURNING id`,
      [`itest product ${uniq()}`, `IT-${uniq()}`]);
    made.products.push(p.rows[0].id);
    await pool.query(
      `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
       VALUES ($1, $2, 5, 'kg')`, [slip.rows[0].id, p.rows[0].id]);
    return { slipId: slip.rows[0].id, token: slip.rows[0].public_token };
  };

  const row = async (slipId) =>
    (await pool.query(
      `SELECT status, assigned_volunteer_id::text AS assigned_volunteer_id, assigned_to
         FROM picking_slips WHERE id = $1`, [slipId])).rows[0];

  const volunteersNamed = async (name) =>
    Number((await pool.query(
      `SELECT COUNT(*) FROM volunteers WHERE full_name = $1`, [name])).rows[0].count);

  beforeAll(async () => {
    pool = (await import('../../src/config/db.js')).default;
    slipAccessService = (await import('../../src/services/slipAccess.service.js')).default;
    slipAccessRepo = (await import('../../src/repositories/slipAccess.repository.js')).default;
  });

  afterAll(async () => {
    if (!pool) return;
    if (made.slips.length) {
      await pool.query(`DELETE FROM picking_events WHERE picking_slip_id = ANY($1)`, [made.slips]);
      await pool.query(`DELETE FROM picking_slip_items WHERE picking_slip_id = ANY($1)`, [made.slips]);
      await pool.query(`DELETE FROM picking_slips WHERE id = ANY($1)`, [made.slips]);
    }
    if (made.vols.length) await pool.query(`DELETE FROM volunteers WHERE id = ANY($1)`, [made.vols]);
    await pool.query(`DELETE FROM volunteers WHERE full_name LIKE $1`, [`${PREFIX}%`]);
    if (made.ecds.length) await pool.query(`DELETE FROM ecd_centres WHERE id = ANY($1)`, [made.ecds]);
    if (made.products.length) await pool.query(`DELETE FROM products WHERE id = ANY($1)`, [made.products]);
    await pool.end();
  });

  it('creates the volunteer and claims the slip together', async () => {
    const { slipId, token } = await pallet();
    const { volunteer: v, slip } = await slipAccessService.claim({ token, name: `${PREFIX}scanner` });
    made.vols.push(v.id);

    expect(slip.status).toBe('in_progress');
    expect(await row(slipId)).toMatchObject({ status: 'in_progress', assigned_volunteer_id: String(v.id) });
  });

  it.each(['complete', 'cancelled', 'dispatched'])(
    'leaves no volunteer row behind when the claim is refused: %s pallet',
    async (status) => {
      const { token } = await pallet(status);
      const name = `${PREFIX}refused ${status}`;
      await expect(slipAccessService.claim({ token, name })).rejects.toMatchObject({ status: 409 });
      expect(await volunteersNamed(name)).toBe(0);
    },
  );

  it('leaves no volunteer row behind when another guest holds the pallet', async () => {
    const holder = await volunteer('holder');
    const { slipId, token } = await pallet();
    await slipAccessRepo.claimForVolunteer({ slipId, volunteerId: holder });

    const name = `${PREFIX}latecomer`;
    await expect(slipAccessService.claim({ token, name })).rejects.toMatchObject({ status: 409 });
    expect(await volunteersNamed(name)).toBe(0);
    expect(await row(slipId)).toMatchObject({ assigned_volunteer_id: holder });
  });

  it('leaves no volunteer row behind when a worker holds the pallet', async () => {
    const staff = await pool.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    if (!staff.rows[0]) return;                      // no staff account to hold it with
    const { slipId, token } = await pallet();
    await pool.query(`UPDATE picking_slips SET assigned_to = $1, status = 'in_progress' WHERE id = $2`,
      [staff.rows[0].id, slipId]);

    const name = `${PREFIX}blocked`;
    await expect(slipAccessService.claim({ token, name })).rejects.toMatchObject({ status: 409 });
    expect(await volunteersNamed(name)).toBe(0);
  });

  it('refuses a second pallet for a guest who holds one, and leaves both as they were', async () => {
    const a = await volunteer('one-only');
    const first = await pallet();
    const second = await pallet();
    await slipAccessRepo.claimForVolunteer({ slipId: first.slipId, volunteerId: a });

    await expect(slipAccessService.claim({ token: second.token, existingVolunteerId: a }))
      .rejects.toMatchObject({ status: 409, alreadyHolding: true });
    await expect(slipAccessService.claimById({ id: a }, second.slipId))
      .rejects.toMatchObject({ status: 409, alreadyHolding: true });

    expect(await row(first.slipId)).toMatchObject({ status: 'in_progress', assigned_volunteer_id: a });
    expect(await row(second.slipId)).toMatchObject({ status: 'pending', assigned_volunteer_id: null });
  });

  it('lets a guest re-scan the pallet they already hold', async () => {
    const a = await volunteer('rescan');
    const { slipId, token } = await pallet();
    await slipAccessService.claim({ token, existingVolunteerId: a });
    const again = await slipAccessService.claim({ token, existingVolunteerId: a });

    expect(again.slip.status).toBe('in_progress');
    expect(await row(slipId)).toMatchObject({ assigned_volunteer_id: a });
  });

  it('lets a guest take another pallet once the first is finished', async () => {
    const a = await volunteer('next');
    const first = await pallet();
    const second = await pallet();
    await slipAccessRepo.claimForVolunteer({ slipId: first.slipId, volunteerId: a });
    await pool.query(`UPDATE picking_slips SET status = 'complete' WHERE id = $1`, [first.slipId]);

    await slipAccessService.claim({ token: second.token, existingVolunteerId: a });
    expect(await row(second.slipId)).toMatchObject({ assigned_volunteer_id: a });
  });

  it('release frees every pallet the guest holds, even when they hold two', async () => {
    const a = await volunteer('two-held');
    const first = await pallet();
    const second = await pallet();
    // Two held, as could exist from before one-per-guest: bypass the claim guard.
    await pool.query(
      `UPDATE picking_slips SET assigned_volunteer_id = $1, status = 'in_progress' WHERE id = ANY($2)`,
      [a, [first.slipId, second.slipId]]);

    const result = await slipAccessService.releaseMySlip({ id: a });
    expect(result.released).toBe(true);
    expect([...result.slipIds].sort()).toEqual([first.slipId, second.slipId].sort());
    expect(await row(first.slipId)).toMatchObject({ status: 'pending', assigned_volunteer_id: null });
    expect(await row(second.slipId)).toMatchObject({ status: 'pending', assigned_volunteer_id: null });
  });

  it('a released pallet can be claimed by the next person', async () => {
    const a = await volunteer('giver');
    const { slipId, token } = await pallet();
    await slipAccessRepo.claimForVolunteer({ slipId, volunteerId: a });
    await slipAccessService.releaseMySlip({ id: a });

    const { volunteer: v } = await slipAccessService.claim({ token, name: `${PREFIX}taker` });
    made.vols.push(v.id);
    expect(await row(slipId)).toMatchObject({ assigned_volunteer_id: String(v.id) });
  });
});

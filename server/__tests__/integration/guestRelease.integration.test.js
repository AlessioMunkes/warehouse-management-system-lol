// ─────────────────────────────────────────────────────────────
// server/__tests__/integration/guestRelease.integration.test.js
//
// Real SQL for handing a guest's pallet back to the floor. The mocked
// suites prove the statement's shape; only a real Postgres proves the
// guard actually refuses, the progress actually survives, and the
// pallet actually shows up where the next person looks.
//
// SKIPS unless DATABASE_URL points at localhost: the live database is
// production and must never be written to by a test.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const url = process.env.DATABASE_URL || '';
const isLocal = /^postgres(ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1)[:/]/.test(url);

const suite = isLocal ? describe : describe.skip;

suite('guest release (real SQL)', () => {
  let pool, slipAccessRepo, slipAccessService, pickingRepository;
  const DAY = '2099-03-04';
  const made = { ecds: [], slips: [], vols: [], products: [] };
  const uniq = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const volunteer = async (name) => {
    const { rows } = await pool.query(
      `INSERT INTO volunteers (full_name) VALUES ($1) RETURNING id`, [`itest ${name}`]);
    made.vols.push(rows[0].id);
    return String(rows[0].id);
  };

  // A fresh pallet with two lines, claimed by `by`.
  const pallet = async ({ by } = {}) => {
    const ecd = await pool.query(
      `INSERT INTO ecd_centres (name, cohort) VALUES ($1, 'week1') RETURNING id`,
      [`itest ecd ${uniq()}`]);
    made.ecds.push(ecd.rows[0].id);
    const slip = await pool.query(
      `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, status)
       VALUES ($1, $2, 'week1', 'pending') RETURNING id`, [ecd.rows[0].id, DAY]);
    const slipId = slip.rows[0].id;
    made.slips.push(slipId);
    const itemIds = [];
    for (const n of ['A', 'B']) {
      const p = await pool.query(
        `INSERT INTO products (name, stock_keeping_unit) VALUES ($1, $2) RETURNING id`,
        [`itest product ${n} ${uniq()}`, `IT-${uniq()}`]);
      made.products.push(p.rows[0].id);
      const item = await pool.query(
        `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
         VALUES ($1, $2, 5, 'kg') RETURNING id`, [slipId, p.rows[0].id]);
      itemIds.push(item.rows[0].id);
    }
    if (by) await slipAccessRepo.claimForVolunteer({ slipId, volunteerId: by });
    return { slipId, itemIds };
  };

  const row = async (slipId) =>
    (await pool.query(
      `SELECT status, assigned_volunteer_id::text AS assigned_volunteer_id, assigned_to
         FROM picking_slips WHERE id = $1`, [slipId])).rows[0];

  beforeAll(async () => {
    pool = (await import('../../src/config/db.js')).default;
    slipAccessRepo = (await import('../../src/repositories/slipAccess.repository.js')).default;
    slipAccessService = (await import('../../src/services/slipAccess.service.js')).default;
    pickingRepository = (await import('../../src/repositories/picking.repository.js')).default;
  });

  afterAll(async () => {
    if (!pool) return;
    if (made.slips.length) {
      await pool.query(`DELETE FROM picking_events WHERE picking_slip_id = ANY($1)`, [made.slips]);
      await pool.query(`DELETE FROM picking_slip_items WHERE picking_slip_id = ANY($1)`, [made.slips]);
      await pool.query(`DELETE FROM picking_slips WHERE id = ANY($1)`, [made.slips]);
    }
    if (made.ecds.length) await pool.query(`DELETE FROM ecd_centres WHERE id = ANY($1)`, [made.ecds]);
    if (made.products.length) await pool.query(`DELETE FROM products WHERE id = ANY($1)`, [made.products]);
    if (made.vols.length) await pool.query(`DELETE FROM volunteers WHERE id = ANY($1)`, [made.vols]);
    await pool.end();
  });

  it('releases the guest own pallet and keeps every item as it was', async () => {
    const a = await volunteer('a');
    const { slipId, itemIds } = await pallet({ by: a });
    await pickingRepository.setItemStatus({
      slipId, itemId: itemIds[0], status: 'confirmed', packedQuantity: 5,
      actor: { type: 'volunteer', id: a },
    });

    const result = await slipAccessService.releaseMySlip({ id: a });
    expect(result).toEqual({ released: true, slipId });

    expect(await row(slipId)).toMatchObject({ status: 'pending', assigned_volunteer_id: null, assigned_to: null });
    const items = (await pool.query(
      `SELECT id, status, packed_quantity FROM picking_slip_items WHERE picking_slip_id = $1 ORDER BY id`, [slipId])).rows;
    expect(items[0]).toMatchObject({ status: 'confirmed' });
    expect(Number(items[0].packed_quantity)).toBe(5);
    expect(items[1]).toMatchObject({ status: 'pending' });
  });

  it('cannot release a pallet someone else holds', async () => {
    const a = await volunteer('a2');
    const b = await volunteer('b2');
    const { slipId } = await pallet({ by: a });

    expect(await slipAccessService.releaseMySlip({ id: b })).toEqual({ released: false });
    expect(await row(slipId)).toMatchObject({ status: 'in_progress', assigned_volunteer_id: a });
  });

  it('cannot release a completed pallet', async () => {
    const a = await volunteer('a3');
    const { slipId } = await pallet({ by: a });
    await pool.query(`UPDATE picking_slips SET status = 'complete' WHERE id = $1`, [slipId]);

    expect(await slipAccessService.releaseMySlip({ id: a })).toEqual({ released: false });
    expect(await row(slipId)).toMatchObject({ status: 'complete', assigned_volunteer_id: a });
  });

  it('a released pallet is on the guest list and the workers floor list', async () => {
    const a = await volunteer('a4');
    const { slipId } = await pallet({ by: a });

    const before = await slipAccessRepo.listUnclaimedForDate(DAY);
    expect(before.map((s) => s.id)).not.toContain(slipId);

    await slipAccessService.releaseMySlip({ id: a });

    const guestList = await slipAccessRepo.listUnclaimedForDate(DAY);
    expect(guestList.map((s) => s.id)).toContain(slipId);

    const floor = await pickingRepository.getSlips({ dispatchDate: DAY, status: 'pending' });
    expect(floor.map((s) => s.id)).toContain(slipId);
  });

  it('the next volunteer resumes from the first pending item', async () => {
    const a = await volunteer('a5');
    const b = await volunteer('b5');
    const { slipId, itemIds } = await pallet({ by: a });
    await pickingRepository.setItemStatus({
      slipId, itemId: itemIds[0], status: 'confirmed', packedQuantity: 5,
      actor: { type: 'volunteer', id: a },
    });
    await slipAccessService.releaseMySlip({ id: a });

    await slipAccessRepo.claimForVolunteer({ slipId, volunteerId: b });
    const mine = await slipAccessService.getMySlip({ id: b });
    const firstPending = mine.items.find((i) => i.status === 'pending');
    expect(firstPending.id).toBe(itemIds[1]);
    expect(mine.items.find((i) => i.id === itemIds[0]).status).toBe('confirmed');
  });

  it('releasing twice is harmless', async () => {
    const a = await volunteer('a6');
    await pallet({ by: a });
    expect((await slipAccessService.releaseMySlip({ id: a })).released).toBe(true);
    expect(await slipAccessService.releaseMySlip({ id: a })).toEqual({ released: false });
  });

  it('a manager release frees a pallet a guest walked away from', async () => {
    const a = await volunteer('a7');
    const { slipId } = await pallet({ by: a });

    const result = await pickingRepository.releaseSlip({ slipId, actorId: null });
    expect(result.slip).toBeTruthy();
    expect(await row(slipId)).toMatchObject({ status: 'pending', assigned_volunteer_id: null, assigned_to: null });
    const open = await slipAccessRepo.listUnclaimedForDate(DAY);
    expect(open.map((s) => s.id)).toContain(slipId);
  });
});

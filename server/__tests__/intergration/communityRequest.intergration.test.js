// ─────────────────────────────────────────────────────────────
// server/__tests__/intergration/communityRequest.intergration.test.js
//
// Benevolent requests against a REAL Postgres: the SQL the mocked unit
// tests cannot see (reservation in Available, the row locks, the
// shortage flag, stock movements), end to end through the real service
// and repositories.
//
// RUN IT AGAINST A LOCAL DATABASE ONLY. It empties the tables it uses
// between tests, so it SKIPS unless DATABASE_URL points at localhost.
// Build one from a schema-only dump, then:
//
//   DATABASE_URL=postgres://postgres@localhost:5432/wmstest DB_SSL=false \
//     npm run test:integration -- communityRequest
//
// Not part of the default run (vitest.config.js excludes this folder).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { resetTables } from '../helpers/resetTables.js';

// SKIPS, never fails, unless DATABASE_URL points at a LOCAL database:
// these tests empty the tables they use, and nothing from the app (not
// even the connection pool) is imported otherwise, so a run against
// anything else cannot touch it.
const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

let pool, service, stockRepo, pickingRepo, dashboardRepo;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ default: service } = await import('../../src/services/communityRequest.service.js'));
  ({ default: stockRepo } = await import('../../src/repositories/stock.repository.js'));
  ({ default: pickingRepo } = await import('../../src/repositories/picking.repository.js'));
  ({ default: dashboardRepo } = await import('../../src/repositories/dashboard.repository.js'));
}

const TABLES = [
  'community_request_items', 'community_requests', 'dispatch_event_lines', 'dispatch_events',
  'picking_slip_items', 'picking_slips', 'picking_events', 'stock_movements', 'stock_levels',
  'notifications', 'ecd_centres', 'products', 'users',
];

let manager, admin, worker, worker2;
let rice, beans;
let ecdId;

const q = (sql, params) => pool.query(sql, params);

const addUser = async (username, role) => {
  const { rows } = await q(
    `INSERT INTO users (username, first_name, last_name, password_hash, role)
     VALUES ($1, $2, 'Test', 'x', $3) RETURNING id, role`,
    [username, username, role],
  );
  return { id: rows[0].id, role: rows[0].role };
};

const addProduct = async (name, onHand, unit = 'kg') => {
  const { rows } = await q(
    `INSERT INTO products (name, stock_keeping_unit) VALUES ($1, $2) RETURNING id`,
    [name, `SKU-${name}`],
  );
  await q(
    `INSERT INTO stock_levels (product_id, quantity_on_hand, unit) VALUES ($1, $2, $3)`,
    [rows[0].id, onHand, unit],
  );
  return rows[0].id;
};

const onHand = async (productId) =>
  Number((await q('SELECT quantity_on_hand FROM stock_levels WHERE product_id = $1', [productId])).rows[0].quantity_on_hand);

// What Inventory shows for one product.
const manifest = async (productId) => {
  const row = (await stockRepo.getManifest()).find((r) => r.id === productId);
  return { onHand: Number(row.quantity_on_hand), committed: Number(row.committed), available: Number(row.available) };
};

const log = (over = {}) =>
  service.createRequest({ itemsRequested: 'Rice and beans', callerName: 'Sister Agnes', ...over }, worker);

const approved = async (items, who = manager) => {
  const r = await log();
  await service.approve(r.id, { items }, who);
  return r.id;
};

// A packed pallet needing `qty` of a product, closed through the real
// completeSlip (so its packing check and the shortage hook both run).
let slipCount = 0;
const packPallet = async (productId, qty) => {
  slipCount += 1;
  const slip = (await q(
    `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, status, assigned_to)
     VALUES ($1, CURRENT_DATE + $2::int, 'tuesday', 'in_progress', $3) RETURNING id`,
    [ecdId, slipCount, worker.id],
  )).rows[0].id;
  await q(
    `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit, packed_quantity, status)
     VALUES ($1, $2, $3, 'kg', $3, 'confirmed')`,
    [slip, productId, qty],
  );
  return pickingRepo.completeSlip({ slipId: slip, actorId: worker.id, actor: worker, canOverride: true });
};

const request = async (id) => service.getRequest(id);
const notifications = async () =>
  (await q(`SELECT * FROM notifications WHERE type = 'community_request_items_short' ORDER BY id`)).rows;
const rejects = async (promise, status, text) => {
  const err = await promise.then(() => null, (e) => e);
  expect(err, 'expected the call to be refused').not.toBeNull();
  if (status) expect(err.status).toBe(status);
  if (text) expect(err.message).toMatch(text);
};

describe.skipIf(!LOCAL)('benevolent requests against a real database', () => {
  beforeAll(async () => {
    await resetTables(pool, TABLES);
  });
  beforeEach(async () => {
    await resetTables(pool, TABLES);
    manager = await addUser('mgr', 'manager');
    admin   = await addUser('adm', 'admin');
    worker  = await addUser('wrk', 'warehouse_worker');
    worker2 = await addUser('wrk2', 'warehouse_worker');
    rice  = await addProduct('Rice', 10);
    beans = await addProduct('Beans', 10);
    ecdId = (await q(`INSERT INTO ecd_centres (name, cohort) VALUES ('Test ECD', 'tuesday') RETURNING id`)).rows[0].id;
    slipCount = 0;
  });
  afterAll(async () => { await pool.end(); });

  describe('approving sets stock aside', () => {
    it('shows as Committed and lowers Available, but not On hand', async () => {
      await approved([{ productId: rice, quantity: 6 }]);
      expect(await manifest(rice)).toEqual({ onHand: 10, committed: 6, available: 4 });
    });

    it('refuses more than is Available, with a clear message, and writes nothing', async () => {
      const r = await log();
      await rejects(
        service.approve(r.id, { items: [{ productId: rice, quantity: 11 }] }, manager),
        409, /Rice \(10 kg available, 11 kg asked for\)/,
      );
      const after = await request(r.id);
      expect(after.outcome).toBe('pending');
      expect(after.items).toEqual([]);
    });

    it('counts other approved requests against what is Available', async () => {
      await approved([{ productId: rice, quantity: 6 }]);
      const second = await log();
      await rejects(service.approve(second.id, { items: [{ productId: rice, quantity: 5 }] }, manager), 409, /4 kg available/);
      await service.approve(second.id, { items: [{ productId: rice, quantity: 4 }] }, manager);
      expect((await manifest(rice)).available).toBe(0);
    });

    it('counts packed pallets against what is Available', async () => {
      await packPallet(rice, 7);
      const r = await log();
      await rejects(service.approve(r.id, { items: [{ productId: rice, quantity: 4 }] }, manager), 409, /3 kg available/);
    });

    it('two approvals racing for the same stock: only one gets it', async () => {
      const a = await log();
      const b = await log();
      const results = await Promise.allSettled([
        service.approve(a.id, { items: [{ productId: rice, quantity: 6 }] }, manager),
        service.approve(b.id, { items: [{ productId: rice, quantity: 6 }] }, manager),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((x) => x.status === 'rejected')).toHaveLength(1);
      expect((await manifest(rice)).committed).toBe(6);
    });
  });

  describe('declining', () => {
    it('after approval releases the reservation and saves the reason', async () => {
      const id = await approved([{ productId: rice, quantity: 6 }]);
      expect((await manifest(rice)).available).toBe(4);
      const r = await service.decline(id, { reason: 'Caller found another source' }, manager);
      expect(r.outcome).toBe('declined');
      expect(r.outcome_note).toBe('Caller found another source');
      expect(await manifest(rice)).toEqual({ onHand: 10, committed: 0, available: 10 });
    });

    it('works on a request still awaiting approval', async () => {
      const r = await log();
      expect((await service.decline(r.id, { reason: 'Out of area' }, admin)).outcome).toBe('declined');
    });

    it('needs a reason and cannot be done twice', async () => {
      const r = await log();
      await rejects(service.decline(r.id, { reason: '  ' }, manager), 400);
      await service.decline(r.id, { reason: 'No' }, manager);
      await rejects(service.decline(r.id, { reason: 'Again' }, manager), 409);
    });
  });

  describe('confirming what went out', () => {
    it('all released → fulfilled; stock leaves once, with the right movement', async () => {
      const id = await approved([{ productId: rice, quantity: 6 }, { productId: beans, quantity: 3 }]);
      await service.claim(id, worker);
      const r = await service.confirm(id, {}, worker);

      expect(r.outcome).toBe('fulfilled');
      expect(r.items.map((i) => i.quantityReleased)).toEqual([3, 6]); // beans, rice (by name)
      expect(await onHand(rice)).toBe(4);
      expect(await onHand(beans)).toBe(7);

      const moves = (await q(`SELECT product_id, quantity, movement_type, reference_type, reference_id, performed_by
                                FROM stock_movements ORDER BY product_id`)).rows;
      expect(moves).toHaveLength(2);
      for (const m of moves) {
        expect(m.movement_type).toBe('dispatched');
        expect(m.reference_type).toBe('community_request');
        expect(m.reference_id).toBe(id);
        expect(m.performed_by).toBe(worker.id);
        expect(Number(m.quantity)).toBeLessThan(0);
      }
      // The reservation went with the status: Committed is back to 0.
      expect(await manifest(rice)).toEqual({ onHand: 4, committed: 0, available: 4 });
    });

    it('less than approved → partially fulfilled, and only what went out leaves', async () => {
      const id = await approved([{ productId: rice, quantity: 6 }]);
      const r = await service.confirm(id, { items: [{ productId: rice, quantityReleased: 4 }] }, manager);
      expect(r.outcome).toBe('partially_fulfilled');
      expect(await onHand(rice)).toBe(6);
      // The 2 not released are free again.
      expect((await manifest(rice)).available).toBe(6);
    });

    it('cannot release more than approved, or nothing at all', async () => {
      const id = await approved([{ productId: rice, quantity: 6 }]);
      await rejects(service.confirm(id, { items: [{ productId: rice, quantityReleased: 7 }] }, manager), 400, /more than was approved/);
      await rejects(service.confirm(id, { items: [{ productId: rice, quantityReleased: 0 }] }, manager), 400, /decline/);
      expect(await onHand(rice)).toBe(10);
      expect((await request(id)).outcome).toBe('approved');
    });

    it('two confirms at once: only one succeeds and stock leaves once', async () => {
      const id = await approved([{ productId: rice, quantity: 6 }]);
      const results = await Promise.allSettled([
        service.confirm(id, {}, manager),
        service.confirm(id, {}, admin),
      ]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const lost = results.find((x) => x.status === 'rejected');
      expect(lost.reason.status).toBe(409);
      expect(await onHand(rice)).toBe(4);
      expect((await q('SELECT count(*)::int n FROM stock_movements')).rows[0].n).toBe(1);
    });

    it('only the claimer, the assigned packer, or a manager/admin may confirm', async () => {
      const id = await approved([{ productId: rice, quantity: 2 }]);
      await service.claim(id, worker);
      await rejects(service.confirm(id, {}, worker2), 403);
      await service.assign(id, { userId: worker2.id }, manager);
      const r = await service.confirm(id, {}, worker2);
      expect(r.outcome).toBe('fulfilled');
    });
  });

  describe('claiming', () => {
    it('only an approved request, and only one claimer', async () => {
      const pending = await log();
      await rejects(service.claim(pending.id, worker), 409, /approved/);

      const id = await approved([{ productId: rice, quantity: 2 }]);
      const results = await Promise.allSettled([service.claim(id, worker), service.claim(id, worker2)]);
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((x) => x.status === 'rejected').reason.status).toBe(409);
      expect((await request(id)).handled_by).toBeTruthy();
    });
  });

  describe('PALLETS FIRST', () => {
    it('packing a pallet is NOT blocked or warned by a benevolent reservation', async () => {
      // 10 on hand; 8 set aside for a request. The pallet needs 6.
      await approved([{ productId: rice, quantity: 8 }]);
      expect((await manifest(rice)).available).toBe(2);

      const result = await packPallet(rice, 6);
      expect(result.slip.status).toBe('complete');
      expect(result.shortfalls).toBeUndefined(); // the packing check never saw the reservation
    });

    it('then the request gives way: flagged, reservation released, one notification', async () => {
      const id = await approved([{ productId: rice, quantity: 8 }]);
      await packPallet(rice, 6);

      const r = await request(id);
      expect(r.outcome).toBe('approved');
      expect(r.items_short_at).toBeTruthy();
      expect(r.items[0].shortAt).toBeTruthy();
      // 10 on hand - 6 pallet; the request's 8 no longer reserves.
      expect(await manifest(rice)).toEqual({ onHand: 10, committed: 6, available: 4 });

      const notes = await notifications();
      expect(notes).toHaveLength(1);
      expect(notes[0].body).toBe(`Pallet packing used stock set aside for benevolent request #${id}. Choose other items.`);
      expect(notes[0].entity_id).toBe(id);
      expect(notes[0].target_roles).toEqual(['manager', 'admin']);

      // More activity while still flagged: no second notification.
      await packPallet(rice, 1);
      await stockRepo.manualAdjust({ productId: rice, quantityDelta: -1, unit: 'kg', reason: 'Spillage', performedBy: manager.id });
      expect(await notifications()).toHaveLength(1);
    });

    it('flags the MOST RECENTLY approved request first, and only as many as needed', async () => {
      const older = await approved([{ productId: rice, quantity: 4 }]);
      const newer = await approved([{ productId: rice, quantity: 4 }]);
      // 10 on hand, 8 set aside. A pallet of 4 leaves 6 — the newer must give way.
      await packPallet(rice, 4);

      expect((await request(newer)).items_short_at).toBeTruthy();
      expect((await request(older)).items_short_at).toBeNull();
      expect((await notifications()).map((n) => n.entity_id)).toEqual([newer]);
    });

    it('flags both when both have to give way', async () => {
      const older = await approved([{ productId: rice, quantity: 4 }]);
      const newer = await approved([{ productId: rice, quantity: 4 }]);
      await packPallet(rice, 9); // 1 left: neither fits
      expect((await request(newer)).items_short_at).toBeTruthy();
      expect((await request(older)).items_short_at).toBeTruthy();
      expect(await notifications()).toHaveLength(2);
    });

    it('a request is flagged only on the product that ran short; its other line keeps reserving', async () => {
      const id = await approved([{ productId: rice, quantity: 8 }, { productId: beans, quantity: 3 }]);
      await packPallet(rice, 6);
      const r = await request(id);
      const byName = Object.fromEntries(r.items.map((i) => [i.productName, i]));
      expect(byName.Rice.shortAt).toBeTruthy();
      expect(byName.Beans.shortAt).toBeNull();
      expect((await manifest(beans)).committed).toBe(3);
    });

    it('a stock decrease (wastage) flags it too; an increase does not', async () => {
      const id = await approved([{ productId: rice, quantity: 8 }]);
      await stockRepo.manualAdjust({ productId: rice, quantityDelta: 5, unit: 'kg', reason: 'Stock count correction', performedBy: manager.id });
      expect((await request(id)).items_short_at).toBeNull();

      await stockRepo.manualAdjust({ productId: rice, quantityDelta: -9, unit: 'kg', reason: 'Spillage', performedBy: manager.id });
      expect((await request(id)).items_short_at).toBeTruthy();
      expect((await notifications())[0].body).toMatch(/Stock changed/);
    });

    it('a flagged request cannot be claimed or confirmed', async () => {
      const id = await approved([{ productId: rice, quantity: 8 }]);
      await packPallet(rice, 6);
      await rejects(service.claim(id, worker), 409, /needs new items/);
      await rejects(service.confirm(id, {}, manager), 409, /needs new items/);
    });

    it('choosing other items clears the flag, replaces the lines and re-reserves', async () => {
      const id = await approved([{ productId: rice, quantity: 8 }]);
      await packPallet(rice, 6);

      await rejects(service.rechooseItems(id, { items: [{ productId: rice, quantity: 8 }] }, manager), 409, /4 kg available/);
      const r = await service.rechooseItems(id, { items: [{ productId: beans, quantity: 5 }, { productId: rice, quantity: 2 }] }, manager);

      expect(r.items_short_at).toBeNull();
      expect(r.items.every((i) => i.shortAt === null)).toBe(true);
      expect(r.items.map((i) => i.productName).sort()).toEqual(['Beans', 'Rice']);
      expect((await manifest(beans)).committed).toBe(5);
      // Now it can be claimed again.
      await service.claim(id, worker);
    });

    it('only a manager or admin can choose other items', async () => {
      const id = await approved([{ productId: rice, quantity: 2 }]);
      await rejects(service.rechooseItems(id, { items: [{ productId: rice, quantity: 1 }] }, worker), 403);
    });
  });

  describe('Needs attention counts', () => {
    const counts = async () => (await dashboardRepo.getAttention()).communityRequests;

    it('counts awaiting approval, approved-but-unclaimed, and needs-new-items separately', async () => {
      await log();                                                   // awaiting approval
      await approved([{ productId: beans, quantity: 1 }]);           // approved, unclaimed
      const claimed = await approved([{ productId: beans, quantity: 1 }]);
      await service.claim(claimed, worker);                          // approved, claimed: not counted as unclaimed
      const assigned = await approved([{ productId: beans, quantity: 1 }]);
      await service.assign(assigned, { userId: worker2.id }, manager); // approved, assigned: has an owner
      expect(await counts()).toEqual({ pending: 1, unclaimed: 1, needsItems: 0 });
    });

    it('a flagged request moves from unclaimed to needs new items, and back when items are re-chosen', async () => {
      const id = await approved([{ productId: rice, quantity: 8 }]);
      expect(await counts()).toEqual({ pending: 0, unclaimed: 1, needsItems: 0 });

      await packPallet(rice, 6);
      expect(await counts()).toEqual({ pending: 0, unclaimed: 0, needsItems: 1 });

      await service.rechooseItems(id, { items: [{ productId: beans, quantity: 2 }] }, manager);
      expect(await counts()).toEqual({ pending: 0, unclaimed: 1, needsItems: 0 });
    });

    it('closed requests are not counted', async () => {
      const a = await approved([{ productId: beans, quantity: 1 }]);
      await service.decline(a, { reason: 'No' }, manager);
      const b = await approved([{ productId: beans, quantity: 1 }]);
      await service.confirm(b, {}, manager);
      expect(await counts()).toEqual({ pending: 0, unclaimed: 0, needsItems: 0 });
    });
  });

  describe('roles', () => {
    it('only a manager or admin can approve, decline or assign', async () => {
      const r = await log();
      await rejects(service.approve(r.id, { items: [{ productId: rice, quantity: 1 }] }, worker), 403);
      await rejects(service.decline(r.id, { reason: 'No' }, worker), 403);
      const id = await approved([{ productId: rice, quantity: 1 }]);
      await rejects(service.assign(id, { userId: worker.id }, worker), 403);
      expect((await service.assign(id, { userId: worker.id }, admin)).assigned_to).toBe(worker.id);
    });

    it('a pending request cannot be fulfilled without approval (old resolve call)', async () => {
      const r = await log();
      await rejects(service.resolve(r.id, { outcome: 'fulfilled', outcomeNote: 'Gave' }, manager), 400, /Approve the request/);
      expect((await service.resolve(r.id, { outcome: 'declined', outcomeNote: 'No' }, manager)).outcome).toBe('declined');
    });
  });
});

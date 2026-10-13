// ─────────────────────────────────────────────────────────────
// server/__tests__/integration/shelfLots.integration.test.js
//
// Which deliveries are probably still on the shelf, against a REAL
// Postgres: stock is moved with the real write paths (adjustStock), the
// estimate is read back through the loader, and then every consumer of
// it is checked on the same data: the inventory manifest and delivery
// list, the dismissal flow with its audit trail, the daily warning
// sweep, and the reports. A mock never sees the SQL, so this is the
// check that it runs and adds up.
//
// RUN IT AGAINST A LOCAL DATABASE ONLY. It empties the tables it uses,
// so it SKIPS unless DATABASE_URL points at localhost. The database
// needs migration 047 (database/migrations/047_...):
//
//   DATABASE_URL=postgres://postgres@localhost:55432/wmstest DB_SSL=false JWT_SECRET=x \
//     npx vitest run --config vitest.integration.config.js shelfLots
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll } from 'vitest';
import { resetTables } from '../helpers/resetTables.js';

const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

let pool, stockRepo, loadShelfLots, todayInSAST, addDays, dismissals, sweep, reportRepo, insightRepo, loadStockCover;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ default: stockRepo } = await import('../../src/repositories/stock.repository.js'));
  ({ loadShelfLots, todayInSAST } = await import('../../src/repositories/shelfLots.repository.js'));
  ({ addDays } = await import('../../src/features/stock/stockCover.js'));
  ({ default: dismissals } = await import('../../src/services/expiryDismissal.service.js'));
  ({ default: sweep } = await import('../../src/services/expiryWarning.service.js'));
  ({ default: reportRepo } = await import('../../src/repositories/reporting.repository.js'));
  ({ default: insightRepo } = await import('../../src/repositories/reportingInsight.repository.js'));
  ({ loadStockCover } = await import('../../src/repositories/stockCover.repository.js'));
}

const TABLES = [
  'expiry_warning_dismissals', 'notifications', 'audit_log', 'stock_movements', 'delivery_note_items',
  'delivery_notes', 'purchase_order_items', 'purchase_orders', 'suppliers', 'stock_levels', 'products', 'users',
];

const q = (sql, params) => pool.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];
const inDays = (n) => addDays(todayInSAST(), n);

let manager, supplier, order;
const id = {};          // product ids by name
const line = {};        // delivery line ids by name

// A stock change through the real write path, in its own transaction so
// each movement has its own time.
const move = async (productId, quantityDelta, movementType, extra = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await stockRepo.adjustStock(client, { productId, quantityDelta, unit: extra.unit ?? 'kg', movementType, performedBy: manager, ...extra });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// A delivery of one product with a use-by date, received into stock.
const deliver = async (name, productId, quantity, expiresInDays, unit = 'kg') => {
  const note = await one(
    `INSERT INTO delivery_notes (supplier_id, purchase_order_id, delivery_date) VALUES ($1, $2, $3) RETURNING id`,
    [supplier, order, todayInSAST()]);
  const item = await one(
    `INSERT INTO delivery_note_items (delivery_note_id, product_id, received_quantity, unit, expiry_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [note.id, productId, quantity, unit, inDays(expiresInDays)]);
  line[name] = item.id;
  await move(productId, quantity, 'received', { unit, referenceType: 'delivery_note', referenceId: note.id });
};

const lotsOf = async (name) => (await loadShelfLots({ productIds: [id[name]] })).get(id[name]);
const manifestRow = async (name) => (await stockRepo.getManifest()).find((r) => r.id === id[name]);

describe.skipIf(!LOCAL)('the shelf estimate against a real database', () => {
  beforeAll(async () => {
    await resetTables(pool, TABLES);
    manager = (await one(`INSERT INTO users (username, first_name, last_name, password_hash, role)
                          VALUES ('thandi', 'Thandi', 'Mokoena', 'x', 'manager') RETURNING id`)).id;
    supplier = (await one(`INSERT INTO suppliers (name) VALUES ('Cape Mills') RETURNING id`)).id;
    order = (await one(`INSERT INTO purchase_orders (supplier_id, po_number, created_by) VALUES ($1, 'PO-1', $2) RETURNING id`, [supplier, manager])).id;

    const product = async (name, unit, onHand = 0) => {
      id[name] = (await one(
        `INSERT INTO products (name, stock_keeping_unit, default_unit, is_decantable, is_active)
         VALUES ($1, $2, $3, true, true) RETURNING id`, [name, name.toUpperCase(), unit])).id;
      await q('INSERT INTO stock_levels (product_id, quantity_on_hand, unit) VALUES ($1, $2, $3)', [id[name], onHand, unit]);
    };
    await product('Maize meal', 'kg');
    await product('Carrots', 'crate');
    await product('Rice', 'kg', 70);     // 70 kg were on the shelf before the first movement
    await product('Salt', 'kg', 25);     // no expiry on record at all

    // Maize: 100 kg expiring in 5 days, then 50 kg in 20; 100 kg goes out, taken from the first.
    await deliver('maizeA', id['Maize meal'], 100, 5);
    await deliver('maizeB', id['Maize meal'], 50, 20);
    await move(id['Maize meal'], -100, 'dispatched');

    // Carrots: 10 crates in 6 days, 10 in 9; 5 go out: 5 left of the first.
    await deliver('carrotsC', id.Carrots, 10, 6, 'crate');
    await deliver('carrotsD', id.Carrots, 10, 9, 'crate');
    await move(id.Carrots, -5, 'dispatched', { unit: 'crate' });

    // Rice: 70 kg already there, 30 kg received (expires in 4 days), 80 kg out:
    // the 70 go first, then 10 of the delivery: 20 left.
    await deliver('riceR', id.Rice, 30, 4);
    await move(id.Rice, -80, 'dispatched');
  });

  it('works out what is left of each delivery by taking what went out from the oldest', async () => {
    const maize = await lotsOf('Maize meal');
    expect(maize.lots.map((l) => [l.lineId, l.expiryDate, l.received, l.left])).toEqual([[line.maizeB, inDays(20), 50, 50]]);
    expect(maize.usedUp).toBe(1);

    const carrots = await lotsOf('Carrots');
    expect(carrots.lots.map((l) => [l.lineId, l.received, l.left, l.unit])).toEqual([
      [line.carrotsC, 10, 5, 'crate'], [line.carrotsD, 10, 10, 'crate'],
    ]);

    // Stock the ledger never recorded counts as the oldest.
    const rice = await lotsOf('Rice');
    expect(rice.lots.map((l) => [l.lineId, l.received, l.left])).toEqual([[line.riceR, 30, 20]]);
  });

  it('has nothing for a product with no expiry on record', async () => {
    const all = await loadShelfLots();
    expect(all.has(id.Salt)).toBe(false);
    expect([...all.keys()].sort()).toEqual([id['Maize meal'], id.Carrots, id.Rice].sort());
  });

  it('puts the delivery estimated to be left, not the soonest ever received, in the Inventory manifest', async () => {
    // The soonest date ever received for maize is in 5 days, but that delivery is used up.
    expect(await manifestRow('Maize meal')).toMatchObject({ earliest_expiry: inDays(20), earliest_expiry_left: 50 });
    expect(await manifestRow('Carrots')).toMatchObject({ earliest_expiry: inDays(6), earliest_expiry_left: 5 });
    expect(await manifestRow('Salt')).toMatchObject({ earliest_expiry: null });
  });

  it('lists the deliveries on the shelf for the detail panel, with what is left', async () => {
    const rows = await stockRepo.getExpiryBatches(id.Carrots);
    expect(rows.map((r) => [r.id, r.received_quantity, r.quantity_left, r.days_left, r.estimated, r.dismissal])).toEqual([
      [line.carrotsC, 10, 5, 6, true, null], [line.carrotsD, 10, 10, 9, true, null],
    ]);
  });

  it('still runs the stock cover over the same data', async () => {
    const cover = await loadStockCover();
    const maize = cover.items.find((i) => i.name === 'Maize meal');
    expect(maize).toMatchObject({ earliestExpiry: inDays(20) });
  });

  describe('dismissing a warning', () => {
    it('needs a reason, and writes nothing without one', async () => {
      await expect(dismissals.dismiss({ productId: id.Carrots, lineId: line.carrotsC, reason: '   ' }, manager))
        .rejects.toMatchObject({ status: 400 });
      expect((await one('SELECT COUNT(*)::int AS n FROM expiry_warning_dismissals')).n).toBe(0);
    });

    it('refuses another product\'s delivery', async () => {
      await expect(dismissals.dismiss({ productId: id.Rice, lineId: line.carrotsC, reason: 'x' }, manager))
        .rejects.toMatchObject({ status: 404 });
    });

    it('records who, when and why, in the table and the audit log, and the warning stops everywhere', async () => {
      await dismissals.dismiss({ productId: id.Carrots, lineId: line.carrotsC, reason: 'Checked the shelf, all gone' }, manager);

      const row = await one('SELECT * FROM expiry_warning_dismissals');
      expect(row).toMatchObject({ delivery_note_item_id: line.carrotsC, reason: 'Checked the shelf, all gone', dismissed_by: manager, restored_at: null });
      expect(row.dismissed_at).toBeInstanceOf(Date);

      const audit = await one(`SELECT * FROM audit_log WHERE action = 'expiry_warning_dismissed'`);
      expect(audit).toMatchObject({ entity_type: 'delivery_note_item_expiry', entity_id: String(line.carrotsC), actor_id: manager, reason: 'Checked the shelf, all gone' });
      expect(audit.after_data).toMatchObject({ productName: 'Carrots', expiryDate: inDays(6), estimatedLeft: 5, received: 10 });

      // The next delivery becomes the earliest.
      expect(await manifestRow('Carrots')).toMatchObject({ earliest_expiry: inDays(9), earliest_expiry_left: 10 });
      // The panel still lists it, with who dismissed it.
      const [first] = await stockRepo.getExpiryBatches(id.Carrots);
      expect(first.dismissal).toMatchObject({ by_name: 'Thandi Mokoena', reason: 'Checked the shelf, all gone' });
    });

    it('refuses a second dismissal of the same delivery', async () => {
      await expect(dismissals.dismiss({ productId: id.Carrots, lineId: line.carrotsC, reason: 'again' }, manager))
        .rejects.toMatchObject({ status: 409 });
      expect((await one('SELECT COUNT(*)::int AS n FROM expiry_warning_dismissals')).n).toBe(1);
    });

    it('is left out of the daily sweep, and nothing is sent twice', async () => {
      // Within 14 days and live: carrots D (9), rice (4). Within 7: rice. Carrots C is dismissed,
      // maize A is used up, maize B is 20 days off.
      const first = await sweep.runExpiryCheck();
      expect(first).toEqual({ checked: 3, notified: 3 });
      const sent = await q(`SELECT type, entity_id FROM notifications ORDER BY id`);
      expect(sent.rows.map((r) => [r.type, r.entity_id])).toEqual([
        // Soonest first within each window: rice (4 days) before carrots (9).
        ['stock_expiry_warning_2w', line.riceR], ['stock_expiry_warning_2w', line.carrotsD], ['stock_expiry_warning_1w', line.riceR],
      ]);

      expect(await sweep.runExpiryCheck()).toEqual({ checked: 3, notified: 0 });
    });

    it('is left out of the reports', async () => {
      // Within 30 days and live: maize B, carrots D, rice. Carrots C is dismissed.
      const series = await reportRepo.expiringStock({ dimension: 'product' });
      expect(Object.fromEntries(series.map((s) => [s.label, s.value]))).toEqual({ 'Maize meal': 1, Carrots: 1, Rice: 1 });

      const { rows, total } = await insightRepo.stockNearExpiry({ withinDays: 14 });
      expect(rows.map((r) => [r.name, r.days_left, r.quantity, r.received])).toEqual([
        ['Rice', 4, 20, 30], ['Carrots', 9, 10, 10],
      ]);
      expect(total).toBe(2);
    });

    it('comes back when restored, and the history is kept', async () => {
      await dismissals.restore({ productId: id.Carrots, lineId: line.carrotsC }, manager);

      expect(await manifestRow('Carrots')).toMatchObject({ earliest_expiry: inDays(6) });
      const row = await one('SELECT * FROM expiry_warning_dismissals');
      expect(row).toMatchObject({ restored_by: manager });
      expect(row.restored_at).toBeInstanceOf(Date);
      expect((await one(`SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'expiry_warning_restored'`)).n).toBe(1);

      // Never warned about yet, so it is now: once at each window it is inside (14 and 7 days).
      expect(await sweep.runExpiryCheck()).toEqual({ checked: 5, notified: 2 });
      await expect(dismissals.restore({ productId: id.Carrots, lineId: line.carrotsC }, manager))
        .rejects.toMatchObject({ status: 409 });
    });

    it('can be dismissed again after a restore', async () => {
      await dismissals.dismiss({ productId: id.Carrots, lineId: line.carrotsC, reason: 'Second look' }, manager);
      expect((await one(`SELECT COUNT(*)::int AS n FROM expiry_warning_dismissals`)).n).toBe(2);
      expect((await one(`SELECT COUNT(*)::int AS n FROM expiry_warning_dismissals WHERE restored_at IS NULL`)).n).toBe(1);
    });
  });
});

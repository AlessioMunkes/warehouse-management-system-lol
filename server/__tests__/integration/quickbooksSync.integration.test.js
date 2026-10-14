// ─────────────────────────────────────────────────────────────
// server/__tests__/integration/quickbooksSync.integration.test.js
//
// The parts of the QuickBooks connection that are SQL, against a REAL
// Postgres: what the order list says an order is worth, and which
// orders the daily retry picks up.
//
// RUN IT AGAINST A LOCAL DATABASE ONLY. It empties the tables it uses,
// so it SKIPS unless DATABASE_URL points at localhost.
//
//   DATABASE_URL=postgres://postgres@localhost:55432/wmsit DB_SSL=false JWT_SECRET=x \
//     npm run test:integration -- quickbooksSync
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { resetTables } from '../helpers/resetTables.js';

const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

let pool, poRepo, qbRepo;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ default: poRepo } = await import('../../src/repositories/purchaseOrder.repository.js'));
  ({ default: qbRepo } = await import('../../src/repositories/quickbooks.repository.js'));
}

const q = (sql, params) => pool.query(sql, params);

let supplierId, userId, productA, productB;
const addPo = async (poNumber, status = 'approved') => (await q(
  `INSERT INTO purchase_orders (supplier_id, po_number, created_by, status, expected_delivery_date)
   VALUES ($1, $2, $3, $4, CURRENT_DATE + 3) RETURNING id`, [supplierId, poNumber, userId, status])).rows[0].id;
const addLine = (poId, productId, qty, price) => q(
  `INSERT INTO purchase_order_items (purchase_order_id, product_id, expected_quantity, unit_price)
   VALUES ($1, $2, $3, $4)`, [poId, productId, qty, price]);

describe.skipIf(!LOCAL)('QuickBooks and purchase orders (real SQL)', () => {
  beforeAll(async () => {
    await resetTables(pool, ['quickbooks_object_map', 'quickbooks_sync_queue', 'purchase_orders', 'audit_log', 'suppliers', 'products', 'users']);
    userId = (await q(`INSERT INTO users (username, first_name, last_name, password_hash, role)
                       VALUES ('mgr', 'M', 'Test', 'x', 'manager') RETURNING id`)).rows[0].id;
    supplierId = (await q(`INSERT INTO suppliers (name) VALUES ('Acme') RETURNING id`)).rows[0].id;
    productA = (await q(`INSERT INTO products (name, stock_keeping_unit, is_decantable) VALUES ('Rocks', 'SKU-A', true) RETURNING id`)).rows[0].id;
    productB = (await q(`INSERT INTO products (name, stock_keeping_unit, is_decantable) VALUES ('Soil', 'SKU-B', true) RETURNING id`)).rows[0].id;
  });

  beforeEach(async () => {
    await resetTables(pool, ['quickbooks_object_map', 'quickbooks_sync_queue', 'quickbooks_connections', 'purchase_orders', 'audit_log']);
  });

  afterAll(async () => { await pool?.end(); });

  // ── Which orders the daily retry takes up ───────────────────
  const connectedAt = (when) => q(
    `INSERT INTO quickbooks_connections (realm_id, token_type, scope, access_token_encrypted, refresh_token_encrypted, created_at)
     VALUES ('9341458487308561', 'bearer', 'x', 'a', 'r', $1)`, [when]);
  const sendOnRecord = async (poId, state, createdAt = null) => {
    await qbRepo.recordSync(poId, { state, error: state === 'synced' ? null : 'because' });
    if (createdAt) await q(`UPDATE quickbooks_sync_queue SET created_at = $2 WHERE entity_id = $1`, [poId, createdAt]);
  };
  const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);
  const unsent = async () => (await qbRepo.listUnsent(50)).sort((a, b) => a - b);

  describe('the daily retry', () => {
    it('takes up an order approved while connected whose send failed', async () => {
      await connectedAt(hoursAgo(5));
      const id = await addPo('PO-2026-0301');
      await sendOnRecord(id, 'failed', hoursAgo(1));
      expect(await unsent()).toEqual([id]);
    });

    it('does not send a backlog: older approved orders with no send on record are left alone', async () => {
      const old1 = await addPo('PO-2026-0302');
      const old2 = await addPo('PO-2026-0303', 'in_transit');
      await connectedAt(hoursAgo(1));          // connecting is not an event for them
      expect(await unsent()).toEqual([]);
      expect([old1, old2]).toHaveLength(2);
    });

    it('does not take up a failure from before the current connection (a reconnect starts afresh)', async () => {
      const before = await addPo('PO-2026-0304');
      await sendOnRecord(before, 'failed', hoursAgo(10));
      await connectedAt(hoursAgo(2));
      const after = await addPo('PO-2026-0305');
      await sendOnRecord(after, 'failed', hoursAgo(1));
      expect(await unsent()).toEqual([after]);
    });

    it('does not retry an order waiting for a person, or one already sent', async () => {
      await connectedAt(hoursAgo(5));
      const match = await addPo('PO-2026-0306');
      const refused = await addPo('PO-2026-0307');
      const synced = await addPo('PO-2026-0308');
      const sending = await addPo('PO-2026-0309');
      for (const [id, state] of [[match, 'needs_match'], [refused, 'refused'], [synced, 'synced'], [sending, 'sending']]) {
        await sendOnRecord(id, state, hoursAgo(1));
      }
      expect(await unsent()).toEqual([]);
    });

    it('stores a refusal as abandoned, not failed, so nothing retries it', async () => {
      const id = await addPo('PO-2026-0310');
      await qbRepo.recordSync(id, { state: 'refused', error: 'x', detail: { items: ['Rocks'] } });
      const row = (await q(`SELECT status::text AS status, payload FROM quickbooks_sync_queue WHERE entity_id = $1`, [id])).rows[0];
      expect(row.status).toBe('abandoned');
      expect(row.payload).toMatchObject({ state: 'refused', items: ['Rocks'] });
    });

    it('does not take up a failed order that is already linked, or one not yet approved', async () => {
      await connectedAt(hoursAgo(5));
      const linked = await addPo('PO-2026-0311');
      await sendOnRecord(linked, 'failed', hoursAgo(1));
      await q(`INSERT INTO quickbooks_object_map (entity_type, entity_id, qbo_object_type, qbo_id) VALUES ('purchase_order', $1, 'PurchaseOrder', 'QB-1')`, [linked]);
      const pending = await addPo('PO-2026-0312', 'pending');
      await sendOnRecord(pending, 'failed', hoursAgo(1));
      expect(await unsent()).toEqual([]);
    });

    it('starts the connection afresh when the same company is connected again', async () => {
      await connectedAt(hoursAgo(48));
      await qbRepo.saveConnection({
        realmId: '9341458487308561', tokenType: 'bearer', scope: 'x', accessEncrypted: 'a2', refreshEncrypted: 'r2',
        accessExpiresAt: hoursAgo(-1), refreshExpiresAt: hoursAgo(-1000), userId: null,
      });
      const c = await qbRepo.getConnection();
      expect(Date.now() - new Date(c.created_at).getTime()).toBeLessThan(60 * 1000);
    });
  });

  it('values an order as the sum of its lines rounded to the cent', async () => {
    const id = await addPo('PO-2026-0201');
    await addLine(id, productA, 100, 12.5);
    await addLine(id, productB, 2.5, 33.33);   // 83.325 -> 83.33, not 83.32
    const rows = await poRepo.listPurchaseOrders({ limit: 10 });
    expect(Number(rows.find((r) => r.id === id).estimated_value)).toBe(1333.33);
  });

  it('counts an unpriced line as nothing', async () => {
    const id = await addPo('PO-2026-0202');
    await addLine(id, productA, 3, null);
    await addLine(id, productB, 2, 10);
    const rows = await poRepo.listPurchaseOrders({ limit: 10 });
    expect(Number(rows.find((r) => r.id === id).estimated_value)).toBe(20);
  });
});

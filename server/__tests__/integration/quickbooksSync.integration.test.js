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

let pool, poRepo;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ default: poRepo } = await import('../../src/repositories/purchaseOrder.repository.js'));
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
    await resetTables(pool, ['quickbooks_object_map', 'quickbooks_sync_queue', 'purchase_orders', 'audit_log']);
  });

  afterAll(async () => { await pool?.end(); });

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

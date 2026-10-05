// ─────────────────────────────────────────────────────────────
// server/__tests__/intergration/quickbooksImport.intergration.test.js
//
// The QuickBooks links import against a REAL Postgres: the array casts,
// the unnest inserts, the row locks, the unique index and the audit
// rows, end to end through the real service and repository.
//
// RUN IT AGAINST A LOCAL DATABASE ONLY. It empties the tables it uses
// between tests, so it SKIPS unless DATABASE_URL points at localhost.
//
//   DATABASE_URL=postgres://postgres@localhost:55432/wmstest DB_SSL=false JWT_SECRET=x \
//     npm run test:integration -- quickbooksImport
//
// Not part of the default run (vitest.config.js excludes this folder).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { resetTables } from '../helpers/resetTables.js';

const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');

let pool, service;
if (LOCAL) {
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ default: service } = await import('../../src/services/purchaseOrder.service.js'));
}

const q = (sql, params) => pool.query(sql, params);
const pair = (poNumber, quickbooksNumber, overwrite) => ({ poNumber, quickbooksNumber, overwrite });
const statuses = (out) => out.rows.map((r) => r.status);

let supplierId, userId;
const addPo = async (poNumber) => {
  const { rows } = await q(
    `INSERT INTO purchase_orders (supplier_id, po_number, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [supplierId, poNumber, userId]);
  return rows[0].id;
};
const link = (poId, qb) => q(
  `INSERT INTO quickbooks_object_map (entity_type, entity_id, qbo_object_type, qbo_id)
   VALUES ('purchase_order', $1, 'PurchaseOrder', $2)`, [poId, qb]);
const links = async () =>
  (await q(`SELECT po.po_number, qom.qbo_id FROM quickbooks_object_map qom
              JOIN purchase_orders po ON po.id = qom.entity_id ORDER BY po.po_number`)).rows;

let p1, p2, p3;

describe.skipIf(!LOCAL)('QuickBooks links import (real SQL)', () => {
  beforeAll(async () => {
    await resetTables(pool, ['quickbooks_object_map', 'purchase_orders', 'audit_log', 'suppliers', 'users']);
    userId = (await q(`INSERT INTO users (username, first_name, last_name, password_hash, role)
                       VALUES ('mgr', 'M', 'Test', 'x', 'manager') RETURNING id`)).rows[0].id;
    supplierId = (await q(`INSERT INTO suppliers (name) VALUES ('Acme') RETURNING id`)).rows[0].id;
  });

  beforeEach(async () => {
    await resetTables(pool, ['quickbooks_object_map', 'purchase_orders', 'audit_log']);
    p1 = await addPo('PO-2026-0101');
    p2 = await addPo('PO-2026-0102');
    p3 = await addPo('PO-2026-0103');
  });

  afterAll(async () => { await pool?.end(); });

  it('previews every status without writing anything', async () => {
    await link(p2, 'QB-OLD');
    await link(p3, 'QB-3');
    const out = await service.previewQuickbooksImport({ pairs: [
      pair('PO-2026-0101', 'QB-1'),
      pair('PO-2026-0103', 'QB-3'),
      pair('PO-2026-0102', 'QB-2'),
      pair('PO-2026-0101', 'QB-X'),
      pair('PO-2026-9999', 'QB-9'),
    ] });
    // 0101 appears twice → both flagged, only the rest are looked up
    expect(statuses(out)).toEqual(['duplicate', 'unchanged', 'conflict', 'duplicate', 'not_found']);
    expect(out.rows[2]).toMatchObject({ linkedQuickbooksNumber: 'QB-OLD' });
    expect(await links()).toHaveLength(2);
  });

  it('links, then re-uploading the same file changes nothing', async () => {
    const pairs = [pair('PO-2026-0101', 'QB-1'), pair('PO-2026-0102', 'QB-2')];
    const first = await service.applyQuickbooksImport({ pairs }, userId);
    expect(statuses(first)).toEqual(['linked', 'linked']);
    expect(await links()).toEqual([
      { po_number: 'PO-2026-0101', qbo_id: 'QB-1' }, { po_number: 'PO-2026-0102', qbo_id: 'QB-2' }]);

    const again = await service.applyQuickbooksImport({ pairs }, userId);
    expect(statuses(again)).toEqual(['unchanged', 'unchanged']);
    const audits = await q(`SELECT * FROM audit_log WHERE action = 'quickbooks_ref_set'`);
    expect(audits.rows).toHaveLength(2);
    expect(audits.rows[0]).toMatchObject({ entity_type: 'purchase_order', actor_id: userId, reason: 'QuickBooks import' });
  });

  it('skips conflicts by default and overwrites only the ticked ones, auditing the displaced PO', async () => {
    await link(p2, 'QB-OLD');
    await link(p3, 'QB-3');

    const skipped = await service.applyQuickbooksImport({ pairs: [
      pair('PO-2026-0102', 'QB-2'), pair('PO-2026-0101', 'QB-3'),
    ] }, userId);
    expect(statuses(skipped)).toEqual(['skipped_conflict', 'skipped_conflict']);
    expect(await links()).toEqual([
      { po_number: 'PO-2026-0102', qbo_id: 'QB-OLD' }, { po_number: 'PO-2026-0103', qbo_id: 'QB-3' }]);

    const out = await service.applyQuickbooksImport({ pairs: [
      pair('PO-2026-0102', 'QB-2', true), pair('PO-2026-0101', 'QB-3', true),
    ] }, userId);
    expect(statuses(out)).toEqual(['overwritten', 'overwritten']);
    expect(await links()).toEqual([
      { po_number: 'PO-2026-0101', qbo_id: 'QB-3' }, { po_number: 'PO-2026-0102', qbo_id: 'QB-2' }]);

    const cleared = await q(
      `SELECT entity_id, after_data FROM audit_log WHERE action = 'quickbooks_ref_set' ORDER BY entity_id`);
    const forP3 = cleared.rows.find((r) => r.entity_id === String(p3));
    expect(forP3.after_data).toEqual({ quickbooksPoId: null });
  });

  it('re-validates at apply time: a number linked after the preview is a conflict, not overwritten', async () => {
    const pairs = [pair('PO-2026-0101', 'QB-1')];
    expect(statuses(await service.previewQuickbooksImport({ pairs }))).toEqual(['will_link']);
    await link(p3, 'QB-1'); // someone else, between preview and apply
    const out = await service.applyQuickbooksImport({ pairs }, userId);
    expect(statuses(out)).toEqual(['skipped_conflict']);
    expect(await links()).toEqual([{ po_number: 'PO-2026-0103', qbo_id: 'QB-1' }]);
  });

  it('reports a PO that is not there as not found and creates nothing', async () => {
    const out = await service.applyQuickbooksImport({ pairs: [pair('PO-2026-9999', 'QB-9')] }, userId);
    expect(statuses(out)).toEqual(['not_found']);
    expect((await q('SELECT count(*)::int AS n FROM purchase_orders')).rows[0].n).toBe(3);
    expect(await links()).toEqual([]);
  });

  it('rolls back every link when a write fails part-way', async () => {
    // Make the audit insert, which runs after the links were written, fail.
    await q(`CREATE OR REPLACE FUNCTION qb_import_test_fail() RETURNS trigger AS $$
             BEGIN RAISE EXCEPTION 'audit write failed'; END $$ LANGUAGE plpgsql`);
    await q(`CREATE TRIGGER qb_import_test_fail BEFORE INSERT ON audit_log
             FOR EACH ROW EXECUTE FUNCTION qb_import_test_fail()`);
    try {
      await expect(service.applyQuickbooksImport({ pairs: [
        pair('PO-2026-0101', 'QB-1'), pair('PO-2026-0102', 'QB-2'),
      ] }, userId)).rejects.toThrow('audit write failed');
    } finally {
      await q('DROP TRIGGER qb_import_test_fail ON audit_log');
      await q('DROP FUNCTION qb_import_test_fail()');
    }
    expect(await links()).toEqual([]);
    expect((await q('SELECT count(*)::int AS n FROM audit_log')).rows[0].n).toBe(0);
  });

  it('handles a 300-row file in one go', async () => {
    const pairs = [];
    for (let i = 0; i < 300; i++) {
      const n = `PO-2026-${String(2000 + i)}`;
      await addPo(n);
      pairs.push(pair(n, `QB-${i}`));
    }
    const out = await service.applyQuickbooksImport({ pairs }, userId);
    expect(out.counts).toEqual({ linked: 300 });
    expect((await q('SELECT count(*)::int AS n FROM quickbooks_object_map')).rows[0].n).toBe(300);
  });
});

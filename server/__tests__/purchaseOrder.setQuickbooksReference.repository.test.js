// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.setQuickbooksReference.repository.test.js
//
// purchaseOrder.repository.js had no repository-level test file before
// this — createPurchaseOrder's own quickbooks_object_map write was
// never exercised either. This covers only the new write path, the
// same fake-client-records-every-statement approach
// beneficiary.rollbackCohort.repository.test.js uses.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const makeClient = ({ poFound = true } = {}) => {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      const clean = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: clean, params });
      if (/^SELECT id FROM purchase_orders/i.test(clean)) {
        return { rows: poFound ? [{ id: params[0] }] : [] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
};

let client;
const poolMock = { connect: vi.fn(async () => client) };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/purchaseOrder.repository.js');

beforeEach(() => vi.clearAllMocks());

describe('setQuickbooksReference', () => {
  it('deletes any existing link then inserts the new one', async () => {
    client = makeClient();

    await repo.setQuickbooksReference(12, 'PO-99', 3);

    const del = client.calls.find((c) => /^DELETE FROM quickbooks_object_map/i.test(c.sql));
    const ins = client.calls.find((c) => /^INSERT INTO quickbooks_object_map/i.test(c.sql));
    expect(del).toBeDefined();
    expect(ins.params).toEqual([12, 'PO-99']);
    // Delete must run before the insert, or a stale row could survive
    // beside the new one instead of being replaced by it.
    expect(client.calls.indexOf(del)).toBeLessThan(client.calls.indexOf(ins));
  });

  it('only deletes, and does not insert, when clearing the reference', async () => {
    client = makeClient();

    await repo.setQuickbooksReference(12, null, 3);

    expect(client.calls.some((c) => /^DELETE FROM quickbooks_object_map/i.test(c.sql))).toBe(true);
    expect(client.calls.some((c) => /^INSERT INTO quickbooks_object_map/i.test(c.sql))).toBe(false);
  });

  it('writes an audit row for the change', async () => {
    client = makeClient();

    await repo.setQuickbooksReference(12, 'PO-99', 3);

    const audit = client.calls.find((c) => /INSERT INTO audit_log/i.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit.params).toContain('quickbooks_ref_set');
    expect(audit.params).toContain(3);
  });

  it('rolls back and returns false when the purchase order does not exist', async () => {
    client = makeClient({ poFound: false });

    const result = await repo.setQuickbooksReference(999, 'PO-99', 3);

    expect(result).toBe(false);
    expect(client.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((c) => /^DELETE FROM quickbooks_object_map/i.test(c.sql))).toBe(false);
  });

  it('locks the purchase order row before writing', async () => {
    client = makeClient();

    await repo.setQuickbooksReference(12, 'PO-99', 3);

    const select = client.calls.find((c) => /^SELECT id FROM purchase_orders/i.test(c.sql));
    expect(select.sql).toMatch(/FOR UPDATE/);
  });
});

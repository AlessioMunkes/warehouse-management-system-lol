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

describe('setQuickbooksReference — duplicate QuickBooks PO number', () => {
  // The live table has UNIQUE (qbo_object_type, qbo_id) as
  // qbo_map_unique_remote; the second link to one number violates it.
  const duplicateClient = () => {
    const calls = [];
    return {
      calls,
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        const clean = sql.replace(/\s+/g, ' ').trim();
        calls.push({ sql: clean, params });
        if (/^SELECT id FROM purchase_orders/i.test(clean)) return { rows: [{ id: params[0] }] };
        if (/^INSERT INTO quickbooks_object_map/i.test(clean)) {
          throw Object.assign(new Error('duplicate key value'), {
            code: '23505', constraint: 'qbo_map_unique_remote',
          });
        }
        if (/^SELECT po\.po_number/i.test(clean)) return { rows: [{ po_number: 'PO-2026-0101' }] };
        return { rows: [] };
      }),
    };
  };

  it('rolls back and throws a 409 naming the PO that already holds the number', async () => {
    client = duplicateClient();

    await expect(repo.setQuickbooksReference(12, 'QB-500', 3)).rejects.toMatchObject({
      status: 409,
      message: 'QuickBooks PO QB-500 is already linked to PO-2026-0101.',
    });

    const sqls = client.calls.map((c) => c.sql);
    expect(sqls).toContain('ROLLBACK');
    // The lookup for the other PO's number runs after the rollback.
    expect(sqls.indexOf('ROLLBACK')).toBeLessThan(sqls.findIndex((s) => /^SELECT po\.po_number/i.test(s)));
    expect(sqls).not.toContain('COMMIT');
  });

  it('does not treat other unique violations as a duplicate link', async () => {
    client = duplicateClient();
    client.query.mockImplementationOnce(async () => ({ rows: [] })); // BEGIN
    client.query.mockImplementationOnce(async () => { throw Object.assign(new Error('other'), { code: '23505', constraint: 'something_else' }); });

    await expect(repo.setQuickbooksReference(12, 'QB-500', 3)).rejects.toMatchObject({ message: 'other' });
  });
});

describe('getPurchaseOrderById — finance email fields', () => {
  it('selects the status columns and never returns a raw error message', async () => {
    const queries = [];
    poolMock.query = vi.fn(async (sql) => {
      queries.push(sql.replace(/\s+/g, ' '));
      if (/FROM purchase_orders po/i.test(sql)) {
        return { rows: [{
          id: 12, po_number: 'PO-2026-0012',
          finance_email_status: 'failed',
          finance_email_error: 'getaddrinfo ENOTFOUND gmail.googleapis.com',
          finance_email_attempted_at: '2026-10-02T08:00:00.000Z',
        }] };
      }
      return { rows: [] };
    });

    const po = await repo.getPurchaseOrderById(12);

    expect(queries[0]).toMatch(/po\.finance_email_status/);
    expect(queries[0]).toMatch(/po\.finance_email_attempted_at/);
    expect(po.finance_email_error).toBe("Couldn't reach the email service");
  });
});

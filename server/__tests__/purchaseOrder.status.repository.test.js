// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.status.repository.test.js
//
// updatePurchaseOrderStatus: the reason is kept for both statuses that
// need someone (it was only kept for 'returned', so a recorded
// follow-up lost its note), cleared for every other, and the service's
// notice runs on the same client before COMMIT.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
const client = {
  query: vi.fn(async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (/^UPDATE purchase_orders/.test(sql.trim())) return { rows: [{ id: 3, po_number: 'PO-3' }] };
    return { rows: [] };
  }),
  release: vi.fn(),
};
const poolMock = { connect: vi.fn(async () => client), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/purchaseOrder.repository.js');

beforeEach(() => { calls.length = 0; vi.clearAllMocks(); });

const updateParams = () => calls.find((c) => c.sql.startsWith('UPDATE purchase_orders')).params;

describe('updatePurchaseOrderStatus', () => {
  it('keeps the reason on a follow-up', async () => {
    await repo.updatePurchaseOrderStatus(3, 'follow_up_required', 'Supplier not answering');
    expect(updateParams()[2]).toBe('Supplier not answering');
  });

  it('keeps it on a return', async () => {
    await repo.updatePurchaseOrderStatus(3, 'returned', 'Damaged');
    expect(updateParams()[2]).toBe('Damaged');
  });

  it('clears it on any other status, so a reopened order drops the old note', async () => {
    await repo.updatePurchaseOrderStatus(3, 'approved', 'ignored');
    expect(updateParams()[2]).toBeNull();
  });

  it('runs beforeCommit on its own client, before COMMIT', async () => {
    const order = [];
    client.query.mockImplementation(async (sql) => {
      order.push(sql.trim().split(/\s+/)[0]);
      return /^UPDATE/.test(sql.trim()) ? { rows: [{ id: 3, po_number: 'PO-3' }] } : { rows: [] };
    });
    const beforeCommit = vi.fn(async (c) => { expect(c).toBe(client); order.push('NOTICE'); });

    await repo.updatePurchaseOrderStatus(3, 'follow_up_required', 'Late', { beforeCommit });

    expect(beforeCommit).toHaveBeenCalledWith(client, expect.objectContaining({ status: 'follow_up_required', reason: 'Late' }));
    expect(order.indexOf('NOTICE')).toBeLessThan(order.indexOf('COMMIT'));
  });
});

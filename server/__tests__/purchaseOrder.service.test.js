// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.service.test.js
//
// Covers setPurchaseOrderStatus only — the rest of
// purchaseOrder.service.js (createPurchaseOrder, listPurchaseOrders,
// getPurchaseOrder) had no test coverage before this file and
// backfilling it is a separate job. This is the one function that's
// new: the general-purpose status transition PurchaseOrderDetail.jsx's
// Approve button is the first real caller of.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  getPurchaseOrderById:      vi.fn(),
  updatePurchaseOrderStatus: vi.fn(),
  setQuickbooksReference:    vi.fn(),
  listPurchaseOrders:        vi.fn(),
};

vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: repoMock }));

// purchaseOrder.service also emails Finance on create. Both are faked
// so the test never loads Gmail, and through it the database module,
// which exits the process when DATABASE_URL is unset (as in CI).
vi.mock('../src/integrations/email.provider.js', () => ({ default: { send: vi.fn(), sendEmail: vi.fn() } }));
vi.mock('../src/services/finance.service.js', () => ({
  default: { getEmailSettings: vi.fn(async () => ({ recipientEmail: null })) },
}));


const { default: purchaseOrderService, PO_STATUSES } = await import('../src/services/purchaseOrder.service.js');
const { PO_MANUAL_TRANSITIONS } = await import('../src/constants/purchaseOrderStatus.js');

const PO_ID = 12;

const existingPO = (over = {}) => ({
  id: PO_ID, status: 'pending', status_reason: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getPurchaseOrderById.mockResolvedValue(existingPO());
  repoMock.updatePurchaseOrderStatus.mockResolvedValue(existingPO({ status: 'approved' }));
  repoMock.setQuickbooksReference.mockResolvedValue(true);
  repoMock.listPurchaseOrders.mockResolvedValue([]);
});

describe('listPurchaseOrders — limit', () => {
  it('leaves the repository default alone when no limit is asked for', async () => {
    await purchaseOrderService.listPurchaseOrders({});
    expect(repoMock.listPurchaseOrders.mock.calls[0][0]).not.toHaveProperty('limit');
  });

  it('passes a limit the list page asks for', async () => {
    await purchaseOrderService.listPurchaseOrders({ limit: '500' });
    expect(repoMock.listPurchaseOrders).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
  });

  it.each(['0', '501', 'all', '2.5'])('rejects the limit %s with 400', async (limit) => {
    await expect(purchaseOrderService.listPurchaseOrders({ limit })).rejects.toMatchObject({ status: 400 });
    expect(repoMock.listPurchaseOrders).not.toHaveBeenCalled();
  });
});

describe('setPurchaseOrderStatus', () => {
  it('rejects a non-numeric id', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus('abc', { status: 'approved' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unknown status', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'shipped' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts "approved" — the manager Approve button depends on it', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'approved' }))
      .resolves.toBeTruthy();
  });

  it('rejects "received", which the CHECK constraint does not permit', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'received' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('closes an order that is waiting on a follow-up as "completed"', async () => {
    for (const from of ['follow_up_required', 'partially_received']) {
      repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: from }));
      await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'completed' }))
        .resolves.toBeTruthy();
    }
  });

  it('allows every move in PO_MANUAL_TRANSITIONS, and every status has a way in', async () => {
    const reached = new Set(['pending']);                       // where every order starts
    for (const [from, targets] of Object.entries(PO_MANUAL_TRANSITIONS)) {
      for (const status of targets) {
        repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: from }));
        await expect(
          purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status, reason: 'because' })
        ).resolves.toBeTruthy();
        reached.add(status);
      }
    }
    reached.add('partially_received');                          // set by raising a follow-up order
    expect([...reached].sort()).toEqual([...PO_STATUSES].sort());
  });

  it('reopens a part-received order for receiving only while no follow-up order is on its way', async () => {
    // Flagged for follow-up, nothing raised yet: the supplier may still deliver against it.
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'partially_received', follow_up_orders: [] }));
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'approved' })).resolves.toBeTruthy();

    // A follow-up that was returned is not on its way either.
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'partially_received', follow_up_orders: [{ id: 9, po_number: 'PO-2026-0009', status: 'returned' }] }));
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'approved' })).resolves.toBeTruthy();

    // The rest is coming on another order: receiving both would count it twice.
    repoMock.updatePurchaseOrderStatus.mockClear();
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'partially_received', follow_up_orders: [{ id: 9, po_number: 'PO-2026-0009', status: 'approved' }] }));
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'approved' }))
      .rejects.toMatchObject({ status: 409, message: 'The rest of this order is on follow-up order PO-2026-0009. Receive against that order instead.' });
    expect(repoMock.updatePurchaseOrderStatus).not.toHaveBeenCalled();
  });

  it('refuses a move that is not in the table, saying what the order can become', async () => {
    const refused = [
      ['pending', 'completed'], ['pending', 'in_transit'], ['approved', 'pending'], ['approved', 'completed'],
      ['approved', 'partially_received'], ['follow_up_required', 'partially_received'],
      ['completed', 'approved'], ['completed', 'pending'], ['returned', 'approved'], ['partially_received', 'in_transit'],
    ];
    for (const [from, status] of refused) {
      repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: from }));
      await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status, reason: 'because' }))
        .rejects.toMatchObject({ status: from === 'pending' && status === 'follow_up_required' ? 400 : 409 });
    }
    expect(repoMock.updatePurchaseOrderStatus).not.toHaveBeenCalled();

    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'completed' }));
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'approved' }))
      .rejects.toThrow('This order is Completed and is closed. Its status cannot be changed.');
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'pending' }));
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'in_transit' }))
      .rejects.toThrow('An order that is Pending approval cannot be changed to In transit. It can become: Approved.');
  });

  it('requires a reason when marking a PO as returned', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'returned' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts "returned" once a reason is given', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'approved' }));
    await expect(
      purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'returned', reason: 'Damaged in transit' })
    ).resolves.toBeTruthy();
    expect(repoMock.updatePurchaseOrderStatus).toHaveBeenCalledWith(PO_ID, 'returned', 'Damaged in transit', { beforeCommit: expect.any(Function) });
  });

  it('requires a reason for follow_up_required', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'follow_up_required' }))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.updatePurchaseOrderStatus).not.toHaveBeenCalled();
  });

  it('accepts follow_up_required with a reason, and passes the notice to raise', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'approved' }));
    await purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'follow_up_required', reason: 'Late' });
    expect(repoMock.updatePurchaseOrderStatus).toHaveBeenCalledWith(PO_ID, 'follow_up_required', 'Late', { beforeCommit: expect.any(Function) });
  });

  it('refuses a follow-up on an order nobody has approved yet', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'pending' }));
    await expect(
      purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'follow_up_required', reason: 'Late' })
    ).rejects.toMatchObject({ status: 400 });
    expect(repoMock.updatePurchaseOrderStatus).not.toHaveBeenCalled();
  });

  it('does not require a reason for approved', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'approved' }))
      .resolves.toBeTruthy();
  });

  it('404s when the purchase order does not exist', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(null);
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'approved' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('is a no-op (no write) when the status already matches', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'approved' }));
    const result = await purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'approved' });
    expect(repoMock.updatePurchaseOrderStatus).not.toHaveBeenCalled();
    expect(result.status).toBe('approved');
  });
});

describe('setQuickbooksReference', () => {
  it('rejects a non-numeric id', async () => {
    await expect(purchaseOrderService.setQuickbooksReference('abc', { quickbooksPoId: 'PO-1' }, 3))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a reference over 50 characters', async () => {
    await expect(purchaseOrderService.setQuickbooksReference(PO_ID, { quickbooksPoId: 'x'.repeat(51) }, 3))
      .rejects.toMatchObject({ status: 400 });
  });

  it('404s when the purchase order does not exist', async () => {
    repoMock.setQuickbooksReference.mockResolvedValue(false);
    await expect(purchaseOrderService.setQuickbooksReference(PO_ID, { quickbooksPoId: 'PO-1' }, 3))
      .rejects.toMatchObject({ status: 404 });
  });

  it('passes the trimmed reference and acting user through to the repository', async () => {
    await purchaseOrderService.setQuickbooksReference(PO_ID, { quickbooksPoId: '  PO-99  ' }, 3);
    expect(repoMock.setQuickbooksReference).toHaveBeenCalledWith(PO_ID, 'PO-99', 3);
  });

  it('clears the reference when given a blank value, rather than rejecting it', async () => {
    await purchaseOrderService.setQuickbooksReference(PO_ID, { quickbooksPoId: '  ' }, 3);
    expect(repoMock.setQuickbooksReference).toHaveBeenCalledWith(PO_ID, null, 3);
  });

  it('returns the freshly-read purchase order, not a bare acknowledgement', async () => {
    repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ quickbooks_po_id: 'PO-99' }));
    const result = await purchaseOrderService.setQuickbooksReference(PO_ID, { quickbooksPoId: 'PO-99' }, 3);
    expect(result.quickbooks_po_id).toBe('PO-99');
  });
});

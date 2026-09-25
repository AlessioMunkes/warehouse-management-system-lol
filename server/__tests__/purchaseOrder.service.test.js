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
};

vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: repoMock }));

// purchaseOrder.service also emails Finance on create. Both are faked
// so the test never loads Gmail, and through it the database module,
// which exits the process when DATABASE_URL is unset (as in CI).
vi.mock('../src/providers/email.provider.js', () => ({ default: { send: vi.fn(), sendEmail: vi.fn() } }));
vi.mock('../src/services/finance.service.js', () => ({
  default: { getEmailSettings: vi.fn(async () => ({ recipientEmail: null })) },
}));


const { default: purchaseOrderService, PO_STATUSES } = await import('../src/services/purchaseOrder.service.js');

const PO_ID = 12;

const existingPO = (over = {}) => ({
  id: PO_ID, status: 'pending', status_reason: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getPurchaseOrderById.mockResolvedValue(existingPO());
  repoMock.updatePurchaseOrderStatus.mockResolvedValue(existingPO({ status: 'approved' }));
  repoMock.setQuickbooksReference.mockResolvedValue(true);
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

  it('accepts "completed", the fully-received state', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'completed' }))
      .resolves.toBeTruthy();
  });

  it('accepts every current PO_STATUSES value', async () => {
    for (const status of PO_STATUSES) {
      repoMock.getPurchaseOrderById.mockResolvedValue(existingPO({ status: 'pending' }));
      await expect(
        purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status, reason: 'because' })
      ).resolves.toBeTruthy();
    }
  });

  it('requires a reason when marking a PO as returned', async () => {
    await expect(purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'returned' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts "returned" once a reason is given', async () => {
    await expect(
      purchaseOrderService.setPurchaseOrderStatus(PO_ID, { status: 'returned', reason: 'Damaged in transit' })
    ).resolves.toBeTruthy();
    expect(repoMock.updatePurchaseOrderStatus).toHaveBeenCalledWith(PO_ID, 'returned', 'Damaged in transit');
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

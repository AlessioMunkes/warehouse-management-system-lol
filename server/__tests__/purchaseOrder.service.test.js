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
  getPurchaseOrderById:     vi.fn(),
  updatePurchaseOrderStatus: vi.fn(),
};

vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: repoMock }));

const { default: purchaseOrderService, PO_STATUSES } = await import('../src/services/purchaseOrder.service.js');

const PO_ID = 12;

const existingPO = (over = {}) => ({
  id: PO_ID, status: 'pending', status_reason: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getPurchaseOrderById.mockResolvedValue(existingPO());
  repoMock.updatePurchaseOrderStatus.mockResolvedValue(existingPO({ status: 'approved' }));
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

// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.updateDelete.service.test.js
//
// updatePurchaseOrder and deletePurchaseOrder both reuse buildPayload/
// buildItems (already exercised indirectly by whatever covers
// createPurchaseOrder's validation) — what's new here is the repo
// result codes these two turn into HTTP statuses: not_editable,
// not_deletable, has_deliveries, on top of the supplier/product codes
// createPurchaseOrder already has to handle.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  updatePurchaseOrder: vi.fn(),
  deletePurchaseOrder: vi.fn(),
};

vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: repoMock }));

const { default: purchaseOrderService } = await import('../src/services/purchaseOrder.service.js');

const PO_ID = 12;
const VALID_BODY = {
  supplierId: 2,
  expectedDeliveryDate: '2099-01-01',
  items: [{ productId: 5, expectedQuantity: 10 }],
};

beforeEach(() => vi.clearAllMocks());

describe('updatePurchaseOrder', () => {
  it('rejects a non-numeric id without calling the repository', async () => {
    await expect(purchaseOrderService.updatePurchaseOrder('abc', VALID_BODY, 1))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.updatePurchaseOrder).not.toHaveBeenCalled();
  });

  it('runs the same header/line validation createPurchaseOrder does', async () => {
    await expect(purchaseOrderService.updatePurchaseOrder(PO_ID, { ...VALID_BODY, items: [] }, 1))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('at least one line item') });
    expect(repoMock.updatePurchaseOrder).not.toHaveBeenCalled();
  });

  it('turns not_found into a 404', async () => {
    repoMock.updatePurchaseOrder.mockResolvedValue({ ok: false, code: 'not_found' });
    await expect(purchaseOrderService.updatePurchaseOrder(PO_ID, VALID_BODY, 1))
      .rejects.toMatchObject({ status: 404 });
  });

  it('turns not_editable into a 409 naming the current status', async () => {
    repoMock.updatePurchaseOrder.mockResolvedValue({ ok: false, code: 'not_editable', status: 'approved' });
    await expect(purchaseOrderService.updatePurchaseOrder(PO_ID, VALID_BODY, 1))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('"approved"') });
  });

  it('turns supplier_inactive into a 409 naming the supplier', async () => {
    repoMock.updatePurchaseOrder.mockResolvedValue({
      ok: false, code: 'supplier_inactive', supplier: { name: 'Bokomo Foods' },
    });
    await expect(purchaseOrderService.updatePurchaseOrder(PO_ID, VALID_BODY, 1))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('Bokomo Foods') });
  });

  it('turns unknown_products into a 400 carrying missingProductIds', async () => {
    repoMock.updatePurchaseOrder.mockResolvedValue({ ok: false, code: 'unknown_products', missing: [5] });
    await expect(purchaseOrderService.updatePurchaseOrder(PO_ID, VALID_BODY, 1))
      .rejects.toMatchObject({ status: 400, missingProductIds: [5] });
  });

  it('returns the updated purchase order on success', async () => {
    const updated = { id: PO_ID, status: 'pending' };
    repoMock.updatePurchaseOrder.mockResolvedValue({ ok: true, purchaseOrder: updated });
    await expect(purchaseOrderService.updatePurchaseOrder(PO_ID, VALID_BODY, 1))
      .resolves.toEqual(updated);
  });
});

describe('deletePurchaseOrder', () => {
  it('rejects a non-numeric id without calling the repository', async () => {
    await expect(purchaseOrderService.deletePurchaseOrder('abc', 1))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.deletePurchaseOrder).not.toHaveBeenCalled();
  });

  it('turns not_found into a 404', async () => {
    repoMock.deletePurchaseOrder.mockResolvedValue({ ok: false, code: 'not_found' });
    await expect(purchaseOrderService.deletePurchaseOrder(PO_ID, 1))
      .rejects.toMatchObject({ status: 404 });
  });

  it('turns not_deletable into a 409 naming the current status', async () => {
    repoMock.deletePurchaseOrder.mockResolvedValue({ ok: false, code: 'not_deletable', status: 'completed' });
    await expect(purchaseOrderService.deletePurchaseOrder(PO_ID, 1))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('"completed"') });
  });

  it('turns has_deliveries into a 409', async () => {
    repoMock.deletePurchaseOrder.mockResolvedValue({ ok: false, code: 'has_deliveries' });
    await expect(purchaseOrderService.deletePurchaseOrder(PO_ID, 1))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('deliveries recorded') });
  });

  it('resolves with nothing on success', async () => {
    repoMock.deletePurchaseOrder.mockResolvedValue({ ok: true });
    await expect(purchaseOrderService.deletePurchaseOrder(PO_ID, 1)).resolves.toBeUndefined();
  });
});

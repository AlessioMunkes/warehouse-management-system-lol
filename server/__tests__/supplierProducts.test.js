// ─────────────────────────────────────────────────────────────
// server/__tests__/supplierProducts.test.js
//
// What a supplier supplies (migration 039): saving the list on a
// supplier, and the rule it puts on a purchase order — a supplier with
// products listed can only be ordered from for those, and a supplier
// with none listed is not restricted.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const supplierRepo = {
  listSuppliers: vi.fn(), getSupplierById: vi.fn(), findSupplierByName: vi.fn(),
  getSupplierStats: vi.fn(), getRecentPurchaseOrders: vi.fn(),
  insertSupplier: vi.fn(), updateSupplier: vi.fn(), setSupplierActive: vi.fn(),
  getSuppliedProductIds: vi.fn(), unknownProducts: vi.fn(), setSuppliedProducts: vi.fn(),
};
const poRepo = { createPurchaseOrder: vi.fn(), updatePurchaseOrder: vi.fn(), getPurchaseOrderById: vi.fn() };

vi.mock('../src/repositories/supplier.repository.js', () => ({ default: supplierRepo }));
vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: poRepo }));
vi.mock('../src/providers/email.provider.js', () => ({ default: { send: vi.fn(), sendEmail: vi.fn() } }));
vi.mock('../src/services/finance.service.js', () => ({
  default: { getEmailSettings: vi.fn(async () => ({ recipientEmail: null })) },
}));

const supplierService = (await import('../src/services/supplier.service.js')).default;
const { default: purchaseOrderService } = await import('../src/services/purchaseOrder.service.js');

const WEMA = { id: 7, name: 'Wema', is_active: true, supplied_products: [] };
const RICE = 1270; const SAMP = 10; const SUGAR = 1274;

// A delivery date that is never in the past.
const nextYear = `${new Date().getFullYear() + 1}-06-15`;
const order = (productIds) => ({
  supplierId: WEMA.id, expectedDeliveryDate: nextYear,
  items: productIds.map((productId) => ({ productId, expectedQuantity: 10 })),
});

beforeEach(() => {
  vi.clearAllMocks();
  supplierRepo.findSupplierByName.mockResolvedValue(null);
  supplierRepo.insertSupplier.mockImplementation(async (p) => ({ id: WEMA.id, ...p, is_active: true }));
  supplierRepo.getSupplierById.mockResolvedValue(WEMA);
  supplierRepo.unknownProducts.mockResolvedValue([]);
  supplierRepo.getSuppliedProductIds.mockResolvedValue([]);
  poRepo.createPurchaseOrder.mockResolvedValue({ ok: true, purchaseOrder: { id: 1, items: [] } });
  poRepo.updatePurchaseOrder.mockResolvedValue({ ok: true, purchaseOrder: { id: 1, items: [] } });
});

describe('a supplier’s products', () => {
  it('saves the ticked products when a supplier is registered', async () => {
    await supplierService.registerSupplier({ name: 'Wema', productIds: [RICE, SAMP, RICE] }, 2);
    expect(supplierRepo.setSuppliedProducts).toHaveBeenCalledWith(WEMA.id, [RICE, SAMP]);
  });

  it('registers a supplier with nothing ticked, and writes no list', async () => {
    await supplierService.registerSupplier({ name: 'Legit Doors', category: 'Roller doors' }, 2);
    expect(supplierRepo.insertSupplier).toHaveBeenCalledTimes(1);
    expect(supplierRepo.setSuppliedProducts).not.toHaveBeenCalled();
  });

  it('replaces the list on edit, and counts that as a change on its own', async () => {
    await supplierService.updateSupplier(WEMA.id, { productIds: [SAMP] }, 2);
    expect(supplierRepo.setSuppliedProducts).toHaveBeenCalledWith(WEMA.id, [SAMP]);
    expect(supplierRepo.updateSupplier).not.toHaveBeenCalled();
  });

  it('clears the list when every product is unticked', async () => {
    await supplierService.updateSupplier(WEMA.id, { productIds: [] }, 2);
    expect(supplierRepo.setSuppliedProducts).toHaveBeenCalledWith(WEMA.id, []);
  });

  it('leaves the list alone when an edit does not mention it', async () => {
    await supplierService.updateSupplier(WEMA.id, { category: 'Rice, samp, maize' }, 2);
    expect(supplierRepo.updateSupplier).toHaveBeenCalledTimes(1);
    expect(supplierRepo.setSuppliedProducts).not.toHaveBeenCalled();
  });

  it.each([
    ['not a list', 'rice'],
    ['a bad id', [RICE, 'abc']],
    ['a negative id', [-4]],
  ])('refuses %s', async (_label, productIds) => {
    await expect(supplierService.updateSupplier(WEMA.id, { productIds }, 2)).rejects.toMatchObject({ status: 400 });
    expect(supplierRepo.setSuppliedProducts).not.toHaveBeenCalled();
  });

  it('refuses a product that is archived or gone', async () => {
    supplierRepo.unknownProducts.mockResolvedValue([RICE]);
    await expect(supplierService.updateSupplier(WEMA.id, { productIds: [RICE] }, 2)).rejects.toMatchObject({ status: 400 });
    expect(supplierRepo.setSuppliedProducts).not.toHaveBeenCalled();
  });
});

describe('a purchase order and what its supplier supplies', () => {
  it('takes any product when the supplier has none listed', async () => {
    await purchaseOrderService.createPurchaseOrder(order([RICE, SUGAR]), 2);
    expect(poRepo.createPurchaseOrder).toHaveBeenCalledTimes(1);
  });

  it('takes an order made only of products the supplier supplies', async () => {
    supplierRepo.getSuppliedProductIds.mockResolvedValue([RICE, SAMP]);
    await purchaseOrderService.createPurchaseOrder(order([RICE, SAMP]), 2);
    expect(supplierRepo.getSuppliedProductIds).toHaveBeenCalledWith(WEMA.id);
    expect(poRepo.createPurchaseOrder).toHaveBeenCalledTimes(1);
  });

  it('refuses a product the supplier does not supply, names the line, and writes nothing', async () => {
    supplierRepo.getSuppliedProductIds.mockResolvedValue([RICE, SAMP]);
    await expect(purchaseOrderService.createPurchaseOrder(order([RICE, SUGAR]), 2))
      .rejects.toMatchObject({ status: 400, missingProductIds: [SUGAR] });
    expect(poRepo.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('holds an edit to the same rule', async () => {
    supplierRepo.getSuppliedProductIds.mockResolvedValue([RICE]);
    await expect(purchaseOrderService.updatePurchaseOrder(1, order([SAMP, SUGAR]), 2))
      .rejects.toMatchObject({ status: 400, missingProductIds: [SAMP, SUGAR] });
    expect(poRepo.updatePurchaseOrder).not.toHaveBeenCalled();
  });
});

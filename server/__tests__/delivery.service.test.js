// ─────────────────────────────────────────────────────────────
// server/__tests__/delivery.service.test.js
//
// delivery.repository.js is mocked, so these tests exercise the
// service's own rules. Three things had no coverage at all and were
// all wrong:
//
//   1. The purchase order was never checked against the supplier the
//      note was being written for, nor against its own status.
//   2. There was no idempotency key, so a retried submit from a
//      tablet on a bad connection received the same pallet twice.
//   3. Every failure threw a bare Error, and the controller guessed
//      the status by looking for the word "required" in the message.
//
// Nothing here can catch a constraint violation — pg is mocked. The
// column and its partial unique index come from
// database/migrations/2026-08-19_delivery_idempotency.sql and have to
// be applied before this code runs at all.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  getDeliveries:               vi.fn(),
  getDeliveryById:             vi.fn(),
  findByIdempotencyKey:        vi.fn(),
  getPurchaseOrder:            vi.fn(),
  getPurchaseOrderItems:       vi.fn(),
  createDelivery:              vi.fn(),
  getSuppliers:                vi.fn(),
  getSuppliersWithOpenOrders:  vi.fn(),
  getProducts:                 vi.fn(),
  getPurchaseOrdersBySupplier: vi.fn(),
};

vi.mock('../src/repositories/delivery.repository.js', () => ({ default: repoMock }));

const { default: deliveryService } = await import('../src/services/delivery.service.js');

const USER_ID  = 7;
const KEY      = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const SUPPLIER = 4;
const PO       = 11;

const poItem = (over = {}) => ({
  purchase_order_item_id: 100,
  product_id:             55,
  product_name:           'Rice 10kg',
  expected_quantity:      20,
  expected_weight_kg:     200,
  default_unit:           'bag',
  ...over,
});

const body = (over = {}) => ({
  supplierId:      SUPPLIER,
  deliveryDate:    '2026-08-19',
  purchaseOrderId: PO,
  signatureData:   'received-in-app',
  lineItems:       [{ purchaseOrderItemId: 100, receivedQuantity: 20, overAction: 'accept' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findByIdempotencyKey.mockResolvedValue(null);
  repoMock.getPurchaseOrder.mockResolvedValue({ id: PO, supplier_id: SUPPLIER, status: 'approved' });
  repoMock.getPurchaseOrderItems.mockResolvedValue([poItem()]);
  repoMock.createDelivery.mockResolvedValue({ id: 900, status: 'recorded', warnings: [] });
  repoMock.getDeliveryById.mockResolvedValue({ id: 900, status: 'recorded' });
});

// ── Suppliers — full list vs. open-orders-only ─────────────────
describe('getSuppliers', () => {
  it('returns every supplier by default', async () => {
    repoMock.getSuppliers.mockResolvedValue([{ id: 1, name: 'Everyone' }]);
    const result = await deliveryService.getSuppliers();
    expect(result).toEqual([{ id: 1, name: 'Everyone' }]);
    expect(repoMock.getSuppliersWithOpenOrders).not.toHaveBeenCalled();
  });

  it('narrows to suppliers with an open order when asked', async () => {
    repoMock.getSuppliersWithOpenOrders.mockResolvedValue([{ id: 4, name: 'Ubuntu Bakery Supplies' }]);
    const result = await deliveryService.getSuppliers(true);
    expect(result).toEqual([{ id: 4, name: 'Ubuntu Bakery Supplies' }]);
    expect(repoMock.getSuppliers).not.toHaveBeenCalled();
  });
});

// ── The happy path still works ────────────────────────────────
describe('createDelivery — the ordinary case', () => {
  it('records a matching delivery', async () => {
    const result = await deliveryService.createDelivery(body(), USER_ID);
    expect(result.duplicate).toBe(false);
    expect(result.note.id).toBe(900);
  });

  it('hands back the joined record, not the bare insert row, so the note PDF has what it needs', async () => {
    // The repository's own insert returns only the delivery_notes
    // columns it just wrote; the service re-fetches the full joined
    // shape (supplier name, items, po_status) in the same request
    // rather than making the caller ask for it separately.
    repoMock.getDeliveryById.mockResolvedValue({
      id: 900, status: 'recorded', supplier_name: 'Ubuntu Bakery Supplies', items: [{ product_name: 'Rice 10kg' }],
    });
    const result = await deliveryService.createDelivery(body(), USER_ID);
    expect(repoMock.getDeliveryById).toHaveBeenCalledWith(900);
    expect(result.note.supplier_name).toBe('Ubuntu Bakery Supplies');
    expect(result.note.items).toEqual([{ product_name: 'Rice 10kg' }]);
  });

  it('re-reads product, unit and expected quantity from the order, never the body', async () => {
    // A WORKER can reach this endpoint. If the body could name the
    // product, a crafted request could adjust stock for anything.
    await deliveryService.createDelivery(
      body({ lineItems: [{ purchaseOrderItemId: 100, receivedQuantity: 20, productId: 999, unit: 'crate' }] }),
      USER_ID,
    );
    const line = repoMock.createDelivery.mock.calls[0][0].lineItems[0];
    expect(line.productId).toBe(55);
    expect(line.unit).toBe('bag');
    expect(line.expectedQuantity).toBe(20);
  });

  it('takes receivedBy from the session, not the body', async () => {
    await deliveryService.createDelivery(body({ receivedBy: 999 }), USER_ID);
    expect(repoMock.createDelivery.mock.calls[0][0].receivedBy).toBe(USER_ID);
  });

  it('keeps a rejected surplus out of stock but on the record', async () => {
    await deliveryService.createDelivery(
      body({ lineItems: [{
        purchaseOrderItemId: 100, receivedQuantity: 25,
        overAction: 'reject', discrepancyReason: 'Turned the extra away',
      }] }),
      USER_ID,
    );
    const line = repoMock.createDelivery.mock.calls[0][0].lineItems[0];
    expect(line.receivedQuantity).toBe(25);   // what arrived
    expect(line.acceptedQuantity).toBe(20);   // what goes into stock
  });

  it('flags the note when any line varies', async () => {
    await deliveryService.createDelivery(
      body({ lineItems: [{
        purchaseOrderItemId: 100, receivedQuantity: 18,
        discrepancyReason: 'Short count at receiving',
      }] }),
      USER_ID,
    );
    expect(repoMock.createDelivery.mock.calls[0][0].hasDiscrepancy).toBe(true);
  });
});

// ── The supplier / PO cross-check ─────────────────────────────
describe('createDelivery — the purchase order must match the note', () => {
  // supplierId used to go from the body straight into
  // delivery_notes.supplier_id with nothing comparing it to
  // purchase_orders.supplier_id, so a note could name one supplier
  // while receiving another supplier's order — and every report that
  // joins the two would disagree with itself.
  it('refuses an order belonging to a different supplier', async () => {
    repoMock.getPurchaseOrder.mockResolvedValue({ id: PO, supplier_id: 99, status: 'approved' });
    await expect(deliveryService.createDelivery(body(), USER_ID))
      .rejects.toMatchObject({ status: 409 });
    expect(repoMock.createDelivery).not.toHaveBeenCalled();
  });

  it('says which thing to check, not just that it failed', async () => {
    repoMock.getPurchaseOrder.mockResolvedValue({ id: PO, supplier_id: 99, status: 'approved' });
    await expect(deliveryService.createDelivery(body(), USER_ID))
      .rejects.toThrow(/order number on the delivery note/i);
  });

  it('404s for an order that does not exist', async () => {
    repoMock.getPurchaseOrder.mockResolvedValue(null);
    await expect(deliveryService.createDelivery(body(), USER_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  // A completed PO could be received against again, adding its stock
  // a second time with an ordinary-looking note to show for it.
  it('refuses a completed order and says how to reopen it', async () => {
    repoMock.getPurchaseOrder.mockResolvedValue({ id: PO, supplier_id: SUPPLIER, status: 'completed' });
    await expect(deliveryService.createDelivery(body(), USER_ID))
      .rejects.toMatchObject({ status: 409 });
    await expect(deliveryService.createDelivery(body(), USER_ID))
      .rejects.toThrow(/reopen/i);
    expect(repoMock.createDelivery).not.toHaveBeenCalled();
  });

  it('refuses an order still pending approval', async () => {
    repoMock.getPurchaseOrder.mockResolvedValue({ id: PO, supplier_id: SUPPLIER, status: 'pending' });
    await expect(deliveryService.createDelivery(body(), USER_ID))
      .rejects.toThrow(/not been approved/i);
  });

  // The service check is a courtesy; the repository's is the one that
  // holds, because it runs with the row locked. These prove the
  // service still honours its verdict rather than assuming its own
  // earlier read was final.
  it.each([
    ['purchaseOrderNotFound', 404],
    ['supplierMismatch',      409],
    ['purchaseOrderNotOpen',  409],
  ])('honours the repository verdict %s as a %i', async (flag, status) => {
    repoMock.createDelivery.mockResolvedValue({ [flag]: true });
    await expect(deliveryService.createDelivery(body(), USER_ID))
      .rejects.toMatchObject({ status });
  });
});

// ── Idempotency ───────────────────────────────────────────────
describe('createDelivery — a retry is not a second delivery', () => {
  it('returns the original note without writing anything', async () => {
    repoMock.findByIdempotencyKey.mockResolvedValue({ id: 900 });
    const result = await deliveryService.createDelivery(body({ idempotencyKey: KEY }), USER_ID);
    expect(result.duplicate).toBe(true);
    expect(result.note.id).toBe(900);
    expect(repoMock.createDelivery).not.toHaveBeenCalled();
  });

  it('answers the retry before it even reads the purchase order', async () => {
    repoMock.findByIdempotencyKey.mockResolvedValue({ id: 900 });
    await deliveryService.createDelivery(body({ idempotencyKey: KEY }), USER_ID);
    expect(repoMock.getPurchaseOrder).not.toHaveBeenCalled();
  });

  // Two taps can both get past the read above before either writes.
  // The repository's ON CONFLICT catches that and reports it back.
  it('handles losing the ON CONFLICT race', async () => {
    repoMock.createDelivery.mockResolvedValue({ duplicate: true, deliveryNoteId: 900 });
    const result = await deliveryService.createDelivery(body({ idempotencyKey: KEY }), USER_ID);
    expect(result.duplicate).toBe(true);
    expect(result.note.id).toBe(900);
  });

  it('passes the key down to the repository', async () => {
    await deliveryService.createDelivery(body({ idempotencyKey: KEY }), USER_ID);
    expect(repoMock.createDelivery.mock.calls[0][0].idempotencyKey).toBe(KEY);
  });

  it('still records a delivery when no key is sent', async () => {
    const result = await deliveryService.createDelivery(body(), USER_ID);
    expect(result.duplicate).toBe(false);
    expect(repoMock.createDelivery.mock.calls[0][0].idempotencyKey).toBeNull();
  });

  it.each(['not-a-uuid', '123', '3f2504e0-4f89-41d3-9a0c'])('rejects the malformed key %s', async (key) => {
    await expect(deliveryService.createDelivery(body({ idempotencyKey: key }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });
});

// ── Statuses, not string-matching ─────────────────────────────
describe('createDelivery — every refusal carries a status', () => {
  // These two are the reason this matters. Neither message contains
  // the word "required", so the old controller sent both as 500s.
  it('a line from another order is a 400, not a server fault', async () => {
    await expect(deliveryService.createDelivery(
      body({ lineItems: [{ purchaseOrderItemId: 777, receivedQuantity: 5 }] }), USER_ID,
    )).rejects.toMatchObject({ status: 400 });
  });

  it('a duplicated line is a 400, not a server fault', async () => {
    await expect(deliveryService.createDelivery(
      body({ lineItems: [
        { purchaseOrderItemId: 100, receivedQuantity: 20 },
        { purchaseOrderItemId: 100, receivedQuantity: 20 },
      ] }), USER_ID,
    )).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['supplierId',      'Supplier is required'],
    ['deliveryDate',    'Delivery date is required'],
    ['purchaseOrderId', 'Purchase order is required'],
    ['signatureData',   'Driver signature is required'],
  ])('missing %s is a 400', async (field, message) => {
    const payload = body();
    delete payload[field];
    await expect(deliveryService.createDelivery(payload, USER_ID))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining(message) });
  });

  it('an empty line list is a 400', async () => {
    await expect(deliveryService.createDelivery(body({ lineItems: [] }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('a negative received quantity is a 400', async () => {
    await expect(deliveryService.createDelivery(
      body({ lineItems: [{ purchaseOrderItemId: 100, receivedQuantity: -1 }] }), USER_ID,
    )).rejects.toMatchObject({ status: 400 });
  });

  it('a variance with no reason is a 400 that names the product', async () => {
    await expect(deliveryService.createDelivery(
      body({ lineItems: [{ purchaseOrderItemId: 100, receivedQuantity: 15 }] }), USER_ID,
    )).rejects.toThrow(/Rice 10kg/);
  });

  // These reach foreign keys. Unvalidated they came back as 500s with
  // a Postgres message in the body.
  it.each([['abc'], [0], [-2], [1.5]])('supplierId %p is a 400', async (supplierId) => {
    await expect(deliveryService.createDelivery(body({ supplierId }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it.each([['abc'], [0], [-2]])('purchaseOrderId %p is a 400', async (purchaseOrderId) => {
    await expect(deliveryService.createDelivery(body({ purchaseOrderId }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  // deliveryDate goes to a DATE column. new Date('Mon Aug 17 2026')
  // is a valid Date, which is why it needed a real check.
  it.each(['2026-02-30', 'Mon Aug 17 2026', '19-08-2026', '2026-8-19'])(
    'delivery date %s is a 400',
    async (deliveryDate) => {
      await expect(deliveryService.createDelivery(body({ deliveryDate }), USER_ID))
        .rejects.toMatchObject({ status: 400 });
    },
  );
});

// ── Reads ─────────────────────────────────────────────────────
describe('reads', () => {
  it('404s a missing delivery', async () => {
    repoMock.getDeliveryById.mockResolvedValue(null);
    await expect(deliveryService.getDeliveryById(5)).rejects.toMatchObject({ status: 404 });
  });

  it('400s an invalid delivery id', async () => {
    await expect(deliveryService.getDeliveryById('abc')).rejects.toMatchObject({ status: 400 });
  });

  // 404, not 400: the caller asked for a real order and it has no
  // lines. That is not a malformed request.
  it('404s a purchase order with no lines', async () => {
    repoMock.getPurchaseOrderItems.mockResolvedValue([]);
    await expect(deliveryService.getPurchaseOrderItems(PO)).rejects.toMatchObject({ status: 404 });
  });

  it('400s an invalid supplier on the order lookup', async () => {
    await expect(deliveryService.getPurchaseOrdersBySupplier('abc'))
      .rejects.toMatchObject({ status: 400 });
  });

  it('falls back to "all" for an unknown range rather than failing', async () => {
    repoMock.getDeliveries.mockResolvedValue([]);
    await deliveryService.getDeliveries('since-tuesday');
    expect(repoMock.getDeliveries).toHaveBeenCalledWith('all');
  });
});
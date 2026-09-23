// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.getById.repository.test.js
//
// getPurchaseOrderById makes three sequential pool.query calls (the
// PO row, its lines, its deliveries) — no client. Mocked in that
// order with mockResolvedValueOnce.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit: vi.fn() }));
vi.mock('../src/repositories/notification.repository.js', () => ({ createNotification: vi.fn() }));

const { default: purchaseOrderRepository } =
  await import('../src/repositories/purchaseOrder.repository.js');

const { getPurchaseOrderById } = purchaseOrderRepository;

const PO_ROW = {
  id: 1, po_number: 'PO-0001', supplier_id: 2, status: 'completed',
  supplier_name: 'Bokomo', created_by_name: 'Grizel',
};

beforeEach(() => vi.clearAllMocks());

describe('getPurchaseOrderById', () => {
  it('returns null without querying items or deliveries when the PO does not exist', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const result = await getPurchaseOrderById(999);

    expect(result).toBeNull();
    expect(poolMock.query).toHaveBeenCalledTimes(1);
  });

  it('attaches items and deliveries to the found PO', async () => {
    const ITEM = { id: 10, product_id: 5, product_name: 'Maize meal' };
    const DELIVERY = {
      id: 20, delivery_date: '2026-09-10', status: 'complete',
      driver_name: 'Sipho', received_by_name: 'Mcebisi', has_discrepancies: false,
    };

    poolMock.query
      .mockResolvedValueOnce({ rows: [PO_ROW] })
      .mockResolvedValueOnce({ rows: [ITEM] })
      .mockResolvedValueOnce({ rows: [DELIVERY] });

    const result = await getPurchaseOrderById(1);

    expect(result).toEqual({ ...PO_ROW, items: [ITEM], deliveries: [DELIVERY] });
    expect(poolMock.query).toHaveBeenCalledTimes(3);
  });

  it('scopes the deliveries query to this PO, oldest first', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [PO_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await getPurchaseOrderById(1);

    const [sql, params] = poolMock.query.mock.calls[2];
    expect(sql).toMatch(/FROM delivery_notes dn/i);
    expect(sql).toMatch(/WHERE dn\.purchase_order_id = \$1/i);
    expect(sql).toMatch(/ORDER BY dn\.delivery_date ASC/i);
    expect(params).toEqual([1]);
  });

  it('flags a delivery as having discrepancies when any of its lines vary', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [PO_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 20, has_discrepancies: true }] });

    const result = await getPurchaseOrderById(1);

    expect(result.deliveries[0].has_discrepancies).toBe(true);
  });
});

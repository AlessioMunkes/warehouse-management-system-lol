// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.getById.repository.test.js
//
// getPurchaseOrderById makes four pool.query calls (the PO row, its
// lines, its deliveries, its status changes) — no client. Mocked in
// that order with mockResolvedValueOnce.
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
  // The order, its lines, its deliveries and its status changes are read
  // together (one wait on the database), so all four are asked for
  // either way.
  it('returns null when the PO does not exist', async () => {
    poolMock.query.mockResolvedValue({ rows: [] });

    const result = await getPurchaseOrderById(999);

    expect(result).toBeNull();
    expect(poolMock.query).toHaveBeenCalledTimes(4);
  });

  it('attaches items and deliveries to the found PO', async () => {
    const ITEM = { id: 10, product_id: 5, product_name: 'Maize meal' };
    const DELIVERY = {
      id: 20, delivery_date: '2026-09-10', status: 'complete',
      driver_name: 'Sipho', received_by_name: 'Mcebisi', has_discrepancies: false,
    };
    const CHANGE = { status: 'approved', reason: null, created_at: '2026-09-09T08:00:00Z', actor_name: 'Grizel Goliath' };

    poolMock.query
      .mockResolvedValueOnce({ rows: [PO_ROW] })
      .mockResolvedValueOnce({ rows: [ITEM] })
      .mockResolvedValueOnce({ rows: [DELIVERY] })
      .mockResolvedValueOnce({ rows: [CHANGE] });

    const result = await getPurchaseOrderById(1);

    expect(result).toEqual({ ...PO_ROW, items: [ITEM], deliveries: [DELIVERY], status_changes: [CHANGE] });
    expect(poolMock.query).toHaveBeenCalledTimes(4);
  });

  // The timeline's "who approved it, and when": the audit trail
  // updatePurchaseOrderStatus writes, for this order only.
  it('reads the status changes from the audit trail for this PO, oldest first', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [PO_ROW] }).mockResolvedValue({ rows: [] });

    await getPurchaseOrderById(1);

    const [sql, params] = poolMock.query.mock.calls[3];
    expect(sql).toMatch(/FROM audit_log al/i);
    expect(sql).toMatch(/al\.entity_type = 'purchase_order' AND al\.entity_id = \$1/);
    expect(sql).toMatch(/al\.action = 'status_changed'/);
    expect(sql).toMatch(/ORDER BY al\.created_at ASC/);
    expect(params).toEqual([1]);
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

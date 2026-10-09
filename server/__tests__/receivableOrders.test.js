// ─────────────────────────────────────────────────────────────
// server/__tests__/receivableOrders.test.js
//
// Goods are received only against an order a manager has approved.
// A pending order is open, and counts as outstanding everywhere else,
// but the floor may not sign a delivery in against it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  OPEN_PO_STATUSES, RECEIVABLE_PO_STATUSES, CLOSED_PO_STATUSES,
  isOpenPurchaseOrder, isReceivablePurchaseOrder,
} from '../src/constants/purchaseOrderStatus.js';

describe('which purchase orders can be received against', () => {
  it('an approved or in-transit order can', () => {
    for (const status of ['approved', 'in_transit']) {
      expect(isReceivablePurchaseOrder(status), status).toBe(true);
    }
  });

  it('a pending order cannot, though it is still open', () => {
    expect(isOpenPurchaseOrder('pending')).toBe(true);
    expect(isReceivablePurchaseOrder('pending')).toBe(false);
  });

  // Part-received means the rest is coming on a follow-up order, and is
  // received against that one.
  it('a closed, flagged or part-received order cannot', () => {
    for (const status of [...CLOSED_PO_STATUSES, 'follow_up_required', 'partially_received', 'nonsense', undefined]) {
      expect(isReceivablePurchaseOrder(status), String(status)).toBe(false);
    }
  });

  it('everything receivable is also open', () => {
    for (const status of RECEIVABLE_PO_STATUSES) expect(OPEN_PO_STATUSES).toContain(status);
  });
});

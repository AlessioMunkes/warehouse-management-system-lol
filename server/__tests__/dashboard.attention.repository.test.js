// ─────────────────────────────────────────────────────────────
// server/__tests__/dashboard.attention.repository.test.js
//
// getAttention: the counts behind "Needs attention" and the manager
// sidebar. The inventory counts must follow the Inventory tabs' rules
// (inventoryViews.js on the client), or a link would land on a tab
// holding a different number of rows than it promised.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const stockRepoMock = { getManifest: vi.fn() };
vi.mock('../src/repositories/stock.repository.js', () => ({ default: stockRepoMock }));

const { default: repo } = await import('../src/repositories/dashboard.repository.js');

// 10:00 SAST on 2 October 2026.
const NOW = new Date('2026-10-02T08:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.query.mockImplementation(async (sql) => {
    if (/FROM picking_slips/.test(sql)) return { rows: [{ unassigned: 4, not_collected: 1 }] };
    if (/FROM purchase_orders/.test(sql)) return { rows: [{ awaiting_approval: 2, follow_up: 3 }] };
    return { rows: [{ count: 5 }] };
  });
  stockRepoMock.getManifest.mockResolvedValue([
    { id: 1, is_shortfall: true,  is_low_stock: true,  earliest_expiry: null },
    { id: 2, is_shortfall: false, is_low_stock: true,  earliest_expiry: '2026-10-02' },
    { id: 3, is_shortfall: false, is_low_stock: false, earliest_expiry: '2026-11-01' },
    { id: 4, is_shortfall: false, is_low_stock: false, earliest_expiry: '2026-11-02' },
    { id: 5, is_shortfall: false, is_low_stock: false, earliest_expiry: '2026-10-01' },
  ]);
});

describe('getAttention', () => {
  it('counts a shortfall once, not also as low stock', async () => {
    const { inventory } = await repo.getAttention({ now: NOW });
    expect(inventory.shortfall).toBe(1);
    expect(inventory.lowStock).toBe(1);
  });

  it('counts expiry from today to thirty days out, in Cape Town days', async () => {
    const { inventory } = await repo.getAttention({ now: NOW });
    // Today and exactly 30 days out are in; 31 days and yesterday are not.
    expect(inventory.expiring).toBe(2);
  });

  it('reports slips, orders and requests from their own queries', async () => {
    const res = await repo.getAttention({ now: NOW });
    expect(res.pickingSlips).toEqual({ unassigned: 4, notCollected: 1 });
    expect(res.purchaseOrders).toEqual({ awaitingApproval: 2, followUp: 3 });
    expect(res.communityRequests).toEqual({ pending: 5 });
  });

  it('limits slips to this Monday-to-Sunday week and reads not-collected from dispatch_events', async () => {
    await repo.getAttention({ now: NOW });
    const sql = poolMock.query.mock.calls.map(([q]) => q.replace(/\s+/g, ' ')).find((q) => /picking_slips/.test(q));
    expect(sql).toMatch(/date_trunc\('week'/);
    expect(sql).toMatch(/de\.status = 'not_collected'/);
  });
});

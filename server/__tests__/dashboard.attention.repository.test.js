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
    // Never packed, past the collection day: checked before the week's query.
    if (/AS oldest/.test(sql)) return { rows: [{ n: 7, oldest: '2026-09-21' }] };
    if (/FROM picking_slips/.test(sql)) return { rows: [{ unassigned: 4, not_collected: 1, flagged: 2 }] };
    if (/FROM purchase_orders/.test(sql)) return { rows: [{ awaiting_approval: 2, follow_up: 3, finance_email_failed: 1, needs_quickbooks_match: 2 }] };
    if (/FROM community_requests/.test(sql)) return { rows: [{ pending: 5, approved: 2, overdue: 1, needs_items: 1 }] };
    if (/FROM collection_kits/.test(sql)) return { rows: [{ idle: 3 }] };
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
    expect(res.pickingSlips).toEqual({ unassigned: 4, notCollected: 1, flagged: 2, neverPacked: 7, neverPackedFrom: '2026-09-21' });
    expect(res.purchaseOrders).toEqual({ awaitingApproval: 2, followUp: 3, financeEmailFailed: 1, needsQuickbooksMatch: 2 });
    expect(res.communityRequests).toEqual({ pending: 5, approved: 2, overdue: 1, needsItems: 1 });
    expect(res.feedTheSoil).toEqual({ idleKits: 3 });
  });

  it('limits slips to this Monday-to-Sunday week and reads not-collected from dispatch_events', async () => {
    await repo.getAttention({ now: NOW });
    const sql = poolMock.query.mock.calls.map(([q]) => q.replace(/\s+/g, ' ')).find((q) => /picking_slips/.test(q));
    expect(sql).toMatch(/date_trunc\('week'/);
    expect(sql).toMatch(/de\.status = 'not_collected'/);
  });

  // Each count has to be the size of the tab it links to. These rules
  // live once, with the list query, and the count uses the same one.
  const flat = (q) => q.replace(/\s+/g, ' ');
  const sqlFor = (re) => poolMock.query.mock.calls.map(([q]) => flat(q)).find((q) => re.test(q));

  it('counts overdue requests with the list rule', async () => {
    await repo.getAttention({ now: NOW });
    const { overdueSql } = await import('../src/repositories/communityRequest.repository.js');
    expect(sqlFor(/community_requests/)).toContain(flat(overdueSql('community_requests')));
  });

  it('counts idle kits with the list rule', async () => {
    await repo.getAttention({ now: NOW });
    const { idleKitSql } = await import('../src/repositories/collectionKit.repository.js');
    expect(sqlFor(/collection_kits/)).toContain(flat(idleKitSql('k')));
  });

  it('finds a needs-a-match order by the same key QuickBooks records it under', async () => {
    await repo.getAttention({ now: NOW });
    expect(sqlFor(/purchase_orders/)).toContain("'purchase_order:' || purchase_orders.id || ':create'");
  });

  it('reads no idle kits where the kit tables are missing', async () => {
    poolMock.query.mockImplementation(async (sql) => {
      if (/FROM collection_kits/.test(sql)) { const e = new Error('missing'); e.code = '42P01'; throw e; }
      return { rows: [{}] };
    });
    const res = await repo.getAttention({ now: NOW });
    expect(res.feedTheSoil.idleKits).toBe(0);
  });
});

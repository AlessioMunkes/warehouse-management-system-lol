// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.expiry.repository.test.js
//
// The two expiry/recency additions the inventory tabs read: the
// manifest's last_movement_at and earliest_expiry, and the per-product
// receipt-line list behind the detail panel.
//
// The pool is mocked, so these pin the shape of the SQL — which table
// each date comes from and which dates are excluded — not its result.
// Same approach as collectionKit.repository.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { connect: vi.fn(), query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/stock.repository.js');

const flat = (sql) => sql.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.query.mockResolvedValue({ rows: [] });
});

describe('getManifest — dates for the inventory tabs', () => {
  it('reads the last movement from stock_movements, not stock_levels.updated_at', async () => {
    await repo.getManifest();
    const sql = flat(poolMock.query.mock.calls[0][0]);

    // A threshold edit bumps updated_at without moving any stock, so
    // "No movement 60+ days" has to come from the ledger itself.
    expect(sql).toMatch(/MAX\(created_at\) AS last_movement_at FROM stock_movements/);
    expect(sql).toMatch(/lm\.last_movement_at/);
  });

  it('takes the earliest expiry from delivery_note_items, today or later only', async () => {
    await repo.getManifest();
    const sql = flat(poolMock.query.mock.calls[0][0]);

    expect(sql).toMatch(/MIN\(expiry_date\) AS earliest_expiry FROM delivery_note_items/);
    expect(sql).toMatch(/WHERE expiry_date >= \(now\(\) AT TIME ZONE 'Africa\/Johannesburg'\)::date/);
  });

  it('joins grouped subqueries rather than correlating per product row', async () => {
    await repo.getManifest();
    const sql = flat(poolMock.query.mock.calls[0][0]);

    expect(sql).toMatch(/GROUP BY product_id \) lm ON lm\.product_id = p\.id/);
    expect(sql).toMatch(/GROUP BY product_id \) ex ON ex\.product_id = p\.id/);
  });
});

describe('getExpiryBatches', () => {
  it('lists one product\'s receipt lines, soonest expiry first', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });

    const rows = await repo.getExpiryBatches(7);
    const [sql, params] = poolMock.query.mock.calls[0];

    expect(rows).toEqual([{ id: 3 }]);
    expect(params[0]).toBe(7);
    expect(flat(sql)).toMatch(/FROM delivery_note_items dni JOIN delivery_notes dn/);
    expect(flat(sql)).toMatch(/ORDER BY dni\.expiry_date ASC/);
  });

  it('keeps recently expired lines but drops ones past the grace window', async () => {
    await repo.getExpiryBatches(7);
    const [sql, params] = poolMock.query.mock.calls[0];

    expect(flat(sql)).toMatch(/dni\.expiry_date >= \(now\(\) AT TIME ZONE 'Africa\/Johannesburg'\)::date - \$2::int/);
    expect(params[1]).toBe(30);
  });

  it('skips lines that recorded no expiry or received nothing', async () => {
    await repo.getExpiryBatches(7);
    const sql = flat(poolMock.query.mock.calls[0][0]);

    expect(sql).toMatch(/dni\.expiry_date IS NOT NULL/);
    expect(sql).toMatch(/dni\.received_quantity > 0/);
  });
});

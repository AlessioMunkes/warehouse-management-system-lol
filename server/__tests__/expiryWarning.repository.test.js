// ─────────────────────────────────────────────────────────────
// server/__tests__/expiryWarning.repository.test.js
//
// Repository-level tests for expiryWarning.repository. No database —
// the shared lots loader and pool.query are mocked. Which lines the
// warnings cover (stock left, not dismissed) is the loader's business:
// shelfLots.test.js works it by hand, expiryWarning.dismissed.test.js
// runs it through the sweep.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const listExpiringLots = vi.fn();
vi.mock('../src/repositories/shelfLots.repository.js', () => ({ listExpiringLots }));

const { default: expiryWarningRepository } =
  await import('../src/repositories/expiryWarning.repository.js');

const { findApproachingExpiry, warningAlreadySent } = expiryWarningRepository;

beforeEach(() => vi.clearAllMocks());

describe('findApproachingExpiry', () => {
  it('lists the live lots expiring within the window as warning rows, with what is left of each', async () => {
    listExpiringLots.mockResolvedValueOnce([
      { lineId: 1, expiryDate: '2026-09-25', received: 40, left: 12, unit: 'kg', productId: 5, productName: 'Maize meal', sku: 'MM-01' },
    ]);

    const result = await findApproachingExpiry(14);

    expect(result).toEqual([
      { delivery_note_item_id: 1, expiry_date: '2026-09-25', received_quantity: 40, quantity_left: 12, unit: 'kg', product_id: 5, product_name: 'Maize meal', sku: 'MM-01' },
    ]);
    expect(listExpiringLots).toHaveBeenCalledWith({ withinDays: 14 });
    // The estimate does the work now; nothing is read straight off delivery_note_items.
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('returns an empty array when nothing is approaching expiry', async () => {
    listExpiringLots.mockResolvedValueOnce([]);

    const result = await findApproachingExpiry(7);

    expect(result).toEqual([]);
  });
});

describe('warningAlreadySent', () => {
  it('returns true when a matching notification already exists', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const result = await warningAlreadySent(42, 'stock_expiry_warning_2w');

    expect(result).toBe(true);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM notifications/i);
    expect(sql).toMatch(/entity_type = 'delivery_note_item_expiry'/i);
    expect(sql).toMatch(/entity_id\s*=\s*\$1/i);
    expect(sql).toMatch(/type\s*=\s*\$2/i);
    expect(params).toEqual([42, 'stock_expiry_warning_2w']);
  });

  it('returns false when no matching notification exists', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const result = await warningAlreadySent(42, 'stock_expiry_warning_1w');

    expect(result).toBe(false);
  });
});

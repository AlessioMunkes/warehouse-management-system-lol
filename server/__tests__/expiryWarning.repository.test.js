// ─────────────────────────────────────────────────────────────
// server/__tests__/expiryWarning.repository.test.js
//
// Repository-level tests for expiryWarning.repository. No database —
// pool.query is mocked and each test checks the SQL shape and the
// bound parameters.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: expiryWarningRepository } =
  await import('../src/repositories/expiryWarning.repository.js');

const { findApproachingExpiry, warningAlreadySent } = expiryWarningRepository;

beforeEach(() => vi.clearAllMocks());

describe('findApproachingExpiry', () => {
  it('selects delivery lines expiring within the window, ordered soonest first', async () => {
    const rows = [
      { delivery_note_item_id: 1, expiry_date: '2026-09-25', received_quantity: 10, unit: 'kg', product_id: 5, product_name: 'Maize meal', sku: 'MM-01' },
    ];
    poolMock.query.mockResolvedValueOnce({ rows });

    const result = await findApproachingExpiry(14);

    expect(result).toEqual(rows);
    expect(poolMock.query).toHaveBeenCalledTimes(1);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/FROM delivery_note_items dni/i);
    expect(sql).toMatch(/JOIN products p ON p\.id = dni\.product_id/i);
    expect(sql).toMatch(/dni\.expiry_date IS NOT NULL/i);
    expect(sql).toMatch(/dni\.expiry_date >= CURRENT_DATE/i);
    expect(sql).toMatch(/dni\.expiry_date <= \(CURRENT_DATE \+ \$1::int\)/i);
    expect(sql).toMatch(/ORDER BY dni\.expiry_date ASC/i);
    expect(params).toEqual([14]);
  });

  it('returns an empty array when nothing is approaching expiry', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

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

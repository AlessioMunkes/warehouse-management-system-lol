// ─────────────────────────────────────────────────────────────
// server/__tests__/product.search.repository.test.js
//
// The "match to stock item" search (product.repository.js
// searchProductsByName), used at intake and in the classification queue.
//
// A real product with an open review flag must still be found. Soya mince
// flagged for review on a donation used to be hidden from the very queue
// that resolves the flag, because the search left out every product with an
// open flag. Placeholders for unrecognised items stay out by being inactive
// with a PENDING- code.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: productRepo } = await import('../src/repositories/product.repository.js');

beforeEach(() => {
  poolMock.query.mockReset();
});

describe('searchProductsByName', () => {
  it('finds a product even while a review flag is open on it', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 12, name: 'Soya mince', sku: 'SOYA-MINCE' }] });
    const rows = await productRepo.searchProductsByName('mi');
    expect(rows).toEqual([{ id: 12, name: 'Soya mince', sku: 'SOYA-MINCE' }]);
    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).not.toMatch(/warehouse_manager_flags/);
    expect(params[0]).toBe('%mi%');
  });

  it('still leaves out inactive placeholders and PENDING- codes', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await productRepo.searchProductsByName('beef');
    for (const [sql] of poolMock.query.mock.calls) {
      expect(sql).toMatch(/is_active = true/);
      expect(sql).toMatch(/NOT ILIKE 'PENDING-%'/);
      expect(sql).not.toMatch(/warehouse_manager_flags/);
    }
  });

  it('treats % and _ in what was typed as plain characters', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1, name: '50% bran', sku: 'X' }] });
    await productRepo.searchProductsByName('50%');
    expect(poolMock.query.mock.calls[0][1][0]).toBe('%50\\%%');
  });
});

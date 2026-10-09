// ─────────────────────────────────────────────────────────────
// server/__tests__/decantingBulkInStock.test.js
//
// A bulk weight entered at decanting cannot be more than the product
// has in stock (decanting.service.js assertBulkInStock).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const poolMock = { query: vi.fn(), connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const createDecanting = vi.fn(async () => ({ id: 1 }));
vi.mock('../src/repositories/decanting.repository.js', () => ({ default: { createDecanting } }));

const { default: decantingService } = await import('../src/services/decanting.service.js');
const { assertBulkInStock } = decantingService;

// Rice 40 kg, flour 2500 g, oil 30 l, eggs 12 each; product 9 has no stock row.
const STOCK = {
  1: { name: 'Rice', on_hand: '40', unit: 'kg' },
  2: { name: 'Flour', on_hand: '2500', unit: 'g' },
  3: { name: 'Cooking Oil', on_hand: '30', unit: 'l' },
  4: { name: 'Eggs', on_hand: '12', unit: 'each' },
  9: { name: 'Samp', on_hand: '0', unit: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.query.mockImplementation(async (sql, params) => {
    if (/NOT is_decantable/.test(sql)) return { rows: [] };                 // every product here is decantable
    return { rows: params[0].filter((id) => STOCK[id]).map((id) => ({ id, ...STOCK[id] })) };
  });
});

describe('assertBulkInStock', () => {
  it('allows a bulk weight up to what is in stock', async () => {
    await expect(assertBulkInStock([{ productId: 1, actualBulkKg: 40 }])).resolves.toBeUndefined();
    await expect(assertBulkInStock([{ productId: 1, actualBulkKg: '25.5' }])).resolves.toBeUndefined();
  });

  it('refuses more than is in stock, naming the product and both figures', async () => {
    await expect(assertBulkInStock([{ productId: 1, actualBulkKg: 500 }])).rejects.toMatchObject({
      status: 400,
      code: 'BULK_EXCEEDS_STOCK',
      message: 'Rice: the bulk amount (500 kg) is more than the 40 kg in stock. Weigh it again, or ask your manager to check the stock.',
    });
    await expect(assertBulkInStock([{ productId: 1, actualBulkKg: 40.01 }])).rejects.toMatchObject({ status: 400 });
  });

  it('adds the lines for one product together', async () => {
    await expect(assertBulkInStock([{ productId: 1, actualBulkKg: 25 }, { productId: 1, actualBulkKg: 15 }])).resolves.toBeUndefined();
    await expect(assertBulkInStock([{ productId: 1, actualBulkKg: 25 }, { productId: 1, actualBulkKg: 25 }]))
      .rejects.toThrow('Rice: the bulk amount (50 kg) is more than the 40 kg in stock.');
  });

  it('compares stock kept in grams as kilograms', async () => {
    await expect(assertBulkInStock([{ productId: 2, actualBulkKg: 2.5 }])).resolves.toBeUndefined();
    await expect(assertBulkInStock([{ productId: 2, actualBulkKg: 3 }]))
      .rejects.toThrow('Flour: the bulk amount (3 kg) is more than the 2.5 kg in stock.');
  });

  it('refuses any weight of a product with nothing in stock', async () => {
    await expect(assertBulkInStock([{ productId: 9, actualBulkKg: 1 }]))
      .rejects.toThrow('Samp: the bulk amount (1 kg) is more than the 0 kg in stock.');
  });

  it('leaves stock that is not kept by weight alone', async () => {
    await expect(assertBulkInStock([{ productId: 3, actualBulkKg: 999 }])).resolves.toBeUndefined();
    await expect(assertBulkInStock([{ productId: 4, actualBulkKg: 999 }])).resolves.toBeUndefined();
  });

  it('does not ask the database when no weight has been entered yet', async () => {
    await assertBulkInStock([{ productId: 1, requiredKg: 10 }, { productId: 1, actualBulkKg: '' }, { productId: 1, actualBulkKg: null }]);
    await assertBulkInStock([]);
    await assertBulkInStock(undefined);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('does not hold a sheet up when the balance cannot be read', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    poolMock.query.mockRejectedValue(new Error('connection lost'));
    await expect(assertBulkInStock([{ productId: 1, actualBulkKg: 500 }])).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('recordDecanting', () => {
  const sheet = (bulk) => ({ weekOf: '2026-10-05', selectedSizes: [10, 5], items: [{ productId: 1, productName: 'Rice', requiredKg: 20, actualBulkKg: bulk, wastageKg: 0 }] });

  it('saves a sheet whose bulk weight is in stock', async () => {
    await expect(decantingService.recordDecanting(sheet(20), 3)).resolves.toEqual({ id: 1 });
    expect(createDecanting).toHaveBeenCalledTimes(1);
  });

  it('saves nothing when the bulk weight is more than is in stock', async () => {
    await expect(decantingService.recordDecanting(sheet(500), 3)).rejects.toMatchObject({ status: 400, code: 'BULK_EXCEEDS_STOCK' });
    expect(createDecanting).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// server/__tests__/wholeItems.test.js
//
// Only a decantable product can be a part quantity (migration 044).
// The database is a mock that answers "which of these ids are not
// decantable", which is all the module asks it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolMock = { query: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const {
  isWholeNumber, wholeUnitsMessage, assertWholeByProduct, assertWholeBySlipItem, assertDecantable,
} = await import('../src/features/units/wholeItems.js');
const { slipQuantity } = await import('../src/features/recipes/recipeSeason.js');

// Product 1 is baked beans (whole), product 2 is rice (decantable).
const WHOLE = { 1: 'Baked Beans' };
const answer = (ids) => ({ rows: ids.filter((id) => WHOLE[id]).map((id) => ({ name: WHOLE[id] })).slice(0, 1) });

beforeEach(() => {
  poolMock.query.mockReset();
  poolMock.query.mockImplementation(async (_sql, [ids]) => answer(ids));
});

describe('isWholeNumber', () => {
  it('knows a whole number from a part one', () => {
    expect(isWholeNumber(3)).toBe(true);
    expect(isWholeNumber('12')).toBe(true);
    expect(isWholeNumber(0)).toBe(true);
    expect(isWholeNumber(-4)).toBe(true);
    expect(isWholeNumber(2.5)).toBe(false);
    expect(isWholeNumber('0.1')).toBe(false);
  });

  it('forgives floating point, not a real fraction', () => {
    expect(isWholeNumber(0.12 * 75)).toBe(true);        // 9.000000000000002
    expect(isWholeNumber(3.0001)).toBe(false);
    expect(isWholeNumber('abc')).toBe(false);
  });
});

describe('assertWholeByProduct', () => {
  it('refuses a part quantity of a product that is not decantable, by name', async () => {
    await expect(assertWholeByProduct([{ productId: 1, quantity: 2.5 }]))
      .rejects.toMatchObject({ status: 400, message: wholeUnitsMessage('Baked Beans') });
  });

  it('allows a part quantity of a decantable product', async () => {
    await expect(assertWholeByProduct([{ productId: 2, quantity: 2.5 }])).resolves.toBeUndefined();
  });

  it('does not ask the database when every quantity is whole', async () => {
    await assertWholeByProduct([{ productId: 1, quantity: 3 }, { productId: 2, quantity: 10 }]);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('looks up only the lines that are fractions', async () => {
    await assertWholeByProduct([{ productId: 1, quantity: 3 }, { productId: 2, quantity: 0.5 }]);
    expect(poolMock.query.mock.calls[0][1]).toEqual([[2]]);
  });

  it('ignores a line with no quantity, and an empty list', async () => {
    await assertWholeByProduct([{ productId: 1, quantity: null }, { productId: 1 }]);
    await assertWholeByProduct([]);
    await assertWholeByProduct(undefined);
    expect(poolMock.query).not.toHaveBeenCalled();
  });

  it('does not block anyone when the column cannot be read', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    poolMock.query.mockRejectedValue(new Error('column p.is_decantable does not exist'));
    await expect(assertWholeByProduct([{ productId: 1, quantity: 2.5 }])).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('assertWholeBySlipItem', () => {
  it('refuses a part quantity packed against a whole item', async () => {
    await expect(assertWholeBySlipItem([{ itemId: 1, quantity: 5.5 }]))
      .rejects.toMatchObject({ status: 400, message: 'Baked Beans is counted in whole units. Enter a whole number.' });
    expect(poolMock.query.mock.calls[0][0]).toMatch(/picking_slip_items/);
  });

  it('lets a flag with no quantity through', async () => {
    await expect(assertWholeBySlipItem([{ itemId: 1, quantity: null }])).resolves.toBeUndefined();
  });
});

describe('assertDecantable', () => {
  it('refuses a product that is not marked decantable, and says who can change it', async () => {
    await expect(assertDecantable([2, 1]))
      .rejects.toMatchObject({ status: 400, message: 'Baked Beans is not marked as decantable. An admin can change that on the Products screen.' });
  });

  it('allows decantable products, and ignores ids that are not ids', async () => {
    await expect(assertDecantable([2, 2, 'x', null])).resolves.toBeUndefined();
    expect(poolMock.query.mock.calls[0][1]).toEqual([[2]]);
  });
});

describe('slipQuantity for a product that is not decantable', () => {
  it('rounds up to a whole number whatever the unit', () => {
    expect(slipQuantity(0.058, 'kg', 25, { whole: true })).toBe(2);     // carrots: 1.45 kg
    expect(slipQuantity(0.058, 'kg', 25)).toBe(1.45);
    expect(slipQuantity(0.12, 'each', 75, { whole: true })).toBe(9);    // exactly 9, not 10
  });
});

// ─────────────────────────────────────────────────────────────
// server/__tests__/unitConversion.test.js
//
// features/units: what converts to what, with the sizes an admin sets
// on Settings → Stock rules, and how adjustStock uses it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/config/db.js', () => ({ default: { connect: vi.fn(), query: vi.fn() } }));

const { convertQuantity, readUnitSizes, toStockUnitSql } = await import('../src/features/units/unitConversion.js');
const { default: stockRepository } = await import('../src/repositories/stock.repository.js');

const SIZES = { crate: 20, bag: 10, punnet: 250 };

describe('convertQuantity', () => {
  it('turns kilograms into the unit stock is counted in', () => {
    expect(convertQuantity(30, 'kg', 'crate', SIZES)).toBe(1.5);
    expect(convertQuantity(2.61, 'kg', 'crate', SIZES)).toBe(0.1305);
    expect(convertQuantity(3, 'crate', 'kg', SIZES)).toBe(60);
    expect(convertQuantity(2, 'crate', 'bag', SIZES)).toBe(4);
    expect(convertQuantity(1, 'kg', 'punnet', SIZES)).toBe(4);     // a punnet is entered in grams
  });

  it('knows grams and millilitres without being told', () => {
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
    expect(convertQuantity(330, 'ml', 'l')).toBe(0.33);
    expect(convertQuantity(-0.3, 'kg', 'g')).toBe(-300);
  });

  it('leaves the same unit alone', () => {
    expect(convertQuantity(7, 'crate', 'crate')).toBe(7);
    expect(convertQuantity(7, 'each', 'each')).toBe(7);
  });

  it('converts nothing for a size that is not set, or across kinds', () => {
    expect(convertQuantity(30, 'kg', 'box', SIZES)).toBeNull();     // no box size
    expect(convertQuantity(30, 'kg', 'crate', { crate: 0 })).toBeNull();
    expect(convertQuantity(30, 'kg', 'crate')).toBeNull();
    expect(convertQuantity(3, 'each', 'kg', SIZES)).toBeNull();
    expect(convertQuantity(3, 'l', 'kg', SIZES)).toBeNull();
    expect(convertQuantity(5, 'crates', 'kg', SIZES)).toBeNull();   // not a unit
  });
});

describe('readUnitSizes', () => {
  it('reads the saved sizes and skips the ones left at 0', async () => {
    const client = { query: vi.fn(async (sql) => (/FROM app_settings/.test(sql)
      ? { rows: [{ key: 'units.crateKg', value: 20 }, { key: 'units.bagKg', value: 0 }] } : { rows: [] })) };
    expect(await readUnitSizes(client)).toEqual({ crate: 20 });
  });

  it('gives no sizes, and keeps the transaction usable, when the read fails', async () => {
    const calls = [];
    const client = { query: vi.fn(async (sql) => { calls.push(sql); if (/FROM app_settings/.test(sql)) throw new Error('no table'); return { rows: [] }; }) };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await readUnitSizes(client)).toEqual({});
    expect(calls.at(-1)).toBe('ROLLBACK TO SAVEPOINT unit_sizes');
    spy.mockRestore();
  });
});

describe('toStockUnitSql', () => {
  it('multiplies by the ratio and falls back to the quantity as it stands', () => {
    const sql = toStockUnitSql('i.packed_quantity', 'i.unit', 'sl.unit');
    expect(sql).toContain('i.packed_quantity * COALESCE(');
    expect(sql).toContain("WHEN i.unit = sl.unit THEN 1");
    expect(sql).toContain("s.key = 'units.crateKg'");
    expect(sql).toContain("s.key = 'units.punnetGrams'");
    expect(sql.trim().endsWith(', 1))')).toBe(true);
  });
});

describe('adjustStock with a unit size set', () => {
  const makeClient = (sizes) => {
    const calls = [];
    return {
      calls,
      query: vi.fn(async (sql, params) => {
        calls.push({ sql, params });
        if (/reorder_threshold[\s\S]*FROM stock_levels/.test(sql)) return { rows: [{ quantity_on_hand: '10', unit: 'crate', reorder_threshold: '0', product_name: 'Carrots' }] };
        if (/FROM app_settings/.test(sql)) return { rows: sizes };
        if (/UPDATE stock_levels/.test(sql)) return { rows: [{ quantity_on_hand: String(10 + Number(params[0])) }] };
        return { rows: [], rowCount: 1 };
      }),
    };
  };
  const DISPATCH = { productId: 1, quantityDelta: -30, unit: 'kg', movementType: 'dispatched', performedBy: 42 };

  it('takes 30 kg off stock kept in 20 kg crates as a crate and a half', async () => {
    const client = makeClient([{ key: 'units.crateKg', value: 20 }]);
    const result = await stockRepository.adjustStock(client, DISPATCH);

    expect(result).toMatchObject({ before: 10, after: 8.5, isUnitMismatch: false });
    const movement = client.calls.find((c) => /INSERT INTO stock_movements/.test(c.sql));
    expect(movement.params.slice(1, 3)).toEqual([-1.5, 'crate']);
  });

  it('takes the number as it stands, flagged, while no crate size is set', async () => {
    const client = makeClient([]);
    const result = await stockRepository.adjustStock(client, DISPATCH);

    expect(result).toMatchObject({ after: -20, isUnitMismatch: true });
  });
});

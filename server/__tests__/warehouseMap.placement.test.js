// ─────────────────────────────────────────────────────────────
// server/__tests__/warehouseMap.placement.test.js
//
// What each area of the map holds, worked out from the newest counts
// and what is on hand (features/warehouseMap/placement.js), and the
// checks on a floor plan (features/warehouseMap/layout.js). Pure: no
// database.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { placeStock, weightKg } from '../src/features/warehouseMap/placement.js';
import { checkLayout } from '../src/features/warehouseMap/layout.js';

const area = (id, extra = {}) => ({ id, name: `Area ${id}`, kind: 'dry', x: id * 5, y: 0, w: 4, h: 3, levels: 1, ...extra });
const product = (id, onHand, extra = {}) => ({
  id, name: `Product ${id}`, sku: `P${id}`, unit: 'kg', onHand, onPallets: 0, category: null, weightKg: null,
  programmeId: null, programmeName: null, storageType: 'dry', earliestExpiry: null, ...extra,
});
const count = (areaId, productId, quantity, countedAt = '2026-10-10T08:00:00Z') => ({ areaId, productId, quantity, countedAt, countedByName: 'Grizel' });

describe('placeStock', () => {
  it('leaves a product nobody counted all not placed', () => {
    const { areas, products } = placeStock({ areas: [area(1)], counts: [], products: [product(1, 50)] });
    expect(areas[0].items).toEqual([]);
    expect(products[0]).toMatchObject({ countedTotal: 0, placed: 0, expected: 0, unplaced: 50 });
  });

  it('takes stock packed onto pallets off the shelves, scaling the counts down', () => {
    const { areas, products } = placeStock({
      areas: [area(1)],
      counts: [count(1, 1, 50)],
      products: [product(1, 50, { onPallets: 20 })],
    });
    expect(areas[0].items[0]).toMatchObject({ counted: 50, about: 30, scaled: true });
    expect(products[0]).toMatchObject({ shelf: 30, onPallets: 20, unplaced: 0 });
  });

  it('puts what nobody counted in the area meant for the product, before its category', () => {
    const { areas, products } = placeStock({
      areas: [
        area(1, { preferredProductIds: [1] }),
        area(2, { preferredCategories: ['Canned goods'] }),
      ],
      counts: [count(1, 1, 10)],
      products: [product(1, 25, { category: 'Canned goods' }), product(2, 8, { category: 'canned goods' })],
    });
    expect(areas[0].items.map((i) => [i.productId, i.source, i.about])).toEqual([[1, 'counted', 10], [1, 'expected', 15]]);
    expect(areas[1].items.map((i) => [i.productId, i.source, i.about])).toEqual([[2, 'expected', 8]]);
    expect(products.map((p) => [p.expected, p.unplaced])).toEqual([[15, 0], [8, 0]]);
  });

  it('splits expected stock by capacity when every area meant for it has one', () => {
    const { areas } = placeStock({
      areas: [area(1, { preferredProductIds: [1], capacityKg: 300 }), area(2, { preferredProductIds: [1], capacityKg: 100 })],
      products: [product(1, 40)],
    });
    expect(areas.map((a) => a.items[0].about)).toEqual([30, 10]);
    expect(areas.map((a) => a.fill)).toEqual([0.1, 0.1]);
  });

  it('stands packed pallets in staging areas in plan order, the overflow in the last', () => {
    const pallets = [1, 2, 3, 4].map((id) => ({ id, ref: `P-${id}`, beneficiary: 'Centre', dispatchDate: '2026-10-20' }));
    const { areas, totals, unstagedPallets } = placeStock({
      areas: [area(1, { kind: 'staging', palletSpaces: 2 }), area(2, { kind: 'staging', palletSpaces: 1 })],
      products: [],
      pallets,
    });
    expect(areas.map((a) => a.pallets.map((p) => p.id))).toEqual([[1, 2], [3, 4]]);
    expect(areas.map((a) => a.fill)).toEqual([1, 2]);
    expect(unstagedPallets).toEqual([]);
    expect(totals.pallets).toEqual({ total: 4, spaces: 3, unstaged: 0 });
  });

  it('keeps pallets with no staging area apart', () => {
    const { unstagedPallets, totals } = placeStock({ areas: [area(1)], products: [], pallets: [{ id: 9 }] });
    expect(unstagedPallets).toEqual([{ id: 9 }]);
    expect(totals.pallets.unstaged).toBe(1);
  });

  it('adds up weight and capacity, and counts what cannot be weighed', () => {
    const { areas, totals } = placeStock({
      areas: [area(1, { capacityKg: 100 }), area(2, { kind: 'cold' })],
      counts: [count(1, 1, 20), count(1, 2, 4), count(2, 3, 6)],
      products: [product(1, 20), product(2, 4, { unit: 'each', weightKg: 0.5 }), product(3, 6, { unit: 'each' })],
    });
    expect(areas[0]).toMatchObject({ heldKg: 22, fill: 0.22, unweighed: 0 });
    expect(areas[1]).toMatchObject({ heldKg: 0, fill: null, unweighed: 1 });
    expect(totals.storage).toEqual({ heldKg: 22, heldInSizedKg: 22, capacityKg: 100, unweighed: 1 });
    expect(totals.byKind.dry).toEqual({ areas: 1, heldKg: 22, capacityKg: 100 });
  });

  it('shows what was counted, and the rest as not placed', () => {
    const { areas, products } = placeStock({
      areas: [area(1), area(2)],
      counts: [count(1, 1, 20), count(2, 1, 10)],
      products: [product(1, 50)],
    });
    expect(areas[0].items[0]).toMatchObject({ productId: 1, counted: 20, about: 20, scaled: false });
    expect(areas[1].items[0]).toMatchObject({ counted: 10, about: 10 });
    expect(products[0]).toMatchObject({ countedTotal: 30, placed: 30, unplaced: 20 });
  });

  it('scales the areas down in proportion once stock has left, never past what is on hand', () => {
    const { areas, products } = placeStock({
      areas: [area(1), area(2)],
      counts: [count(1, 1, 60), count(2, 1, 40)],
      products: [product(1, 50)],
    });
    expect(areas[0].items[0]).toMatchObject({ counted: 60, about: 30, scaled: true });
    expect(areas[1].items[0]).toMatchObject({ counted: 40, about: 20, scaled: true });
    expect(products[0]).toMatchObject({ countedTotal: 100, placed: 50, unplaced: 0 });
  });

  it('shows nothing in the areas of a product with none on hand', () => {
    const { areas, products } = placeStock({ areas: [area(1)], counts: [count(1, 1, 5)], products: [product(1, -3)] });
    expect(areas[0].items[0].about).toBe(0);
    expect(products[0]).toMatchObject({ placed: 0, unplaced: 0 });
  });

  it('ignores zero counts, areas off the plan and products no longer active', () => {
    const { areas, products } = placeStock({
      areas: [area(1)],
      counts: [count(1, 1, 0), count(9, 1, 10), count(1, 7, 10)],
      products: [product(1, 10)],
    });
    expect(areas[0].items).toEqual([]);
    expect(products[0].unplaced).toBe(10);
  });

  it('gives an area its soonest expiry, its newest count and its programmes by product', () => {
    const { areas } = placeStock({
      areas: [area(1)],
      counts: [count(1, 1, 5, '2026-10-01T08:00:00Z'), count(1, 2, 5, '2026-10-12T08:00:00Z'), count(1, 3, 5)],
      products: [
        product(1, 5, { earliestExpiry: '2026-11-02', programmeId: 1, programmeName: 'NOC' }),
        product(2, 5, { earliestExpiry: '2026-10-20', programmeId: 1, programmeName: 'NOC' }),
        product(3, 5, { programmeId: 2, programmeName: 'Feed the Soil' }),
      ],
    });
    expect(areas[0].earliestExpiry).toBe('2026-10-20');
    expect(areas[0].lastCountedAt).toBe('2026-10-12T08:00:00.000Z');
    expect(areas[0].programmes).toEqual([
      { id: 1, name: 'NOC', products: 2 },
      { id: 2, name: 'Feed the Soil', products: 1 },
    ]);
  });
});

describe('weightKg', () => {
  it('converts weights, sized units and litres, and uses an item weight for each', () => {
    expect(weightKg({ unit: 'g' }, 500)).toBe(0.5);
    expect(weightKg({ unit: 'crate' }, 2, { crate: 12 })).toBe(24);
    expect(weightKg({ unit: 'punnet' }, 4, { punnet: 250 })).toBe(1);
    expect(weightKg({ unit: 'l' }, 3)).toBe(3);
    expect(weightKg({ unit: 'each', weightKg: 0.4 }, 10)).toBe(4);
    expect(weightKg({ unit: 'each' }, 10)).toBeNull();
  });
});

describe('checkLayout', () => {
  const good = (extra = {}) => ({ name: 'Dry store A', kind: 'dry', x: 0, y: 0, w: 4, h: 3, ...extra });

  it('accepts a plan and fills in one level by default', () => {
    expect(checkLayout([good()])).toEqual({ areas: [{
      id: null, name: 'Dry store A', kind: 'dry', x: 0, y: 0, w: 4, h: 3, levels: 1,
      capacityKg: null, palletSpaces: null, preferredProductIds: [], preferredCategories: [],
    }] });
  });

  it('keeps what applies to each kind and drops the rest', () => {
    const { areas } = checkLayout([
      good({ capacityKg: '500', palletSpaces: 4, preferredProductIds: [3, 3, '5'], preferredCategories: [' Rice ', 'rice', ''] }),
      good({ name: 'Bay', kind: 'staging', x: 10, capacityKg: 500, palletSpaces: '6', preferredProductIds: [1] }),
      good({ name: 'Door', kind: 'door', x: 20, capacityKg: 5 }),
    ]);
    expect(areas[0]).toMatchObject({ capacityKg: 500, palletSpaces: null, preferredProductIds: [3, 5], preferredCategories: ['rice'] });
    expect(areas[1]).toMatchObject({ capacityKg: null, palletSpaces: 6, preferredProductIds: [] });
    expect(areas[2]).toMatchObject({ capacityKg: null, palletSpaces: null });
  });

  it.each([
    ['not a list', 'nope', /list of areas/],
    ['no name', [good({ name: '  ' })], /Give area 1 a name/],
    ['an unknown kind', [good({ kind: 'roof' })], /dry store, cold room, floor, pallet staging or door/],
    ['a fraction of a square', [good({ w: 2.5 })], /whole-number position/],
    ['off the grid', [good({ x: 38 })], /runs off the edge/],
    ['too tall', [good({ levels: 9 })], /1 to 4 levels/],
    ['two of one name', [good(), good({ name: 'dry store a', x: 10 })], /Two areas are called/],
    ['a capacity of 0', [good({ capacityKg: 0 })], /capacity above 0 kg/],
    ['part of a pallet space', [good({ kind: 'staging', palletSpaces: 1.5 })], /pallet spaces/],
    ['an overlap', [good(), good({ name: 'Cold room', kind: 'cold', x: 3, y: 2 })], /overlap/],
  ])('refuses %s', (_label, input, message) => {
    expect(checkLayout(input).error).toMatch(message);
  });

  it('lets areas touch edge to edge', () => {
    expect(checkLayout([good(), good({ name: 'Floor', kind: 'floor', x: 4 })]).error).toBeUndefined();
  });
});

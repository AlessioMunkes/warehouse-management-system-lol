// ─────────────────────────────────────────────────────────────
// server/__tests__/warehouseMap.placement.test.js
//
// What each area of the map holds, worked out from the newest counts
// and what is on hand (features/warehouseMap/placement.js), and the
// checks on a floor plan (features/warehouseMap/layout.js). Pure: no
// database.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { placeStock } from '../src/features/warehouseMap/placement.js';
import { checkLayout } from '../src/features/warehouseMap/layout.js';

const area = (id, extra = {}) => ({ id, name: `Area ${id}`, kind: 'dry', x: id * 5, y: 0, w: 4, h: 3, levels: 1, ...extra });
const product = (id, onHand, extra = {}) => ({
  id, name: `Product ${id}`, sku: `P${id}`, unit: 'kg', onHand,
  programmeId: null, programmeName: null, storageType: 'dry', earliestExpiry: null, ...extra,
});
const count = (areaId, productId, quantity, countedAt = '2026-10-10T08:00:00Z') => ({ areaId, productId, quantity, countedAt, countedByName: 'Grizel' });

describe('placeStock', () => {
  it('leaves a product nobody counted all not placed', () => {
    const { areas, products } = placeStock({ areas: [area(1)], counts: [], products: [product(1, 50)] });
    expect(areas[0].items).toEqual([]);
    expect(products[0]).toMatchObject({ countedTotal: 0, placed: 0, unplaced: 50 });
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

describe('checkLayout', () => {
  const good = (extra = {}) => ({ name: 'Dry store A', kind: 'dry', x: 0, y: 0, w: 4, h: 3, ...extra });

  it('accepts a plan and fills in one level by default', () => {
    expect(checkLayout([good()])).toEqual({ areas: [{ id: null, name: 'Dry store A', kind: 'dry', x: 0, y: 0, w: 4, h: 3, levels: 1 }] });
  });

  it.each([
    ['not a list', 'nope', /list of areas/],
    ['no name', [good({ name: '  ' })], /Give area 1 a name/],
    ['an unknown kind', [good({ kind: 'roof' })], /dry store, cold room, floor or door/],
    ['a fraction of a square', [good({ w: 2.5 })], /whole-number position/],
    ['off the grid', [good({ x: 38 })], /runs off the edge/],
    ['too tall', [good({ levels: 9 })], /1 to 4 levels/],
    ['two of one name', [good(), good({ name: 'dry store a', x: 10 })], /Two areas are called/],
    ['an overlap', [good(), good({ name: 'Cold room', kind: 'cold', x: 3, y: 2 })], /overlap/],
  ])('refuses %s', (_label, input, message) => {
    expect(checkLayout(input).error).toMatch(message);
  });

  it('lets areas touch edge to edge', () => {
    expect(checkLayout([good(), good({ name: 'Floor', kind: 'floor', x: 4 })]).error).toBeUndefined();
  });
});

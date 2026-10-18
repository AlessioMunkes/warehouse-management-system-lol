// ─────────────────────────────────────────────────────────────
// server/__tests__/warehouseMap.service.test.js
//
// The warehouse map's rules: a plan is checked before it is written, a
// count replaces what an area held, and a database without migration
// 048 reads as "no map yet" rather than failing. The repository, the
// shelf estimate and the transaction are mocked.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  listAreas: vi.fn(),
  getArea: vi.fn(),
  listLatestCounts: vi.fn(),
  listMapProducts: vi.fn(),
  listPackedPallets: vi.fn(),
  readUnitSizes: vi.fn(),
  productsForCount: vi.fn(),
  saveLayout: vi.fn(),
  latestCountsForArea: vi.fn(),
  insertCounts: vi.fn(),
};
vi.mock('../src/repositories/warehouseMap.repository.js', () => ({ default: repoMock }));
vi.mock('../src/repositories/shelfLots.repository.js', () => ({
  loadShelfLots: vi.fn(async () => new Map()),
  todayInSAST: () => '2026-10-18',
}));
vi.mock('../src/features/units/wholeItems.js', () => ({ assertWholeByProduct: vi.fn(async () => {}) }));
const client = { query: vi.fn() };
vi.mock('../src/utils/transaction.js', () => ({ withTransaction: vi.fn(async (work) => work(client)) }));

const { default: mapService } = await import('../src/services/warehouseMap.service.js');

const AREA = { id: 3, name: 'Dry store A', kind: 'dry', x: 0, y: 0, w: 4, h: 3, levels: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  mapService.clearMapCache();
  repoMock.listPackedPallets.mockResolvedValue([]);
  repoMock.readUnitSizes.mockResolvedValue({});
  repoMock.listAreas.mockResolvedValue([AREA]);
  repoMock.listLatestCounts.mockResolvedValue([]);
  repoMock.listMapProducts.mockResolvedValue([
    { id: 1, name: 'Rice', sku: 'R1', unit: 'kg', on_hand: '40', on_pallets: '0', programme_id: null, programme_name: null },
  ]);
  repoMock.getArea.mockResolvedValue(AREA);
  repoMock.latestCountsForArea.mockResolvedValue([]);
  repoMock.productsForCount.mockImplementation(async (ids) => ids.map((id) => ({ id, name: `P${id}`, on_hand: '40', unit: 'kg' })));
});

describe('getMap', () => {
  it('returns the plan with what each area holds and what is not placed', async () => {
    repoMock.listLatestCounts.mockResolvedValue([{ area_id: 3, product_id: 1, quantity: '15', counted_at: '2026-10-17T09:00:00Z', counted_by_name: 'Grizel' }]);
    const map = await mapService.getMap();
    expect(map.ready).toBe(true);
    expect(map.grid).toEqual({ cols: 40, rows: 24 });
    expect(map.areas[0].items[0]).toMatchObject({ productId: 1, about: 15 });
    expect(map.products[0]).toMatchObject({ onHand: 40, placed: 15, unplaced: 25 });
  });

  it('keeps the answer for a few seconds, and drops it when a count is saved', async () => {
    await mapService.getMap();
    await mapService.getMap();
    expect(repoMock.listMapProducts).toHaveBeenCalledTimes(1);
    await mapService.recordCount(3, { lines: [{ productId: 1, quantity: 5 }] }, 9);
    expect(repoMock.listMapProducts).toHaveBeenCalledTimes(2);
  });

  it('stands packed pallets in a staging area and takes their stock off the shelves', async () => {
    repoMock.listAreas.mockResolvedValue([AREA, { id: 4, name: 'Bay', kind: 'staging', x: 10, y: 0, w: 3, h: 2, levels: 1, pallet_spaces: 6 }]);
    repoMock.listMapProducts.mockResolvedValue([{ id: 1, name: 'Rice', unit: 'kg', on_hand: '40', on_pallets: '15' }]);
    repoMock.listPackedPallets.mockResolvedValue([{ id: 70, pallet_ref: 'PAL-70', beneficiary: 'Sunflower ECD', dispatch_date: '2026-10-20' }]);
    const map = await mapService.getMap();
    expect(map.areas[1].pallets).toEqual([{ id: 70, ref: 'PAL-70', beneficiary: 'Sunflower ECD', dispatchDate: '2026-10-20' }]);
    expect(map.products[0]).toMatchObject({ shelf: 25, onPallets: 15, unplaced: 25 });
  });

  it('says there is no map yet on a database without the tables', async () => {
    repoMock.listAreas.mockResolvedValue(null);
    await expect(mapService.getMap()).resolves.toMatchObject({ ready: false, areas: [], products: [] });
  });
});

describe('saveLayout', () => {
  it('refuses a plan with overlapping areas and writes nothing', async () => {
    const areas = [
      { name: 'A', kind: 'dry', x: 0, y: 0, w: 4, h: 4 },
      { name: 'B', kind: 'cold', x: 2, y: 2, w: 4, h: 4 },
    ];
    await expect(mapService.saveLayout({ areas }, 7)).rejects.toMatchObject({ status: 400 });
    expect(repoMock.saveLayout).not.toHaveBeenCalled();
  });

  it('writes a good plan as the signed-in admin', async () => {
    await mapService.saveLayout({ areas: [{ id: 3, name: ' Dry store A ', kind: 'dry', x: 1, y: 1, w: 3, h: 2, levels: 2 }] }, 7);
    expect(repoMock.saveLayout).toHaveBeenCalledWith(client, [
      { id: 3, name: 'Dry store A', kind: 'dry', x: 1, y: 1, w: 3, h: 2, levels: 2,
        capacityKg: null, palletSpaces: null, preferredProductIds: [], preferredCategories: [] },
    ], 7);
  });

  it('asks for the database update when the tables are missing', async () => {
    repoMock.saveLayout.mockRejectedValueOnce(Object.assign(new Error('no table'), { code: '42P01' }));
    await expect(mapService.saveLayout({ areas: [] }, 7)).rejects.toMatchObject({ status: 503 });
  });
});

describe('recordCount', () => {
  it('records each line with the balance and unit at the time', async () => {
    await mapService.recordCount('3', { lines: [{ productId: 1, quantity: '12.5' }] }, 9);
    expect(repoMock.insertCounts).toHaveBeenCalledWith(client, {
      areaId: 3, countedBy: 9, lines: [{ productId: 1, quantity: 12.5, unit: 'kg', onHand: 40 }],
    });
  });

  it('records 0 for a product the area held that was not counted this time', async () => {
    repoMock.latestCountsForArea.mockResolvedValue([{ product_id: 2, quantity: '8' }, { product_id: 4, quantity: '0' }]);
    await mapService.recordCount(3, { lines: [{ productId: 1, quantity: 5 }] }, 9);
    const { lines } = repoMock.insertCounts.mock.calls[0][1];
    expect(lines.map((l) => [l.productId, l.quantity])).toEqual([[1, 5], [2, 0]]);
  });

  it('refuses a door, an area off the plan, a negative quantity and a product twice', async () => {
    repoMock.getArea.mockResolvedValueOnce({ ...AREA, kind: 'door' });
    await expect(mapService.recordCount(3, { lines: [] }, 9)).rejects.toMatchObject({ status: 400 });
    repoMock.getArea.mockResolvedValueOnce(null);
    await expect(mapService.recordCount(3, { lines: [] }, 9)).rejects.toMatchObject({ status: 404 });
    await expect(mapService.recordCount(3, { lines: [{ productId: 1, quantity: -1 }] }, 9)).rejects.toMatchObject({ status: 400 });
    await expect(mapService.recordCount(3, { lines: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }] }, 9))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.insertCounts).not.toHaveBeenCalled();
  });

  it('never touches the stock ledger', async () => {
    await mapService.recordCount(3, { lines: [{ productId: 1, quantity: 5 }] }, 9);
    expect(client.query).not.toHaveBeenCalled();
  });
});

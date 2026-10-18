// ─────────────────────────────────────────────────────────────
// src/tests/WarehouseMap.test.jsx
//
// The warehouse map: its arithmetic and colours (mapGeometry.js,
// mapOverlays.js), the manager's Map tab (find a product, open an area,
// count it) and the admin's layout builder (add, move, refuse an
// overlap, save the whole plan).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_CAMERA, boxFaces, camera, drawOrder, freeSpot, keepOnGrid, nextName, overlapping, palletBoxes,
} from '../features/warehouseMap/mapGeometry';
import { areasMatching, countedWhen, fillTone, legendFor, toneFor } from '../features/warehouseMap/mapOverlays';

vi.mock('../services/warehouseMapAPI', () => ({
  getWarehouseMap: vi.fn(),
  saveWarehouseLayout: vi.fn(),
  recordAreaCount: vi.fn(),
}));

const { getWarehouseMap, saveWarehouseLayout, recordAreaCount } = await import('../services/warehouseMapAPI');
const { default: WarehouseMapTab } = await import('../features/warehouseMap/WarehouseMapTab');
const { default: WarehouseLayoutPage } = await import('../pages/WarehouseLayoutPage');

const area = (id, extra = {}) => ({
  id, name: `Area ${id}`, kind: 'dry', x: 0, y: 0, w: 4, h: 3, levels: 2,
  items: [], lastCountedAt: null, earliestExpiry: null, programmes: [], ...extra,
});
const item = (productId, about, extra = {}) => ({
  productId, name: `Product ${productId}`, sku: `P${productId}`, unit: 'kg',
  source: 'counted', counted: about, about, kg: about, scaled: false, countedAt: '2026-10-15T08:00:00Z', countedByName: 'Grizel', ...extra,
});

const RICE = { id: 1, name: 'Rice', sku: 'RICE', unit: 'kg', onHand: 50, onPallets: 0, shelf: 50, category: 'Grains', countedTotal: 30, placed: 30, unplaced: 20, storageType: 'dry', programmeId: 1, programmeName: 'NOC', earliestExpiry: '2026-10-25' };
const MILK = { id: 2, name: 'Milk', sku: 'MILK', unit: 'l', onHand: 12, onPallets: 0, shelf: 12, category: 'Dairy', countedTotal: 0, placed: 0, unplaced: 12, storageType: 'cold', programmeId: null, programmeName: null, earliestExpiry: null };

const MAP = {
  ready: true,
  grid: { cols: 40, rows: 24 },
  today: '2026-10-18',
  areas: [
    area(1, { name: 'Dry store 1', capacityKg: 100, heldKg: 30, fill: 0.3, unweighed: 0, items: [item(1, 30, { name: 'Rice', sku: 'RICE' })], lastCountedAt: '2026-10-15T08:00:00Z', earliestExpiry: '2026-10-25', programmes: [{ id: 1, name: 'NOC', products: 1 }] }),
    area(2, { name: 'Cold room 1', kind: 'cold', x: 10 }),
    area(3, { name: 'Door 1', kind: 'door', x: 20, w: 3, h: 1 }),
    area(4, { name: 'Bay 1', kind: 'staging', x: 30, w: 3, h: 2, palletSpaces: 6, fill: 0.333, pallets: [
      { id: 70, ref: 'PAL-70', beneficiary: 'Sunflower ECD', dispatchDate: '2026-10-20' },
      { id: 71, ref: 'PAL-71', beneficiary: 'Rainbow ECD', dispatchDate: '2026-10-20' },
    ] }),
  ],
  products: [RICE, MILK],
  unstagedPallets: [],
  totals: {
    storage: { heldKg: 30, heldInSizedKg: 30, capacityKg: 100, unweighed: 0 },
    byKind: { dry: { areas: 1, heldKg: 30, capacityKg: 100 }, cold: { areas: 1, heldKg: 0, capacityKg: null }, floor: { areas: 0, heldKg: 0, capacityKg: null } },
    pallets: { total: 2, spaces: 6, unstaged: 0 },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getWarehouseMap.mockResolvedValue(MAP);
  recordAreaCount.mockResolvedValue(MAP);
  saveWarehouseLayout.mockImplementation(async (areas) => ({
    ...MAP, areas: areas.map((a, i) => ({ ...a, id: a.id ?? 100 + i, items: [], programmes: [] })),
  }));
});

// ── Arithmetic ────────────────────────────────────────────────
describe('mapGeometry', () => {
  it('finds the first free spot and names the next area of a kind', () => {
    const areas = [{ id: 1, name: 'Dry store 1', x: 0, y: 0, w: 6, h: 2 }];
    expect(freeSpot(areas, { w: 4, h: 2 })).toEqual({ x: 6, y: 0 });
    expect(nextName(areas, 'dry')).toBe('Dry store 2');
  });

  it('spots overlaps, but not areas that only touch', () => {
    const a = { id: 1, x: 0, y: 0, w: 4, h: 4 };
    expect(overlapping([a, { id: 2, x: 4, y: 0, w: 2, h: 2 }]).size).toBe(0);
    expect([...overlapping([a, { id: 3, x: 3, y: 3, w: 2, h: 2 }])]).toEqual([1, 3]);
  });

  it('keeps an area on the grid by moving it', () => {
    expect(keepOnGrid({ x: 38, y: -2, w: 6, h: 3 })).toMatchObject({ x: 34, y: 0, w: 6, h: 3 });
  });

  it('draws the far areas first in 3D, whichever way the view is turned', () => {
    const near = { id: 'near', x: 10, y: 10, w: 2, h: 2, z0: 0, z1: 2 };
    const far = { id: 'far', x: 0, y: 0, w: 2, h: 2, z0: 0, z1: 2 };
    const long = { id: 'long', x: 0, y: 4, w: 20, h: 1, z0: 0, z1: 2 };
    const flat = { id: 'flat', x: 30, y: 20, w: 4, h: 2, z0: 0, z1: 0.06 };
    expect(drawOrder([near, long, far, flat], camera(DEFAULT_CAMERA)).map((a) => a.id)).toEqual(['flat', 'far', 'long', 'near']);
    expect(drawOrder([near, long, far], camera({ yaw: 225, tilt: 35 })).map((a) => a.id)).toEqual(['near', 'long', 'far']);
  });

  it('shows the walls facing the camera: two at a corner view, one face on', () => {
    const box = { x: 0, y: 0, w: 2, h: 2, z0: 0, z1: 1 };
    expect(boxFaces(box, camera(DEFAULT_CAMERA)).walls).toHaveLength(2);
    expect(boxFaces(box, camera({ yaw: 0, tilt: 35 })).walls).toHaveLength(1);
  });

  it('stands pallets a square each, then a second layer high', () => {
    const bay = { id: 9, x: 0, y: 0, w: 2, h: 1 };
    const boxes = palletBoxes(bay, 3);
    expect(boxes).toHaveLength(3);
    expect(boxes[2].z0).toBeGreaterThan(boxes[0].z0);
    expect(palletBoxes(bay, 50)).toHaveLength(4);
  });
});

describe('mapOverlays', () => {
  const ctx = { today: '2026-10-18', now: new Date('2026-10-18T10:00:00Z'), programmeTones: { 1: 'info' } };

  it('colours by the soonest expiry the area holds', () => {
    expect(toneFor(area(1, { items: [item(1, 5)], earliestExpiry: '2026-10-25' }), 'expiry', ctx)).toBe('bad');
    expect(toneFor(area(1, { items: [item(1, 5)], earliestExpiry: '2026-11-10' }), 'expiry', ctx)).toBe('warn');
    expect(toneFor(area(1, { items: [item(1, 5)] }), 'expiry', ctx)).toBe('neutral');
    expect(toneFor(area(1), 'expiry', ctx)).toBe('empty');
  });

  it('colours by how long since the area was counted', () => {
    expect(toneFor(area(1, { lastCountedAt: '2026-10-15T08:00:00Z' }), 'counted', ctx)).toBe('good');
    expect(toneFor(area(1, { lastCountedAt: '2026-08-01T08:00:00Z' }), 'counted', ctx)).toBe('bad');
    expect(toneFor(area(1), 'counted', ctx)).toBe('empty');
    expect(countedWhen('2026-10-15T08:00:00Z', ctx.now)).toBe('Counted 3 days ago');
  });

  it('colours by how full an area is', () => {
    expect(fillTone(null)).toBe('neutral');
    expect(fillTone(0.4)).toBe('good');
    expect(fillTone(0.85)).toBe('warn');
    expect(fillTone(1.2)).toBe('bad');
    expect(toneFor(area(1, { fill: 0.9 }), 'fill', ctx)).toBe('warn');
  });

  it('colours by programme, and always draws a door as a door', () => {
    expect(toneFor(area(1, { items: [item(1, 5)], programmes: [{ id: 1, name: 'NOC', products: 1 }] }), 'programme', ctx)).toBe('info');
    expect(toneFor(area(1, { kind: 'door' }), 'expiry', ctx)).toBe('door');
    expect(legendFor('programme', { products: [RICE, MILK] }).map((l) => l.label)).toEqual(['NOC', 'No programme', 'Empty']);
  });

  it('finds the areas holding a product by name or SKU', () => {
    expect([...areasMatching(MAP.areas, 'ric')]).toEqual([1]);
    expect(areasMatching(MAP.areas, ' ')).toBeNull();
  });
});

// ── The manager's Map tab ─────────────────────────────────────
describe('WarehouseMapTab', () => {
  it('opens an area and shows what it holds beside the stock take', async () => {
    const user = userEvent.setup();
    const onAdjust = vi.fn();
    render(<WarehouseMapTab canAdjust onAdjust={onAdjust} />);

    await user.click(await screen.findByRole('button', { name: /^Dry store 1, Dry store/ }));
    const panel = within(await screen.findByRole('dialog'));
    expect(panel.getByText('Rice')).toBeInTheDocument();
    expect(panel.getByText('About 30 kg of 100 kg · 30%')).toBeInTheDocument();
    expect(panel.getByText(/All areas: 30 kg counted, 50 kg on the shelves/)).toBeInTheDocument();
    await user.click(panel.getByRole('button', { name: /Adjust stock/ }));
    expect(onAdjust).toHaveBeenCalledWith(1);
  });

  it('never makes a door a button', async () => {
    render(<WarehouseMapTab />);
    await screen.findByRole('button', { name: /^Dry store 1, Dry store/ });
    expect(screen.queryByRole('button', { name: /^Door 1, Door/ })).toBeNull();
  });

  it('counts an area: corrects a line, adds a product and saves the whole list', async () => {
    const user = userEvent.setup();
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /^Dry store 1, Dry store/ }));
    await user.click(await screen.findByRole('button', { name: /Count this area/ }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Count Dry store 1' }));
    const rice = dialog.getByLabelText('Rice');
    await user.clear(rice);
    await user.type(rice, '28');
    await user.type(dialog.getByRole('searchbox', { name: /Add a product/ }), 'milk');
    await user.click(dialog.getByRole('button', { name: /Milk/ }));
    await user.click(dialog.getByRole('button', { name: 'Save count' }));

    await waitFor(() => expect(recordAreaCount).toHaveBeenCalledWith(1, [
      { productId: 1, quantity: 28 },
      { productId: 2, quantity: 12 },
    ]));
  });

  it('says where a product is when no counted area holds it', async () => {
    const user = userEvent.setup();
    render(<WarehouseMapTab />);
    await user.type(await screen.findByRole('searchbox', { name: /Find a product/ }), 'milk');
    expect(screen.getByRole('status')).toHaveTextContent('Milk: 12 l not placed in any area.');
  });

  it('lists what is not placed', async () => {
    const user = userEvent.setup();
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /Not placed/ }));
    const panel = within(await screen.findByRole('dialog'));
    expect(panel.getByText('20 kg')).toBeInTheDocument();
    expect(panel.getByText('12 l')).toBeInTheDocument();
  });

  it('opens a staging area to the pallets waiting in it', async () => {
    const user = userEvent.setup();
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /^Bay 1, Pallet staging/ }));
    const panel = within(await screen.findByRole('dialog'));
    expect(panel.getByText('2 pallets of 6 spaces · 33%')).toBeInTheDocument();
    expect(panel.getByText('Sunflower ECD')).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: /Count this area/ })).toBeNull();
  });

  it('shows the capacity of the warehouse and of each area under the map', async () => {
    render(<WarehouseMapTab />);
    expect(await screen.findByRole('meter', { name: 'All storage' })).toHaveAttribute('aria-valuenow', '30');
    expect(screen.getByRole('meter', { name: 'Pallet staging' })).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByRole('meter', { name: 'Dry store 1' })).toBeInTheDocument();
  });

  it('turns the 3D view with its buttons', async () => {
    const user = userEvent.setup();
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /3D/ }));
    const before = screen.getByRole('group', { name: /3D view/ }).getAttribute('viewBox');
    const shape = () => screen.getByRole('button', { name: /^Dry store 1, Dry store/ }).querySelector('polygon').getAttribute('points');
    const first = shape();
    await user.click(screen.getByRole('button', { name: 'Turn left' }));
    expect(shape()).not.toBe(first);
    expect(screen.getByRole('group', { name: /3D view/ }).getAttribute('viewBox')).toBe(before);
  });

  it('explains an empty map', async () => {
    getWarehouseMap.mockResolvedValue({ ...MAP, areas: [] });
    render(<WarehouseMapTab />);
    expect(await screen.findByText('No warehouse map yet')).toBeInTheDocument();
  });
});

// ── The admin's layout builder ────────────────────────────────
describe('WarehouseLayoutPage', () => {
  it('adds an area, moves it with the keyboard and saves the whole plan', async () => {
    const user = userEvent.setup();
    render(<WarehouseLayoutPage />);
    const save = await screen.findByRole('button', { name: 'Save layout' });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Floor' }));
    const added = screen.getByRole('button', { name: /^Floor 1, Floor/ });
    fireEvent.keyDown(added, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: /^Floor 1, Floor/ })).toBeInTheDocument();

    await user.click(save);
    await waitFor(() => expect(saveWarehouseLayout).toHaveBeenCalled());
    const sent = saveWarehouseLayout.mock.calls[0][0];
    expect(sent).toHaveLength(5);
    expect(sent.slice(0, 4).map((a) => a.id)).toEqual([1, 2, 3, 4]);
    expect(sent[4]).toMatchObject({ id: null, name: 'Floor 1', kind: 'floor', w: 4, h: 4, capacityKg: null, preferredProductIds: [] });
  });

  it("sets an area's capacity and the stock it is meant for", async () => {
    const user = userEvent.setup();
    render(<WarehouseLayoutPage />);
    const cold = await screen.findByRole('button', { name: /^Cold room 1, Cold room/ });
    cold.focus();
    await user.type(await screen.findByLabelText('Capacity (kg)'), '800');
    await user.click(screen.getByRole('button', { name: 'Dairy' }));
    await user.type(screen.getByRole('searchbox', { name: 'Add a preferred product' }), 'rice');
    await user.click(within(screen.getByRole('list', { name: 'Matching products' })).getByRole('button', { name: /Rice/ }));
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    await waitFor(() => expect(saveWarehouseLayout).toHaveBeenCalled());
    expect(saveWarehouseLayout.mock.calls[0][0][1]).toMatchObject({
      id: 2, capacityKg: 800, preferredCategories: ['Dairy'], preferredProductIds: [1],
    });
  });

  it('will not save areas that overlap', async () => {
    const user = userEvent.setup();
    render(<WarehouseLayoutPage />);
    const save = await screen.findByRole('button', { name: 'Save layout' });
    const cold = screen.getByRole('button', { name: /^Cold room 1, Cold room/ });
    cold.focus();
    // Ten squares left puts it on top of Dry store 1.
    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(cold, { key: 'ArrowLeft' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Areas in red overlap');
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tells the admin when the database has not been updated', async () => {
    getWarehouseMap.mockResolvedValue({ ...MAP, ready: false, areas: [] });
    render(<WarehouseLayoutPage />);
    expect(await screen.findByText('This warehouse needs a database update')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save layout' })).toBeNull();
  });
});

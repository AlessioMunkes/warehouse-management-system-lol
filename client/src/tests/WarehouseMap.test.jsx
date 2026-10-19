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
  gateOutward, productStacks, truckBoxes,
} from '../features/warehouseMap/mapGeometry';
import { areasMatching, countedWhen, fillTone, legendFor, toneFor } from '../features/warehouseMap/mapOverlays';
import { alertsFor, badgeFor, figureOf, heldText, palletDue, stockMode } from '../features/warehouseMap/mapIndicators';
import { zoomAbout, zoomedBox } from '../features/warehouseMap/useMapZoom';
import { gateActivity, todayCards, withGates } from '../features/warehouseMap/mapActivity';

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
    // The turn is animated (or instant under Reduce movement).
    await waitFor(() => expect(shape()).not.toBe(first));
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

// ── Marks: alerts, pallets and the 3D stock block ─────────────
describe('mapIndicators', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  const ctx = { today: '2026-10-18', now };

  it('flags an area over capacity first, then expiry, then an old count', () => {
    const area = { id: 9, kind: 'dry', fill: 1.2, earliestExpiry: '2026-11-05', lastCountedAt: '2026-08-01T08:00:00Z', items: [{ productId: 1, about: 5 }] };
    expect(alertsFor(area, ctx).map((a) => [a.level, a.text])).toEqual([
      ['bad', 'Over capacity: 120% full'],
      ['warn', 'Stock expires in 18 days'],
      ['muted', 'Not counted for 78 days'],
    ]);
    expect(badgeFor(area, ctx)).toMatchObject({ level: 'bad', glyph: '!', more: 2 });
  });

  it('says nothing about a plan with no stock figures, or a calm area', () => {
    expect(alertsFor({ id: 1, kind: 'dry' }, ctx)).toEqual([]);
    expect(badgeFor({ id: 1, kind: 'dry', fill: 0.2, items: [], lastCountedAt: null }, ctx)).toBeNull();
  });

  it('dates pallets against today and flags a staging area', () => {
    expect(palletDue({ dispatchDate: '2026-10-17' }, '2026-10-18')).toBe('overdue');
    expect(palletDue({ dispatchDate: '2026-10-18' }, '2026-10-18')).toBe('today');
    expect(palletDue({ dispatchDate: '2026-10-19' }, '2026-10-18')).toBe('tomorrow');
    expect(palletDue({ dispatchDate: '2026-10-25' }, '2026-10-18')).toBe('later');
    const bay = { id: 4, kind: 'staging', palletSpaces: 6, fill: 0.5, pallets: [{ dispatchDate: '2026-10-17' }, { dispatchDate: '2026-10-18' }, { dispatchDate: '2026-10-18' }] };
    expect(alertsFor(bay, ctx).map((a) => [a.level, a.glyph])).toEqual([['bad', '1'], ['info', '2']]);
    expect(figureOf(bay)).toBe('3/6');
  });

  it('labels an area with how full it is, or what it holds', () => {
    expect(figureOf({ kind: 'dry', fill: 0.456, items: [] })).toBe('46%');
    expect(figureOf({ kind: 'cold', fill: null, items: [{ productId: 1, about: 2, unit: 'each' }, { productId: 1, about: 1, unit: 'each' }] })).toBe('3 each');
    expect(figureOf({ kind: 'cold', fill: null, items: [{ productId: 1, about: 2 }, { productId: 2, about: 1 }] })).toBe('2 products');
    // A capacity is no use for stock with no weight: say what it holds instead.
    expect(figureOf({ kind: 'dry', fill: 0, unweighed: 1, items: [{ productId: 1, about: 500, unit: 'each', kg: null }] })).toBe('500 each');
    expect(figureOf({ kind: 'door' })).toBeNull();
  });
});

describe('the 3D marks', () => {
  it('draws stock inside a glass frame, and a red cap over capacity', async () => {
    const user = userEvent.setup();
    const over = { ...MAP.areas[0], fill: 1.4 };
    getWarehouseMap.mockResolvedValue({ ...MAP, areas: [over, ...MAP.areas.slice(1)] });
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /3D/ }));
    const store = screen.getByRole('button', { name: /^Dry store 1, Dry store/ });
    expect(store.querySelectorAll('polygon.fill-danger').length).toBeGreaterThan(0);
    expect(store.getAttribute('aria-label')).toMatch(/Over capacity: 140% full/);
    expect(screen.getByText(/Solid block: stock against capacity. Red top: over capacity. Stacks: each product/)).toBeInTheDocument();
  });

  it('lights up the areas that need attention', async () => {
    const user = userEvent.setup();
    const over = { ...MAP.areas[0], fill: 1.4 };
    getWarehouseMap.mockResolvedValue({ ...MAP, areas: [over, ...MAP.areas.slice(1)] });
    render(<WarehouseMapTab />);
    const toggle = await screen.findByRole('button', { name: /Needs attention 1/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Dry store 1, Dry store/ })).toHaveAttribute('opacity', '1');
    expect(screen.getByRole('button', { name: /^Cold room 1, Cold room/ })).toHaveAttribute('opacity', '0.3');
  });
});

// ── Zooming, and the panel's marks ────────────────────────────
describe('zoom', () => {
  const fit = { x: 0, y: 0, w: 200, h: 100 };

  it('closes in on the middle, keeps a point under the pointer, and stays in range', () => {
    expect(zoomedBox(fit, { k: 2, dx: 0, dy: 0 })).toEqual({ x: 50, y: 25, w: 100, h: 50 });
    const z = zoomAbout({ k: 1, dx: 0, dy: 0 }, fit, { x: 200, y: 100 }, 2);
    const box = zoomedBox(fit, z);
    // The bottom-right corner is where it was, on screen.
    expect((200 - box.x) / box.w).toBeCloseTo(1, 6);
    expect(zoomAbout({ k: 5.5, dx: 0, dy: 0 }, fit, null, 4).k).toBe(6);
    expect(zoomAbout({ k: 1, dx: 0, dy: 0 }, fit, null, 0.1).k).toBe(0.8);
  });

  it('zooms the 3D view with its buttons and fits the plan again', async () => {
    const user = userEvent.setup();
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /3D/ }));
    const svg = () => screen.getByRole('group', { name: /3D view/ });
    const fitted = svg().getAttribute('viewBox');
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(svg().getAttribute('viewBox')).not.toBe(fitted);
    expect(screen.getByText('140%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fit the plan' }));
    expect(svg().getAttribute('viewBox')).toBe(fitted);
  });

  it('opens the top view fitted to what is drawn, not the whole grid', async () => {
    render(<WarehouseMapTab />);
    const svg = await screen.findByRole('group', { name: /top view/ });
    const [, , w] = svg.getAttribute('viewBox').split(' ').map(Number);
    expect(w).toBeLessThan(40 * 24);
  });
});

describe('the area panel marks', () => {
  it('lists overdue pallets first, marked, and the area\'s alerts under the title', async () => {
    const user = userEvent.setup();
    const bay = {
      ...MAP.areas[3],
      pallets: [
        { id: 80, ref: 'PAL-80', beneficiary: 'Later ECD', dispatchDate: '2026-10-25' },
        { id: 81, ref: 'PAL-81', beneficiary: 'Late ECD', dispatchDate: '2026-10-13' },
        { id: 82, ref: 'PAL-82', beneficiary: 'Today ECD', dispatchDate: '2026-10-18' },
      ],
    };
    getWarehouseMap.mockResolvedValue({ ...MAP, areas: [...MAP.areas.slice(0, 3), bay] });
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /^Bay 1, Pallet staging/ }));
    const panel = within(await screen.findByRole('dialog'));
    const rows = within(panel.getByRole('list', { name: 'Pallets in Bay 1' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Late ECD'), expect.stringContaining('Today ECD'), expect.stringContaining('Later ECD'),
    ]);
    expect(within(rows[0]).getByText('5 days overdue')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Collected today')).toBeInTheDocument();
    expect(panel.getByText('1 pallet past the collection day')).toBeInTheDocument();
    expect(panel.getByText('1 pallet to be collected today')).toBeInTheDocument();
  });
});

// ── Stock with no weight or no capacity still shows ───────────
describe('stock with no weight or capacity', () => {
  const beans = { productId: 1265, name: 'Baked Beans', sku: 'BB', unit: 'each', about: 500, kg: null, source: 'counted', counted: 500, scaled: false, countedAt: '2026-10-18T08:00:00Z' };
  const store = { ...MAP.areas[0], name: 'Dry store 1', capacityKg: null, fill: null, heldKg: 0, unweighed: 1, items: [beans] };

  it('says what an area holds in its own units, never 0 kg', () => {
    expect(heldText(store)).toBe('500 each');
    expect(heldText({ items: [{ ...beans, productId: 2, unit: 'kg', about: 120, kg: 120 }, beans] })).toBe('About 120 kg and 500 each');
    expect(stockMode(store)).toBe('stacks');
    expect(stockMode({ ...store, fill: 0.4, unweighed: 0 })).toBe('fill');
    expect(stockMode({ ...store, items: [] })).toBe('none');
  });

  it('lays out a stack per product, taller for more', () => {
    const stacks = productStacks({ id: 1, kind: 'dry', x: 0, y: 0, w: 10, h: 4, levels: 2 }, [
      { productId: 1, about: 5 }, { productId: 2, about: 5000 }, { productId: 1, about: 3 },
    ]);
    expect(stacks).toHaveLength(2);
    expect(stacks[0].item).toMatchObject({ productId: 2 });
    expect(stacks[0].z1).toBeGreaterThan(stacks[1].z1);
    expect(stacks[1].item.about).toBe(8);
  });

  it('draws the beans as a stack in 3D, names them on hover and lights them on search', async () => {
    const user = userEvent.setup();
    getWarehouseMap.mockResolvedValue({ ...MAP, areas: [store, ...MAP.areas.slice(1)] });
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /3D/ }));
    const area = screen.getByRole('button', { name: /^Dry store 1, Dry store/ });
    const title = [...area.querySelectorAll('title')].map((t) => t.textContent);
    expect(title).toContain('Baked Beans: 500 each');
    expect(area.getAttribute('aria-label')).toMatch(/500 each/);
    await user.type(screen.getByRole('searchbox', { name: /Find a product/ }), 'beans');
    expect(area.querySelector('polygon.fill-info')).not.toBeNull();
  });

  it('shows the beans in the capacity summary, and asks for a capacity', async () => {
    getWarehouseMap.mockResolvedValue({
      ...MAP,
      areas: [store, ...MAP.areas.slice(1)].map((a) => ({ ...a, capacityKg: null, palletSpaces: null, fill: null })),
      totals: { ...MAP.totals, storage: { heldKg: 0, heldInSizedKg: 0, capacityKg: null, unweighed: 1 } },
    });
    render(<WarehouseMapTab />);
    const meter = await screen.findByRole('meter', { name: 'Dry store 1' });
    expect(meter.closest('button')).toHaveTextContent('500 each');
    expect(meter).toHaveAttribute('title', 'No capacity set');
    expect(screen.getByText(/Dashed bars have no capacity set/)).toBeInTheDocument();
    expect(screen.getByText(/shown in its own units/)).toBeInTheDocument();
  });
});

describe('finding a product from its area', () => {
  it('lights up where a product is when its name is chosen in the panel', async () => {
    const user = userEvent.setup();
    render(<WarehouseMapTab />);
    await user.click(await screen.findByRole('button', { name: /^Dry store 1, Dry store/ }));
    const panel = within(await screen.findByRole('dialog'));
    await user.click(panel.getByRole('button', { name: 'Rice' }));
    // Behind the panel, which is modal on a narrow screen.
    expect(screen.getByRole('searchbox', { name: /Find a product/, hidden: true })).toHaveValue('Rice');
    expect(screen.getByRole('button', { name: /^Cold room 1, Cold room/, hidden: true })).toHaveAttribute('opacity', '0.3');
  });
});

// ── The day: gates, trucks and the Today strip ────────────────
describe('the day at the gates', () => {
  const dispatchGate = { id: 20, name: 'Dispatch gate', kind: 'dispatch_gate', x: 30, y: 23, w: 4, h: 1, levels: 1 };
  const receivingGate = { id: 21, name: 'Receiving gate', kind: 'receiving_gate', x: 0, y: 10, w: 1, h: 4, levels: 1 };
  const day = {
    packing: 3, toPackToday: 2, collectedToday: 5, notCollectedToday: 1,
    inbound: [
      { id: 176, po_number: 'PO-2026-0176', status: 'approved', expected_on: '2026-10-11', supplier: "Mambo's", lines: 2 },
      { id: 180, po_number: 'PO-2026-0180', status: 'approved', expected_on: '2026-10-18', supplier: 'Fampak', lines: 1 },
      { id: 181, po_number: 'PO-2026-0181', status: 'in_transit', expected_on: '2026-10-18', supplier: 'Pelican', lines: 3 },
    ],
    receivedToday: [{ id: 9, supplier: 'Pelican', po_number: 'PO-2026-0181', status: 'recorded' }],
    volunteersOnSite: 4, donationsToday: 2, closure: null, benevolentWaiting: 1,
  };
  const DAY_MAP = { ...MAP, day, areas: [...MAP.areas, dispatchGate, receivingGate] };

  it('sends a truck to each gate for what is due, and counts late ones', () => {
    const activity = gateActivity(DAY_MAP);
    expect(activity.dispatch).toMatchObject({ truckCount: 0, collectedToday: 5 });
    expect(activity.receiving.expected.map((po) => po.id)).toEqual([180]);
    expect(activity.receiving.late.map((po) => po.id)).toEqual([176]);
    expect(activity.receiving).toMatchObject({ trucks: 2, tone: 'warn' });
    const withPallets = gateActivity({ ...DAY_MAP, areas: DAY_MAP.areas.map((a) => (a.id === 4 ? { ...a, pallets: [{ id: 1, dispatchDate: '2026-10-17' }, { id: 2, dispatchDate: '2026-10-18' }, { id: 3, dispatchDate: '2026-10-30' }] } : a)) });
    expect(withPallets.dispatch).toMatchObject({ truckCount: 2, trucks: 1, tone: 'bad', later: 1 });
  });

  it('puts the day on the first gate of each kind, and the packing on the staging area', () => {
    const areas = withGates(DAY_MAP.areas, gateActivity(DAY_MAP), 3);
    expect(areas.find((a) => a.id === 21).gate).toMatchObject({ kind: 'receiving', truckCount: 2 });
    expect(areas.find((a) => a.id === 4).packingNow).toBe(3);
    expect(figureOf(areas.find((a) => a.id === 21))).toBe('2 expected');
  });

  it('backs a truck up to the outside of its gate', () => {
    const plan = [{ id: 1, kind: 'dry', x: 5, y: 5, w: 10, h: 10 }, dispatchGate];
    const boxes = truckBoxes(dispatchGate, plan, 1);
    const trailer = boxes.find((b) => b.part === 'trailer');
    // The gate is below the plan, so the truck stands further below it.
    expect(trailer.y).toBeGreaterThanOrEqual(dispatchGate.y + dispatchGate.h);
    expect(boxes.filter((b) => b.part === 'wheel')).toHaveLength(6);
    expect(gateOutward(receivingGate, [{ id: 1, kind: 'dry', x: 5, y: 5, w: 10, h: 10 }])).toEqual({ axis: 'x', sign: -1 });
  });

  it('writes the Today strip, leaving out what could not be read', () => {
    const cards = todayCards(DAY_MAP, gateActivity(DAY_MAP), { needing: 2 });
    expect(cards.map((c) => [c.label, c.value])).toEqual([
      ['Collections', '5 collected'], ['Deliveries', '1 received'], ['Packing now', '3 pallets'],
      ['On site', '4 volunteers'], ['Donations', '2 today'], ['Needs attention', '2 areas'],
    ]);
    expect(cards[1].detail).toBe('1 delivery expected · 1 late');
    expect(todayCards({ ...DAY_MAP, day: { ...day, volunteersOnSite: null } }, gateActivity(DAY_MAP)).map((c) => c.id)).not.toContain('people');
  });

  it('shows the day above the map, a truck at the receiving gate, and opens it', async () => {
    const user = userEvent.setup();
    getWarehouseMap.mockResolvedValue(DAY_MAP);
    render(<WarehouseMapTab />);
    const strip = within(await screen.findByRole('list', { name: 'Today in the warehouse' }));
    expect(strip.getByText('5 collected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /3D/ }));
    const svg = screen.getByRole('group', { name: /3D view/ });
    expect(svg.querySelectorAll('polygon.fill-warn').length).toBeGreaterThan(0);
    await user.click(strip.getByRole('button', { name: /Deliveries/ }));
    const panel = within(await screen.findByRole('dialog'));
    expect(panel.getByText("Mambo's")).toBeInTheDocument();
    expect(panel.getByText('7 days late')).toBeInTheDocument();
    expect(panel.getByText('Received today')).toBeInTheDocument();
  });

  it('says when the warehouse is closed today', async () => {
    getWarehouseMap.mockResolvedValue({ ...DAY_MAP, day: { ...day, closure: { label: 'Heritage Day', kind: 'public_holiday' } } });
    render(<WarehouseMapTab />);
    expect(await screen.findByText('The warehouse is closed today: Heritage Day.')).toBeInTheDocument();
  });
});

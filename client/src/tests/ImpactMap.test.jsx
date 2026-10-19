// ─────────────────────────────────────────────────────────────
// src/tests/ImpactMap.test.jsx
//
// The Impact map and Centre locations: the circle scale (area in
// proportion to meals), the filters and totals, the period presets in
// South African days, the manager's page (strip, filters, the
// not-served list) and the admin's list (views, saving a pin). Leaflet
// is swapped for a stand-in that lists what it was asked to draw: jsdom
// has no layout for a real map.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_RADIUS, MIN_RADIUS, radiusFor } from '../features/impactMap/impactScale';
import {
  cohortLabel, filterCentres, notServedList, presetOf, presetRange, sinceText, summarise,
} from '../features/impactMap/impactView';

vi.mock('../services/impactMapAPI', () => ({
  getImpactMap: vi.fn(),
  listCentreLocations: vi.fn(),
  setCentreLocation: vi.fn(),
}));
vi.mock('../features/impactMap/ImpactLeafletMap', () => ({
  default: ({ centres, toneOf, sizeOf, focusId }) => (
    <ul aria-label="Drawn on the map" data-focus={focusId ?? ''}>
      {centres.map((c) => <li key={c.id}>{`${c.name}|${toneOf(c)}|${sizeOf(c)}`}</li>)}
    </ul>
  ),
}));
vi.mock('../features/impactMap/LocationPicker', () => ({
  default: ({ lat, lng, onChange }) => (
    <button type="button" onClick={() => onChange({ lat: -34.05, lng: 18.67 })}>{`pin ${lat},${lng}`}</button>
  ),
}));

const { getImpactMap, listCentreLocations, setCentreLocation } = await import('../services/impactMapAPI');
const { default: ImpactMapPage } = await import('../pages/ImpactMapPage');
const { default: CentreLocationsPage } = await import('../pages/CentreLocationsPage');

const centre = (id, extra = {}) => ({
  id, name: `Centre ${id}`, cohort: 'tuesday', childCount: 30, isActive: true, suburb: 'Delft',
  lat: -33.99, lng: 18.63, dispatches: 3, kg: 30.4, meals: 76, lastCollected: '2026-10-14', ...extra,
});

const MAP = {
  range: { from: '2026-07-22', to: '2026-10-19', today: '2026-10-19' },
  factor: { value: 2.5, note: null },
  centres: [
    centre(1, { name: 'Alfa Educare', kg: 100.25, meals: 251 }),
    centre(2, { name: 'Baphumelela', cohort: 'thursday', kg: 40.1, meals: 100 }),
    centre(3, { name: 'Zama Educare', dispatches: 0, kg: 0, meals: 0, lastCollected: '2026-06-01' }),
    centre(4, { name: 'Hidden Educare', cohort: 'thursday', lat: null, lng: null, dispatches: 0, kg: 0, meals: 0, lastCollected: null }),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getImpactMap.mockResolvedValue(MAP);
});

// ── Pure rules ────────────────────────────────────────────────
describe('radiusFor', () => {
  it('gives the largest the full radius and a quarter of the meals half of it', () => {
    expect(radiusFor(400, 400)).toBe(MAX_RADIUS);
    expect(radiusFor(100, 400)).toBe(MAX_RADIUS / 2);
  });

  it('keeps circle areas in proportion to meals above the smallest size', () => {
    const area = (v) => radiusFor(v, 1000) ** 2;
    expect(area(800) / area(200)).toBeCloseTo(4, 6);
  });

  it('never draws smaller than the minimum, nor bigger than the maximum', () => {
    expect(radiusFor(1, 100000)).toBe(MIN_RADIUS);
    expect(radiusFor(0, 400)).toBe(MIN_RADIUS);
    expect(radiusFor(500, 400)).toBe(MAX_RADIUS);
    expect(radiusFor(10, 0)).toBe(MIN_RADIUS);
  });
});

describe('impactView', () => {
  it('works out total meals from total kilograms, as the report does', () => {
    // 3 centres of 0.3 kg each: each rounds to 1 meal, together 2.25 is 2.
    const tiny = [1, 2, 3].map((id) => centre(id, { kg: 0.3, meals: 1 }));
    expect(summarise(tiny, { value: 2.5 }).meals).toBe(2);
    expect(summarise(tiny, null).meals).toBeNull();
  });

  it('counts served, not served and not on the map', () => {
    expect(summarise(MAP.centres, MAP.factor)).toEqual({ meals: 351, kg: 140, dispatches: 6, served: 2, notServed: 2, unplaced: 1 });
  });

  it('filters by cohort and to the centres not served', () => {
    expect(filterCentres(MAP.centres, { cohort: 'thursday' }).map((c) => c.id)).toEqual([2, 4]);
    expect(filterCentres(MAP.centres, { notServedOnly: true }).map((c) => c.id)).toEqual([3, 4]);
  });

  it('lists the never-collected first, then the longest waiting', () => {
    expect(notServedList(MAP.centres).map((c) => c.id)).toEqual([4, 3]);
    expect(sinceText('2026-06-01', '2026-10-19')).toBe('140 days ago');
    expect(sinceText(null, '2026-10-19')).toBe('Never collected');
  });

  it('counts presets back from the server\'s today, inclusive', () => {
    expect(presetRange(90, '2026-10-19')).toEqual({ from: '2026-07-22', to: '2026-10-19' });
    expect(presetOf(MAP.range)).toBe(90);
    expect(presetOf({ from: '2026-07-22', to: '2026-10-18', today: '2026-10-19' })).toBeNull();
  });

  it('reads cohorts, the old week values too', () => {
    expect(cohortLabel('tuesday')).toBe('Tuesday');
    expect(cohortLabel('week1')).toBe('Week 1');
  });
});

// ── The manager's page ────────────────────────────────────────
describe('ImpactMapPage', () => {
  it('shows the strip, draws the placed centres by cohort and greys the unserved', async () => {
    render(<ImpactMapPage />);
    const strip = within(await screen.findByRole('list', { name: 'Summary' }).catch(() => screen.findByLabelText('Summary')));
    expect(strip.getByText('351')).toBeInTheDocument();
    expect(strip.getByText('140 kg')).toBeInTheDocument();
    expect(screen.getByText(/1 of 4 centres have no location yet/)).toBeInTheDocument();
    const drawn = within(screen.getByRole('list', { name: 'Drawn on the map' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(drawn).toEqual(['Alfa Educare|tuesday|251', 'Baphumelela|thursday|100', 'Zama Educare|idle|0']);
  });

  it('lists the centres not served, and flies to one on the map', async () => {
    const user = userEvent.setup();
    render(<ImpactMapPage />);
    const list = within(await screen.findByRole('list', { name: 'Centres not served' }));
    expect(list.getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Hidden Educare'), expect.stringContaining('Zama Educare'),
    ]);
    expect(list.getByRole('button', { name: /Hidden Educare/ })).toBeDisabled();
    await user.click(list.getByRole('button', { name: /Zama Educare/ }));
    expect(screen.getByRole('list', { name: 'Drawn on the map' })).toHaveAttribute('data-focus', '3');
  });

  it('filters to a cohort and to the centres not served', async () => {
    const user = userEvent.setup();
    render(<ImpactMapPage />);
    await user.selectOptions(await screen.findByLabelText('Cohort'), 'thursday');
    expect(within(screen.getByRole('list', { name: 'Drawn on the map' })).getAllByRole('listitem')).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Cohort'), 'all');
    await user.click(screen.getByRole('button', { name: /Not served only/ }));
    expect(within(screen.getByRole('list', { name: 'Drawn on the map' })).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['Zama Educare|idle|0']);
  });

  it('asks the server for a new period', async () => {
    const user = userEvent.setup();
    render(<ImpactMapPage />);
    await user.selectOptions(await screen.findByLabelText('Period'), '30');
    await waitFor(() => expect(getImpactMap).toHaveBeenLastCalledWith({ from: '2026-09-20', to: '2026-10-19' }));
  });

  it('sizes by kilograms when no meals factor is set', async () => {
    getImpactMap.mockResolvedValue({ ...MAP, factor: null });
    render(<ImpactMapPage />);
    expect(await screen.findByText('No meals factor set')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Drawn on the map' })).getAllByRole('listitem')[0]).toHaveTextContent('Alfa Educare|tuesday|100.25');
  });
});

// ── The admin's list ──────────────────────────────────────────
describe('CentreLocationsPage', () => {
  const ROWS = [
    { id: 1, name: 'Alfa Educare', cohort: 'tuesday', isActive: true, childCount: 35, address: null, suburb: null, lat: null, lng: null, source: null, note: null, updatedAt: null, updatedByName: null },
    { id: 2, name: 'Delft Pooh Bear', cohort: 'thursday', isActive: true, childCount: 20, address: null, suburb: 'Delft', lat: -33.99, lng: 18.63, source: 'geocoded', note: 'Pin: the middle of the suburb, not the building.', updatedAt: '2026-10-19T08:00:00Z', updatedByName: null },
    { id: 3, name: 'Victory Educare', cohort: 'tuesday', isActive: true, childCount: 40, address: 'Mew Way', suburb: 'Harare', lat: -34.06, lng: 18.67, source: 'imported', note: 'OpenStreetMap node/1', updatedAt: '2026-10-19T08:00:00Z', updatedByName: null },
  ];

  beforeEach(() => {
    listCentreLocations.mockResolvedValue(ROWS);
    setCentreLocation.mockImplementation(async (id, body) => ({ ...ROWS[0], ...body, source: 'manual' }));
  });

  it('opens on the centres that need a location, with counts for each view', async () => {
    render(<CentreLocationsPage />);
    expect(await screen.findByRole('tab', { name: /Needs a location 1/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Suburb only 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alfa Educare' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Victory Educare' })).toBeNull();
  });

  it('saves an address and a pin placed on the map', async () => {
    const user = userEvent.setup();
    render(<CentreLocationsPage />);
    await user.click(await screen.findByRole('button', { name: 'Alfa Educare' }));
    const panel = within(await screen.findByRole('dialog'));
    await user.type(panel.getByLabelText('Street address'), '12 Ncumo Road');
    await user.type(panel.getByLabelText('Suburb'), 'Harare');
    await user.click(panel.getByRole('button', { name: 'pin null,null' }));
    await user.click(screen.getByRole('button', { name: 'Save location' }));
    await waitFor(() => expect(setCentreLocation).toHaveBeenCalledWith(1, { address: '12 Ncumo Road', suburb: 'Harare', lat: -34.05, lng: 18.67 }));
  });
});

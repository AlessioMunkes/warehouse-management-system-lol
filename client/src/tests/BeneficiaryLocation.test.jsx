// ─────────────────────────────────────────────────────────────
// src/tests/BeneficiaryLocation.test.jsx
//
// Where a centre is, set by a manager on Beneficiaries: the location
// helpers, the form's Location section (Find on map, the Drop a pin
// pop-up), and the page saving the centre without its location and the
// location apart, only when it changed. The map itself is swapped for a
// stand-in: jsdom has no layout for Leaflet.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  hasPin, locationChanged, locationOf, placeLine, withoutLocation,
} from '../features/beneficiaries/beneficiaryLocation';

vi.mock('../services/impactMapAPI', () => ({
  getImpactMap: vi.fn(),
  listCentreLocations: vi.fn(),
  setCentreLocation: vi.fn(),
}));
vi.mock('../services/placeLookupAPI', () => ({ findPlace: vi.fn() }));
vi.mock('../services/beneficiaryAPI', () => ({
  default: {
    getBeneficiaries: vi.fn(),
    getBeneficiary: vi.fn(),
    createBeneficiary: vi.fn(),
    updateBeneficiary: vi.fn(),
    setBeneficiaryStatus: vi.fn(),
    approveBeneficiary: vi.fn(),
    rollbackCohort: vi.fn(),
  },
}));
vi.mock('../features/impactMap/LocationPicker', () => ({
  default: ({ lat, lng, onChange }) => (
    <button type="button" onClick={() => onChange({ lat: -34.05, lng: 18.67 })}>{`map ${lat},${lng}`}</button>
  ),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 2, role: 'manager' } }) }));
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()], useNavigate: () => vi.fn() }));

const { listCentreLocations, setCentreLocation } = await import('../services/impactMapAPI');
const { findPlace } = await import('../services/placeLookupAPI');
const { default: beneficiaryAPI } = await import('../services/beneficiaryAPI');
const { default: BeneficiaryForm } = await import('../features/beneficiaries/BeneficiaryForm');
const { default: BeneficiaryDirectoryPage } = await import('../pages/BeneficiaryDirectoryPage');

const ALFA = {
  id: 1, name: 'Alfa Educare', cohort: 'tuesday', contactName: '', contactEmail: '', mobileNumber: '',
  childCount: 35, isActive: true, approvedAt: '2026-09-24', lastCollectedDate: '2026-10-06',
};
const VICTORY = { ...ALFA, id: 2, name: 'Victory Educare' };

beforeEach(() => {
  vi.clearAllMocks();
  beneficiaryAPI.getBeneficiaries.mockResolvedValue([ALFA, VICTORY]);
  beneficiaryAPI.getBeneficiary.mockImplementation(async (id) => (id === 1 ? ALFA : VICTORY));
  beneficiaryAPI.updateBeneficiary.mockResolvedValue(ALFA);
  listCentreLocations.mockResolvedValue([
    { id: 1, address: null, suburb: null, lat: null, lng: null, source: null },
    { id: 2, address: 'Mew Way', suburb: 'Harare', lat: -34.061817, lng: 18.667888, source: 'imported' },
  ]);
  setCentreLocation.mockResolvedValue({});
});

describe('beneficiaryLocation', () => {
  it('knows a pin, cleans a location and notices a change', () => {
    expect(hasPin({ lat: -34, lng: 18 })).toBe(true);
    expect(hasPin({ lat: null, lng: 18 })).toBe(false);
    expect(locationOf({ address: '  ', suburb: ' Delft ', lat: '-33.9', lng: '18.6' })).toEqual({ address: null, suburb: 'Delft', lat: -33.9, lng: 18.6 });
    expect(locationChanged({ suburb: 'Delft' }, { suburb: 'Delft ', address: '' })).toBe(false);
    expect(locationChanged({ suburb: 'Delft' }, { suburb: 'Delft', lat: -33.9, lng: 18.6 })).toBe(true);
    expect(withoutLocation({ name: 'A', address: 'x', suburb: 'y', lat: 1, lng: 2 })).toEqual({ name: 'A' });
    expect(placeLine({ address: 'Mew Way', suburb: 'Harare' })).toBe('Mew Way, Harare');
  });
});

describe('BeneficiaryForm location', () => {
  it('drops a pin in the pop-up and sends it with the form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BeneficiaryForm initial={ALFA} submitLabel="Save changes" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Suburb'), 'Harare');
    await user.click(screen.getByRole('button', { name: /Drop a pin/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Drop a pin' }));
    expect(dialog.getByRole('button', { name: 'Use this pin' })).toBeDisabled();
    await user.click(dialog.getByRole('button', { name: 'map null,null' }));
    await user.click(dialog.getByRole('button', { name: 'Use this pin' }));
    expect(screen.getByText(/Pin at -34.05, 18.67/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alfa Educare', address: null, suburb: 'Harare', lat: -34.05, lng: 18.67 }));
  });

  it('finds a typed address on the map', async () => {
    const user = userEvent.setup();
    findPlace.mockResolvedValue({ lat: -33.9941234567, lng: 18.6358, label: 'Delft' });
    render(<BeneficiaryForm initial={ALFA} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText('Street address'), '240 Rosendal Avenue');
    await user.type(screen.getByLabelText('Suburb'), 'Delft');
    await user.click(screen.getByRole('button', { name: /Find on map/ }));
    expect(findPlace).toHaveBeenCalledWith('240 Rosendal Avenue, Delft, Cape Town');
    expect(await screen.findByText(/Pin placed near the address/)).toBeInTheDocument();
  });
});

describe('BeneficiaryDirectoryPage', () => {
  it('lists the centres with no location, and shows where one is', async () => {
    const user = userEvent.setup();
    render(<BeneficiaryDirectoryPage />);
    expect(await screen.findByRole('tab', { name: /No location 1/ })).toBeInTheDocument();
    await user.click(await screen.findByText('Victory Educare'));
    const panel = within(await screen.findByRole('dialog'));
    expect(panel.getByText('Mew Way, Harare')).toBeInTheDocument();
    expect(panel.getByText('On the Impact map')).toBeInTheDocument();
  });

  it('saves the centre without its location, then the location apart', async () => {
    const user = userEvent.setup();
    render(<BeneficiaryDirectoryPage />);
    await user.click(await screen.findByText('Alfa Educare'));
    await user.click(await screen.findByRole('button', { name: /Edit details/ }));
    await user.type(await screen.findByLabelText('Suburb'), 'Delft');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(setCentreLocation).toHaveBeenCalledWith(1, { address: null, suburb: 'Delft', lat: null, lng: null }));
    const sent = beneficiaryAPI.updateBeneficiary.mock.calls[0][1];
    expect(sent).not.toHaveProperty('suburb');
    expect(sent).toMatchObject({ name: 'Alfa Educare', cohort: 'tuesday' });
  });

  it('leaves the location alone when it did not change', async () => {
    const user = userEvent.setup();
    render(<BeneficiaryDirectoryPage />);
    await user.click(await screen.findByText('Victory Educare'));
    await user.click(await screen.findByRole('button', { name: /Edit details/ }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(beneficiaryAPI.updateBeneficiary).toHaveBeenCalled());
    expect(setCentreLocation).not.toHaveBeenCalled();
  });
});

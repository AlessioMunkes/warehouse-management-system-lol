// ─────────────────────────────────────────────────────────────
// src/tests/FtsDropOff.test.jsx
//
// Feed the Soil drop-off sites (migration 069): the public form behind
// a site's QR poster, and the managers' Drop-off sites tab.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getPublicDropSite: vi.fn(), submitPublicDropoff: vi.fn(),
  getDropPoints: vi.fn(), createDropPoint: vi.fn(), updateDropPoint: vi.fn(), getDropoffs: vi.fn(), setDropoffStatus: vi.fn(),
}));
vi.mock('../services/ftsDropPointAPI', () => api);
const poster = vi.hoisted(() => ({ openDropPointPoster: vi.fn(() => true), dropOffUrlFor: vi.fn() }));
vi.mock('../features/feedTheSoil/dropPointPoster', () => poster);

const { default: FtsDropOffPage } = await import('../pages/FtsDropOffPage');
const { default: DropPointsTab } = await import('../features/feedTheSoil/DropPointsTab');
const { dropOffUrlFor } = await vi.importActual('../features/feedTheSoil/dropPointPoster');

const TOKEN = '6f1c2b0e-8a4d-4c1e-9b7a-2d3e4f5a6b7c';
const renderForm = () => render(
  <MemoryRouter initialEntries={[`/fts/${TOKEN}`]}>
    <Routes><Route path="/fts/:token" element={<FtsDropOffPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  api.getPublicDropSite.mockResolvedValue({ name: 'Muizenberg pop-up', suburb: 'Muizenberg' });
  api.submitPublicDropoff.mockResolvedValue({ site: 'Muizenberg pop-up', kg: 4.5, thanksEmailed: true });
});

describe('the drop-off form behind the QR code', () => {
  it('logs the weight and thanks the person straight away', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(await screen.findByText('Drop-off at Muizenberg pop-up')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Weight of your compost (kg)'), '4.5');
    await user.type(screen.getByLabelText('Email (optional)'), 'ayesha@example.com');
    await user.click(screen.getByRole('button', { name: /Log my drop-off/ }));

    await waitFor(() => expect(api.submitPublicDropoff).toHaveBeenCalledWith(TOKEN, { kg: 4.5, name: '', email: 'ayesha@example.com' }));
    expect(await screen.findByRole('heading', { name: 'Thank you!' })).toBeInTheDocument();
    expect(screen.getByText(/A thank-you is on its way to your email/)).toBeInTheDocument();
  });

  it('says so when the code is not a working site', async () => {
    api.getPublicDropSite.mockRejectedValue(new Error('This drop-off code is not recognised.'));
    renderForm();
    expect(await screen.findByRole('heading', { name: 'This code is not working' })).toBeInTheDocument();
  });

  it('points the poster’s QR code at the site’s form', () => {
    expect(dropOffUrlFor(TOKEN, 'https://wms-lol.onrender.com/')).toBe(`https://wms-lol.onrender.com/fts/${TOKEN}`);
  });
});

describe('the Drop-off sites tab', () => {
  beforeEach(() => {
    api.getDropPoints.mockResolvedValue([{ id: 3, name: 'Muizenberg pop-up', suburb: 'Muizenberg', publicToken: TOKEN, isActive: true, dropoffCount: 2, kgTotal: 9, lastDropoffAt: null }]);
    api.getDropoffs.mockResolvedValue([{ id: 11, site: 'Muizenberg pop-up', kg: 4.5, donorName: '', askedForThanks: false, thanksStatus: null, status: 'logged', submittedAt: '2026-10-27T10:00:00Z' }]);
    api.setDropoffStatus.mockResolvedValue({});
  });

  it('prints a site’s QR poster and rejects a drop-off that is not real', async () => {
    const user = userEvent.setup();
    render(<DropPointsTab />);
    await user.click(await screen.findByRole('button', { name: 'Print QR poster for Muizenberg pop-up' }));
    expect(poster.openDropPointPoster).toHaveBeenCalledWith(expect.objectContaining({ publicToken: TOKEN }));

    const row = within(screen.getByRole('region', { name: 'Latest drop-offs' }).querySelector('tbody'));
    await user.click(row.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(api.setDropoffStatus).toHaveBeenCalledWith(11, 'rejected'));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const api = vi.hoisted(() => ({ getRequests: vi.fn(), resolveRequest: vi.fn() }));

vi.mock('../services/communityRequestAPI', () => ({
  default: api,
  OUTCOMES: ['pending', 'fulfilled', 'partially_fulfilled', 'declined', 'referred'],
  OUTCOME_LABELS: {
    pending: 'Pending', fulfilled: 'Fulfilled', partially_fulfilled: 'Partially fulfilled',
    declined: 'Declined', referred: 'Referred',
  },
  RESOLVE_OUTCOMES: ['fulfilled', 'partially_fulfilled', 'declined'],
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'manager' } }),
}));
vi.mock('../features/taskdashboard/components/ManagerLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

import CommunityRequestsPage from '../pages/CommunityRequestsPage';

const renderPage = () => render(
  <MemoryRouter initialEntries={['/community-requests']}>
    <Routes>
      <Route path="/community-requests" element={<CommunityRequestsPage />} />
      <Route path="/noc/inventory" element={<div>Inventory page</div>} />
    </Routes>
  </MemoryRouter>,
);

const row = (over = {}) => ({
  id: 1, requestedAt: '2026-10-01T08:00:00.000Z', callerName: 'Thandi', callerContact: '',
  itemsRequested: 'Samp', quantityNote: '', outcome: 'pending', outcomeNote: '',
  handledBy: null, handledByName: null, resolvedAt: null, ...over,
});

describe('CommunityRequestsPage (manager)', () => {
  beforeEach(() => {
  api.getRequests.mockReset();
  api.resolveRequest.mockReset();
  // jsdom has no scrollIntoView; opening the resolve panel calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

  it('does not stick on skeletons when the current filter is picked again', async () => {
    api.getRequests.mockResolvedValue([row()]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Samp');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'All outcomes' }));

    expect(await screen.findByText('Samp')).toBeTruthy();
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it('shows the error and no "No requests match" when a load fails; Try again recovers', async () => {
    api.getRequests.mockRejectedValueOnce(new Error('Boom'));
    api.getRequests.mockResolvedValue([row()]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Boom')).toBeTruthy();
    expect(screen.queryByText('No requests match.')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Samp')).toBeTruthy());
    expect(screen.queryByText('Boom')).toBeNull();
  });

  it('labels the claimer on a pending row and the handler on a resolved row', async () => {
    api.getRequests.mockResolvedValue([
      row({ id: 1, handledBy: 5, handledByName: 'Ayesha K' }),
      row({ id: 2, itemsRequested: 'Oil', outcome: 'fulfilled', handledBy: 6, handledByName: 'Sipho M', resolvedAt: '2026-10-01T10:00:00.000Z' }),
    ]);
    renderPage();
    expect(await screen.findByText('Claimed by Ayesha K')).toBeTruthy();
    expect(screen.getByText('Handled by Sipho M')).toBeTruthy();
  });

  describe('stock-out prompt after resolving', () => {
    const resolveFirstRow = async (user) => {
      await user.click(await screen.findByRole('button', { name: 'Resolve' }));
      await user.type(await screen.findByLabelText('Note'), 'Gave two bags');
      await user.click(screen.getByRole('button', { name: 'Save outcome' }));
    };

    it('offers the reason text and Go to Inventory after a fulfilled resolve; dismiss hides it', async () => {
      api.getRequests.mockResolvedValue([row({ id: 12, callerName: 'Sister Agnes' })]);
      api.resolveRequest.mockResolvedValue({});
      const user = userEvent.setup();
      renderPage();
      await resolveFirstRow(user);

      expect(await screen.findByText(/Did stock leave the warehouse/)).toBeTruthy();
      expect(screen.getByText('Benevolent request #12 — Sister Agnes')).toBeTruthy();
      expect(api.resolveRequest).toHaveBeenCalledWith(12, { outcome: 'fulfilled', outcomeNote: 'Gave two bags' });

      await user.click(screen.getByRole('button', { name: 'Not from inventory' }));
      expect(screen.queryByText(/Did stock leave the warehouse/)).toBeNull();
    });

    it('Go to Inventory navigates to /noc/inventory', async () => {
      api.getRequests.mockResolvedValue([row({ id: 12, callerName: '' })]);
      api.resolveRequest.mockResolvedValue({});
      const user = userEvent.setup();
      renderPage();
      await resolveFirstRow(user);

      expect(await screen.findByText('Benevolent request #12 — unnamed caller')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Go to Inventory' }));
      expect(await screen.findByText('Inventory page')).toBeTruthy();
    });

    it('shows no prompt when the resolve fails', async () => {
      api.getRequests.mockResolvedValue([row()]);
      api.resolveRequest.mockRejectedValue(new Error('nope'));
      const user = userEvent.setup();
      renderPage();
      await resolveFirstRow(user);

      expect(await screen.findByText('nope')).toBeTruthy();
      expect(screen.queryByText(/Did stock leave the warehouse/)).toBeNull();
    });
  });
});

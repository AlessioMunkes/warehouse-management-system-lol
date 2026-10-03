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

import CommunityRequestsPage from '../pages/CommunityRequestsPage';

const renderPage = () => render(
  <MemoryRouter initialEntries={['/community-requests']}>
    <Routes>
      <Route path="/community-requests" element={<CommunityRequestsPage />} />
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

  it('shows the error and no empty-state message when a load fails; Try again recovers', async () => {
    api.getRequests.mockRejectedValueOnce(new Error('Boom'));
    api.getRequests.mockResolvedValue([row()]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Boom')).toBeTruthy();
    expect(screen.queryByText('No requests match')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Samp')).toBeTruthy());
    expect(screen.queryByText('Boom')).toBeNull();
  });

  it('labels the claimer on a pending row and the handler on a resolved row', async () => {
    api.getRequests.mockResolvedValue([
      row({ id: 1, handledBy: 5, handledByName: 'Ayesha K' }),
      row({ id: 2, itemsRequested: 'Oil', outcome: 'fulfilled', handledBy: 6, handledByName: 'Sipho M', resolvedAt: '2026-10-01T10:00:00.000Z' }),
    ]);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Claimed by Ayesha K')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Fulfilled/ }));
    expect(await screen.findByText('Handled by Sipho M')).toBeTruthy();
  });

  it('keeps Claim and Resolve in a sticky column so they stay visible when the table is wide', async () => {
    api.getRequests.mockResolvedValue([row()]);
    renderPage();
    const resolve = await screen.findByRole('button', { name: 'Resolve' });
    expect(resolve.closest('td').className).toContain('sticky');
  });

  it('labels the notes column "Quantity and collection notes"', async () => {
    api.getRequests.mockResolvedValue([row({ quantityNote: 'Collecting Monday' })]);
    renderPage();
    expect(await screen.findByText('Quantity and collection notes')).toBeTruthy();
    expect(screen.getByText('Collecting Monday')).toBeTruthy();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/volunteerAPI', () => ({
  default: { getGuestLog: vi.fn(), signOutVisit: vi.fn() },
}));

const { default: api } = await import('../services/volunteerAPI');
const { default: VolunteerManagementPage } = await import('../pages/VolunteerManagementPage');

const ON_SITE = {
  id: 'v1', fullName: 'Thandi Mokoena', source: 'guest', signedInAt: '2026-10-01T07:00:00Z',
  signedOutAt: null, minutesOnSite: null,
};
const LEFT = {
  id: 'v2', fullName: 'Pieter Botha', source: 'guest', signedInAt: '2026-10-01T06:00:00Z',
  signedOutAt: '2026-10-01T09:30:00Z', minutesOnSite: 210,
};

const renderPage = () => render(<MemoryRouter><VolunteerManagementPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getGuestLog.mockResolvedValue([ON_SITE, LEFT]);
  api.signOutVisit.mockResolvedValue({ ...ON_SITE, signedOutAt: '2026-10-01T10:00:00Z', minutesOnSite: 180 });
});

describe('Volunteer log', () => {
  it('lists visits with tabs counting who is on site', async () => {
    renderPage();
    expect(await screen.findByText('Thandi Mokoena')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Volunteer log' })).toBeInTheDocument();
    expect(screen.getByText(/1 person is on site now/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'On site 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Signed out 1' })).toBeInTheDocument();
  });

  it('narrows to a tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Thandi Mokoena');
    await user.click(screen.getByRole('tab', { name: 'Signed out 1' }));
    expect(screen.queryByText('Thandi Mokoena')).not.toBeInTheDocument();
    expect(screen.getByText('Pieter Botha')).toBeInTheDocument();
  });

  it('opens a visit in the panel and signs it out', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Thandi Mokoena'));
    const panel = await screen.findByRole('dialog');
    await user.click(within(panel).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(api.signOutVisit).toHaveBeenCalledWith('v1'));
    expect(api.getGuestLog).toHaveBeenCalledTimes(2);
  });

  it('has no sign-out for a visit already closed', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Pieter Botha'));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});

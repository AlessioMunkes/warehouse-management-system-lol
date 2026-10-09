import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/volunteerAPI', () => ({
  default: { getGuestLogPage: vi.fn(), signOutVisit: vi.fn() },
}));

const { default: api } = await import('../services/volunteerAPI');
const { default: VolunteerLogView } = await import('../features/activityLog/VolunteerLogView');

const ON_SITE = {
  id: 'v1', fullName: 'Thandi Mokoena', source: 'guest', signedInAt: '2026-10-01T07:00:00Z',
  signedOutAt: null, minutesOnSite: null,
};
const LEFT = {
  id: 'v2', fullName: 'Pieter Botha', source: 'guest', signedInAt: '2026-10-01T06:00:00Z',
  signedOutAt: '2026-10-01T09:30:00Z', minutesOnSite: 210,
};

const renderPage = () => render(<MemoryRouter><VolunteerLogView /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getGuestLogPage.mockResolvedValue({ visits: [ON_SITE, LEFT], hasMore: false });
  api.signOutVisit.mockResolvedValue({ ...ON_SITE, signedOutAt: '2026-10-01T10:00:00Z', minutesOnSite: 180 });
});

describe('Activity log: Volunteers view', () => {
  it('lists visits with tabs counting who is on site', async () => {
    renderPage();
    expect(await screen.findByText('Thandi Mokoena')).toBeInTheDocument();
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
    expect(api.getGuestLogPage).toHaveBeenCalledTimes(2);
  });

  it('has no sign-out for a visit already closed', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Pieter Botha'));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});

describe('Activity log: Volunteers view range, search and batches', () => {
  it('opens on the last 30 days', async () => {
    renderPage();
    await screen.findByText('Thandi Mokoena');
    const call = api.getGuestLogPage.mock.calls[0][0];
    expect(call.to).toBe(new Date().toISOString().slice(0, 10));
    expect((Date.parse(call.to) - Date.parse(call.from)) / 86400000).toBe(29);
  });

  it('can be widened with the date boxes', async () => {
    renderPage();
    await screen.findByText('Thandi Mokoena');
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(api.getGuestLogPage)
      .toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-01-01' })));
  });

  it('asks the server once typing pauses, not on every key', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Thandi Mokoena');
    await user.type(screen.getByPlaceholderText('Search by name'), 'thandi');
    // Six keys, no request for any of them yet.
    expect(api.getGuestLogPage.mock.calls.filter(([a]) => a.search !== '')).toHaveLength(0);
    await waitFor(() => expect(api.getGuestLogPage)
      .toHaveBeenLastCalledWith(expect.objectContaining({ search: 'thandi' })), { timeout: 2000 });
    expect(api.getGuestLogPage.mock.calls.filter(([a]) => a.search !== '')).toHaveLength(1);
  });

  it('says when there is more, and Next loads the next batch', async () => {
    const user = userEvent.setup();
    const MORE = { ...LEFT, id: 'v3', fullName: 'Lerato Dlamini' };
    api.getGuestLogPage
      .mockResolvedValueOnce({ visits: [ON_SITE, LEFT], hasMore: true })
      .mockResolvedValueOnce({ visits: [MORE], hasMore: false });
    renderPage();
    await screen.findByText('Thandi Mokoena');
    expect(screen.getByText(/Showing the latest 2\. Use Next to load more, or narrow the dates\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByText('Lerato Dlamini')).toBeInTheDocument();
    expect(api.getGuestLogPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 2 }));
    expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
  });
});

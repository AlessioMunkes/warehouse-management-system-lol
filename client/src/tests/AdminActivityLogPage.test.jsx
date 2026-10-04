import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { REDIRECTS } from '../routes/routeTable';

vi.mock('../services/adminAPI', () => ({ default: { getArchive: vi.fn(), getActivity: vi.fn() } }));
vi.mock('../services/volunteerAPI', () => ({ default: { getGuestLogPage: vi.fn(), signOutVisit: vi.fn() } }));

const { default: adminAPI } = await import('../services/adminAPI');
const { default: volunteerAPI } = await import('../services/volunteerAPI');
const { default: AdminActivityLogPage } = await import('../pages/AdminActivityLogPage');

const ADA = { id: 1, name: 'Ada Admin', username: 'ada', role: 'admin', count: 1 };
const ENTRY = { id: 'a1', at: '2026-10-01T08:00:00Z', actor: ADA, text: 'approved PO-2026-0007', area: 'Purchasing', source: 'audit', detail: {} };
const VISIT = {
  id: 'v1', fullName: 'Thandi Mokoena', source: 'guest', signedInAt: '2026-10-01T07:00:00Z',
  signedOutAt: null, minutesOnSite: null,
};

// Shows where the router ended up, so a redirect can be read off it.
const Where = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname}{search}</p>;
};

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/admin/activity-log" element={<><AdminActivityLogPage /><Where /></>} />
      {REDIRECTS.map((r) => <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />)}
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  adminAPI.getActivity.mockResolvedValue({
    entries: [ENTRY], people: [ADA], areas: ['Purchasing'], from: '2026-09-03', to: '2026-10-02',
  });
  volunteerAPI.getGuestLogPage.mockResolvedValue({ visits: [VISIT], hasMore: false });
});

describe('Activity log page', () => {
  it('opens on Staff when there is no view in the URL', async () => {
    renderAt('/admin/activity-log');
    expect(screen.getByRole('heading', { name: 'Activity log' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Staff', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('approved PO-2026-0007')).toBeInTheDocument();
    expect(volunteerAPI.getGuestLogPage).not.toHaveBeenCalled();
  });

  it('opens on Volunteers from ?view=volunteers', async () => {
    renderAt('/admin/activity-log?view=volunteers');
    expect(screen.getByRole('tab', { name: 'Volunteers', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Thandi Mokoena')).toBeInTheDocument();
    expect(adminAPI.getActivity).not.toHaveBeenCalled();
  });

  it('treats an unknown view as Staff', async () => {
    renderAt('/admin/activity-log?view=nonsense');
    expect(await screen.findByText('approved PO-2026-0007')).toBeInTheDocument();
  });

  it('switches view with the toggle and puts it in the URL', async () => {
    const user = userEvent.setup();
    renderAt('/admin/activity-log');
    await screen.findByText('approved PO-2026-0007');
    await user.click(screen.getByRole('tab', { name: 'Volunteers' }));
    expect(await screen.findByText('Thandi Mokoena')).toBeInTheDocument();
    expect(screen.queryByText('approved PO-2026-0007')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/activity-log?view=volunteers');
    await user.click(screen.getByRole('tab', { name: 'Staff' }));
    expect(await screen.findByText('approved PO-2026-0007')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/activity-log?view=staff');
  });

  it('starts a view with fresh filters when you come back to it', async () => {
    const user = userEvent.setup();
    renderAt('/admin/activity-log');
    await screen.findByText('approved PO-2026-0007');
    await user.type(screen.getByPlaceholderText('Search people, actions or records'), 'zzz');
    expect(screen.queryByText('approved PO-2026-0007')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Volunteers' }));
    await screen.findByText('Thandi Mokoena');
    await user.click(screen.getByRole('tab', { name: 'Staff' }));
    expect(await screen.findByText('approved PO-2026-0007')).toBeInTheDocument();
  });

  it('redirects /admin/activity to the Staff view', async () => {
    renderAt('/admin/activity');
    expect(await screen.findByText('approved PO-2026-0007')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/activity-log?view=staff');
  });

  it('redirects /admin/volunteer-log to the Volunteers view', async () => {
    renderAt('/admin/volunteer-log');
    expect(await screen.findByText('Thandi Mokoena')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/activity-log?view=volunteers');
  });
});

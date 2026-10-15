import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/adminAPI', () => ({ default: { getArchive: vi.fn(), getActivity: vi.fn() } }));

const { default: adminAPI } = await import('../services/adminAPI');
const { default: StaffActivityView } = await import('../features/activityLog/StaffActivityView');

const ADA = { id: 1, name: 'Ada Admin', username: 'ada', role: 'admin', count: 2 };
const MO = { id: 2, name: 'Mo Manager', username: 'mo', role: 'manager', count: 1 };
const ENTRIES = [
  { id: 'a1', at: '2026-10-01T08:00:00Z', actor: ADA, text: 'approved PO-2026-0007', area: 'Purchasing', source: 'audit', detail: { before: { status: 'pending' }, after: { status: 'approved' } } },
  { id: 'a2', at: '2026-10-01T07:00:00Z', actor: ADA, text: 'added Rice 10kg', area: 'Products', source: 'audit', detail: {} },
  { id: 'a3', at: '2026-09-30T07:00:00Z', actor: MO, text: 'generated slips', area: 'Picking', source: 'event', detail: {} },
];

const renderPage = () => render(<MemoryRouter><StaffActivityView /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  adminAPI.getActivity.mockResolvedValue({
    entries: ENTRIES, people: [ADA, MO], areas: ['Purchasing', 'Products', 'Picking'], from: '2026-09-03', to: '2026-10-02',
  });
});

describe('Activity log: Staff view', () => {
  it('lists activity with no summary line repeating the page heading', async () => {
    renderPage();
    expect(await screen.findByText('approved PO-2026-0007')).toBeInTheDocument();
    expect(screen.queryByText(/3 actions by 2 people/)).not.toBeInTheDocument();
  });

  it('narrows to an area from the Filter menu', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('approved PO-2026-0007');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Picking' }));
    await waitFor(() => expect(screen.queryByText('approved PO-2026-0007')).not.toBeInTheDocument());
    expect(screen.getByText('generated slips')).toBeInTheDocument();
  });

  it('opens an entry in the panel with what changed', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('approved PO-2026-0007'));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('What changed')).toBeInTheDocument();
    expect(within(panel).getByText('approved')).toBeInTheDocument();
  });

  // One person is chosen from the Person picker only: the "Most active"
  // strip beside it did the same thing twice and was removed.
  it('asks the server for one person chosen in the Person picker', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('approved PO-2026-0007');
    expect(screen.queryByText('Most active:')).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Person' }), '2');
    await waitFor(() => expect(adminAPI.getActivity).toHaveBeenLastCalledWith(expect.objectContaining({ user: '2' })));
    expect(screen.getByRole('button', { name: 'Remove filter: Mo Manager' })).toBeInTheDocument();
  });
});

describe('Activity log: Staff view batches', () => {
  it('opens on the last 30 days', async () => {
    renderPage();
    await screen.findByText('approved PO-2026-0007');
    const call = adminAPI.getActivity.mock.calls[0][0];
    expect(call.to).toBe(new Date().toISOString().slice(0, 10));
    expect((Date.parse(call.to) - Date.parse(call.from)) / 86400000).toBe(29);
  });

  it('says when there is more, and Next loads the next batch', async () => {
    const user = userEvent.setup();
    const MORE = { id: 'a4', at: '2026-09-29T07:00:00Z', actor: MO, text: 'raised PO-2026-0001', area: 'Purchasing', source: 'audit', detail: {} };
    adminAPI.getActivity
      .mockResolvedValueOnce({ entries: ENTRIES, hasMore: true, from: '2026-09-03', to: '2026-10-02' })
      .mockResolvedValueOnce({ entries: [MORE], hasMore: false, from: '2026-09-03', to: '2026-10-02' });
    renderPage();
    await screen.findByText('approved PO-2026-0007');
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByText('raised PO-2026-0001')).toBeInTheDocument();
    expect(adminAPI.getActivity).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 3 }));
    expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
  });
});

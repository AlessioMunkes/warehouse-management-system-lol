import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/adminAPI', () => ({ default: { getArchive: vi.fn(), getActivity: vi.fn() } }));
vi.mock('../services/productAPI', async (importOriginal) => ({ ...(await importOriginal()), setProductStatus: vi.fn() }));

const { default: adminAPI } = await import('../services/adminAPI');
const { setProductStatus } = await import('../services/productAPI');
const { default: AdminArchivePage } = await import('../pages/AdminArchivePage');

const RICE = { id: 4, kind: 'product', kindLabel: 'Product', name: 'Rice 10kg', state: 'deactivated', restorable: true, at: '2026-09-01T08:00:00Z', by: 'Ada' };
const OLD = { id: 9, kind: 'supplier', kindLabel: 'Supplier', name: 'Gone Foods', state: 'deleted', restorable: false, at: '2026-08-01T08:00:00Z', by: 'Ada' };

const renderPage = () => render(<MemoryRouter><AdminArchivePage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  adminAPI.getArchive.mockResolvedValue([RICE, OLD]);
  setProductStatus.mockResolvedValue({});
});

describe('Archive', () => {
  it('lists archived items with a tab per state', async () => {
    renderPage();
    expect(await screen.findByText('Rice 10kg')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Deactivated 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Deleted 1' })).toBeInTheDocument();
  });

  it('narrows to deleted items', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Rice 10kg');
    await user.click(screen.getByRole('tab', { name: 'Deleted 1' }));
    expect(screen.getByText('Gone Foods')).toBeInTheDocument();
    expect(screen.queryByText('Rice 10kg')).not.toBeInTheDocument();
  });

  it('restores a deactivated item from its panel', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Rice 10kg'));
    const panel = await screen.findByRole('dialog');
    await user.click(within(panel).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(setProductStatus).toHaveBeenCalledWith(4, true));
    expect(await screen.findByText('Rice 10kg was restored.')).toBeInTheDocument();
  });

  it('offers no restore for a deleted item', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Gone Foods'));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });
});

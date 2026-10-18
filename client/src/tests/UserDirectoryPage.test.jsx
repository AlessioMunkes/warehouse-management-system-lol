import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const toast = vi.fn();
vi.mock('@/components/ui/toastContext', () => ({ useToast: () => toast }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('../services/userAPI', () => ({
  default: {
    getUsers: vi.fn(), getUser: vi.fn(), createUser: vi.fn(),
    updateUser: vi.fn(), setUserStatus: vi.fn(), deleteUser: vi.fn(),
  },
}));
vi.mock('../services/userInviteAPI', () => ({
  default: {
    createInvite: vi.fn(), getPendingInvites: vi.fn(), resendInvite: vi.fn(), revokeInvite: vi.fn(),
  },
}));

const { default: userAPI } = await import('../services/userAPI');
const { default: inviteAPI } = await import('../services/userInviteAPI');
const { default: UserDirectoryPage } = await import('../pages/UserDirectoryPage');

const ME = { id: 1, username: 'admin1', firstName: 'Ada', lastName: 'Admin', role: 'admin', isActive: true };
const WORKER = { id: 2, username: 'worker1', firstName: 'Wes', lastName: 'Worker', role: 'warehouse_worker', isActive: true };
const MANAGER = { id: 3, username: 'manager1', firstName: 'Mo', lastName: 'Manager', role: 'manager', isActive: true };

const renderPage = () => render(<MemoryRouter><UserDirectoryPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  userAPI.getUsers.mockResolvedValue([ME, WORKER, MANAGER]);
  userAPI.getUser.mockImplementation(async (id) => [ME, WORKER, MANAGER].find((u) => u.id === id));
  userAPI.setUserStatus.mockResolvedValue({});
  inviteAPI.getPendingInvites.mockResolvedValue([]);
});

describe('Users', () => {
  it('lists users with a tab per role', async () => {
    renderPage();
    expect(await screen.findByText('Wes Worker')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All 3' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Workers 1' })).toBeInTheDocument();
  });

  it('narrows to a role', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Wes Worker');
    await user.click(screen.getByRole('tab', { name: 'Managers 1' }));
    expect(screen.getByText('Mo Manager')).toBeInTheDocument();
    expect(screen.queryByText('Wes Worker')).not.toBeInTheDocument();
  });

  it('asks the server for inactive accounts from the Filter menu', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Wes Worker');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Show inactive' }));
    await waitFor(() => expect(userAPI.getUsers).toHaveBeenLastCalledWith({ includeInactive: true, search: '' }));
  });

  it('opens a user in the panel, where they can be deactivated', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Wes Worker'));
    const panel = await screen.findByRole('dialog');
    await user.click(within(panel).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(userAPI.setUserStatus).toHaveBeenCalledWith(2, false));
  });

  it('offers no deactivate or delete on your own account', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Ada Admin'));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('opens the invite form in the panel from the header', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Wes Worker');
    await user.click(screen.getByRole('button', { name: 'Invite user' }));
    expect(await screen.findByRole('dialog', { name: 'Invite a user' })).toBeInTheDocument();
  });
});

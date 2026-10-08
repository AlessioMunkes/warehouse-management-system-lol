// ─────────────────────────────────────────────────────────────
// src/tests/QuickCreateRoles.test.jsx
//
// Product Management became admin-only, and the "+" menu in the top
// bar went on offering "Product" to every manager for two more
// scripts — a create shortcut to a screen that bounces them. Closing
// a route and finding what still points at it are two different jobs,
// and only the first one had a test.
//
// So this is the second one, for the one menu a manager sees on every
// screen in this shell. It renders the real ManagerLayout rather than
// asserting on the QUICK_CREATE array, because the bug was never in
// the array — it was in the render site reading the unfiltered one.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagerLayout from '../components/layout/ManagerLayout';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
// Fetches on mount and is not what this is about.
vi.mock('../features/notifications/components/NotificationBell', () => ({
  default: () => null,
}));

const openQuickCreate = async (role) => {
  useAuth.mockReturnValue({
    user: { id: 1, firstName: 'T', lastName: 'U', role },
    logout: vi.fn(),
    isLoading: false,
  });
  render(
    <MemoryRouter>
      <ManagerLayout><p>PAGE</p></ManagerLayout>
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('button', { name: /quick create/i }));
  // Scoped to the popover: the sidebar is full of links too, and an
  // unscoped query passed happily while the menu was still wrong.
  const menu = await screen.findByRole('dialog');
  return within(menu).getAllByRole('link').map((l) => l.textContent.trim());
};

beforeEach(() => vi.clearAllMocks());

describe('the quick-create menu', () => {
  it('offers a manager nothing they cannot create', async () => {
    const items = await openQuickCreate('manager');
    expect(items).toEqual([
      'Picking slip', 'Purchase order', 'Beneficiary', 'Benevolent request', 'Stock adjustment', 'Report',
    ]);
    // With nothing of the admin's to show, their group heading goes too.
    expect(screen.queryByText('Set-up')).toBeNull();
  });

  // The floor shares this shell and has no shortcuts in it, so it gets
  // no button at all rather than one that opens an empty menu.
  it('shows warehouse staff no quick-create button', () => {
    useAuth.mockReturnValue({ user: { id: 1, firstName: 'T', lastName: 'U', role: 'warehouse_worker' }, logout: vi.fn(), isLoading: false });
    render(<MemoryRouter><ManagerLayout><p>PAGE</p></ManagerLayout></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /quick create/i })).toBeNull();
  });

  // The two are separate: an admin does not open a manager's screens.
  it('offers an admin only the set-up shortcuts', async () => {
    const items = await openQuickCreate('admin');
    expect(items).toEqual(['Product', 'Supplier', 'User', 'Recipe']);
    expect(screen.getByText('Set-up')).toBeTruthy();
    expect(screen.queryByText('Warehouse')).toBeNull();
  });
});

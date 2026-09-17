// ─────────────────────────────────────────────────────────────
// src/tests/SidebarCollapse.test.jsx
//
// The rail is easy to get half-right in a way nothing catches: hide the
// labels and you have also hidden the only thing naming each link, so
// the sidebar still "works" for a mouse and goes silent for a screen
// reader. The second test here is the one that matters — the accessible
// name survives the collapse even though the text does not.
//
// The last test guards the shared component. SidebarNav renders in three
// places; two of them are drawers that must keep rendering labels, and
// a `collapsed` prop that leaked into them would be invisible on desktop
// and obvious on a phone.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import { SIDEBAR_KEY } from '../features/taskdashboard/components/shellContext';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
// Fetches on mount and is not what this is about.
vi.mock('../features/notifications/components/NotificationBell', () => ({
  default: () => null,
}));

const renderShell = (role = 'manager') => {
  useAuth.mockReturnValue({
    user: { id: 1, firstName: 'T', lastName: 'U', role },
    logout: vi.fn(),
    isLoading: false,
  });
  return render(
    <MemoryRouter>
      <ManagerLayout><p>PAGE</p></ManagerLayout>
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the collapsing sidebar', () => {
  it('starts expanded, with labels and section headings', () => {
    renderShell();
    expect(screen.getByText('Beneficiaries')).toBeTruthy();
    expect(screen.getByText('Operations')).toBeTruthy();
    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeTruthy();
  });

  it('keeps every link reachable by name once the text is gone', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    // The visible text goes...
    expect(screen.queryByText('Beneficiaries')).toBeNull();
    expect(screen.queryByText('Operations')).toBeNull();
    // ...the link, and its name, do not.
    expect(screen.getByRole('link', { name: 'Beneficiaries' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Purchase Orders' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeTruthy();
  });

  it('expands again', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    await userEvent.click(screen.getByRole('button', { name: /expand sidebar/i }));
    expect(screen.getByText('Beneficiaries')).toBeTruthy();
  });

  it('remembers the choice for the next page load', async () => {
    const first = renderShell();
    await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('true');

    // A second mount is what a reload looks like from here: it must come
    // up collapsed, not flash open and correct itself.
    first.unmount();
    renderShell();
    expect(screen.queryByText('Beneficiaries')).toBeNull();
    expect(screen.getByRole('link', { name: 'Beneficiaries' })).toBeTruthy();
  });

  it('toggles on Ctrl-B', async () => {
    renderShell();
    await userEvent.keyboard('{Control>}b{/Control}');
    expect(screen.queryByText('Beneficiaries')).toBeNull();
    await userEvent.keyboard('{Control>}b{/Control}');
    expect(screen.getByText('Beneficiaries')).toBeTruthy();
  });

  it('leaves the drawer expanded while the rail is collapsed', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Beneficiaries')).toBeTruthy();
    expect(within(drawer).getByText('Operations')).toBeTruthy();
  });
});

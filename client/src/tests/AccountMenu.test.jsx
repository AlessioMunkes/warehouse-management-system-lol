// ─────────────────────────────────────────────────────────────
// client/src/tests/AccountMenu.test.jsx
//
// The menu behind a person's name: Profile, Help, Shortcuts, Change
// language (warehouse staff only) and Log out. And that the shortcuts it
// lists are the ones that work.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../services/api', () => ({ apiPatch: vi.fn(async () => ({ success: true })), apiGet: vi.fn(async () => ({})) }));

const { default: AccountMenu } = await import('../components/layout/AccountMenu');
const { helpFor } = await import('../components/layout/helpContent');
const { shortcutGroups, goToFor } = await import('../components/layout/shortcuts');
const { ROUTES } = await import('../routes/routeTable');
const { PHRASES } = await import('../i18n/phrases');

const WORKER = { id: 3, firstName: 'Mcebisi', lastName: 'Ndlovu', username: 'worker001', role: 'warehouse_worker', email: 'mcebisi@example.org' };
const MANAGER = { id: 2, firstName: 'Grizel', lastName: 'Goliath', username: 'manager001', role: 'manager', email: null };

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const mount = (user, onLogout = vi.fn()) => render(
  <MemoryRouter initialEntries={['/start']}>
    <Routes><Route path="*" element={<><AccountMenu user={user} onLogout={onLogout} /><Where /><input aria-label="A field" /></>} /></Routes>
  </MemoryRouter>,
);
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Account menu for/ }));

beforeEach(() => { vi.clearAllMocks(); });

describe('AccountMenu', () => {
  it('opens from the name, with the items in order', () => {
    mount(WORKER);
    expect(screen.queryByText('Profile')).toBeNull();
    openMenu();
    expect(screen.getByText('Mcebisi Ndlovu (worker001)')).toBeTruthy();
    const items = ['Profile', 'Help', 'Shortcuts', 'Change language…', 'Log out'].map((name) => screen.getByRole('button', { name }));
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i - 1].compareDocumentPosition(items[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('offers a language change to warehouse staff only', () => {
    mount(MANAGER);
    openMenu();
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change language…' })).toBeNull();
  });

  it('shows the profile read only: name, username, email and role, and who can change them', () => {
    mount(WORKER);
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Mcebisi Ndlovu')).toBeTruthy();
    expect(within(dialog).getByText('worker001')).toBeTruthy();
    expect(within(dialog).getByText('mcebisi@example.org')).toBeTruthy();
    expect(within(dialog).getByText('Warehouse staff')).toBeTruthy();
    expect(within(dialog).getByText(/can only be changed by an admin/)).toBeTruthy();
    expect(dialog.querySelector('input, textarea, select')).toBeNull();
  });

  it('says so when no email is on record', () => {
    mount(MANAGER);
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
    expect(screen.getByText('No email on record')).toBeTruthy();
  });

  it('changes the language from the menu', () => {
    mount(WORKER);
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Change language…' }));
    const select = within(screen.getByRole('dialog')).getByLabelText('Choose your language');
    expect([...select.options].map((o) => o.textContent)).toEqual(['English', 'Afrikaans', 'isiXhosa']);
  });

  it('asks before logging out', () => {
    const onLogout = vi.fn();
    mount(WORKER, onLogout);
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('Help', () => {
  it('shows each role its own topics, with steps', () => {
    for (const role of ['warehouse_worker', 'manager', 'admin']) {
      const topics = helpFor(role);
      expect(topics.length).toBeGreaterThanOrEqual(8);
      for (const topic of topics) {
        expect(topic.title.length).toBeGreaterThan(3);
        expect(topic.steps.length).toBeGreaterThan(0);
      }
    }
    expect(helpFor('warehouse_worker').map((t) => t.title)).toContain('Pack a pallet');
    expect(helpFor('manager').map((t) => t.title)).toContain('Purchase orders');
    expect(helpFor('admin').map((t) => t.title)).toContain('Users');
    // Nobody is told how to use a screen they cannot open.
    expect(helpFor('warehouse_worker').map((t) => t.title)).not.toContain('Users');
    expect(helpFor('manager').map((t) => t.title)).not.toContain('Users');
  });

  it('opens a topic to its steps', () => {
    mount(WORKER);
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Receive a delivery')).toBeTruthy();
    expect(within(dialog).getByText(/Only orders a manager has approved are listed/)).toBeTruthy();
  });

  it('has every warehouse-staff line in Afrikaans and isiXhosa', () => {
    const known = new Set(PHRASES.map((row) => row[0]));
    const lines = helpFor('warehouse_worker').flatMap((t) => [t.title, ...t.steps]).filter((s) => s !== 'Feed the Soil');
    expect(lines.filter((line) => !known.has(line))).toEqual([]);
  });
});

describe('Shortcuts', () => {
  it('lists a go-to shortcut only for screens that role may open, one letter each', () => {
    for (const [role, allowed] of [['warehouse_worker', 'warehouse_worker'], ['manager', 'manager'], ['admin', 'admin']]) {
      const letters = new Set();
      for (const [letter, path] of goToFor(role)) {
        expect(letters.has(letter), `${role} ${letter}`).toBe(false);
        letters.add(letter);
        const route = ROUTES.find((r) => r.path === path);
        expect(route, `${role} ${path}`).toBeTruthy();
        expect(route.roles, `${role} ${path}`).toContain(allowed);
      }
    }
  });

  it('shows the list in its window', () => {
    mount(MANAGER);
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Shortcuts' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Open or close the side menu')).toBeTruthy();
    expect(within(dialog).getByText('Purchase orders')).toBeTruthy();
    expect(shortcutGroups('manager')).toHaveLength(3);
  });

  it('? opens the list, and G then a letter goes to that screen', () => {
    mount(MANAGER);
    fireEvent.keyDown(window, { key: '?' });
    expect(within(screen.getByRole('dialog')).getByText('Open this list of shortcuts')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'o' });
    expect(screen.getByTestId('where').textContent).toBe('/noc/purchase-orders');

    // A letter on its own does nothing.
    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByTestId('where').textContent).toBe('/noc/purchase-orders');
  });

  it('does nothing while someone is typing, or with Ctrl held', () => {
    mount(MANAGER);
    const field = screen.getByLabelText('A field');
    fireEvent.keyDown(field, { key: 'g' });
    fireEvent.keyDown(field, { key: 'o' });
    expect(screen.getByTestId('where').textContent).toBe('/start');
    fireEvent.keyDown(field, { key: '?' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.keyDown(window, { key: 'g', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'o' });
    expect(screen.getByTestId('where').textContent).toBe('/start');
  });
});

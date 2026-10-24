// ─────────────────────────────────────────────────────────────
// src/tests/FirstUse.test.jsx
//
// What someone sees the first time they sign in (features/onboarding,
// and the tip on the Help button in AssistantLauncher.jsx):
//   - a welcome card once per person on this device, about their own
//     role's screens, ending with where Help is
//   - a second person on the same tablet gets their own
//   - volunteers get none: their home screen already greets them
//   - the Help tip waits for the card, and goes when Help is tapped
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
// The panel itself fetches the help catalogue; only the button is under test.
vi.mock('../features/assistant/AssistantPanel', () => ({ default: () => <div>Help panel</div> }));

const { useAuth } = await import('../context/AuthContext');
const { default: ProtectedRoute } = await import('../components/layout/ProtectedRoute');

const signIn = (user) => {
  useAuth.mockReturnValue({ user, isLoading: false });
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<div>Home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
};

const WORKER = { id: 11, role: 'warehouse_worker', firstName: 'Thandi' };
const tip = () => screen.queryByText('Need a hand? Tap here for the steps on this screen.');

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe('the welcome card', () => {
  it('greets a worker by name, with their four points, the last about Help', () => {
    signIn(WORKER);
    const card = screen.getByRole('dialog', { name: 'Welcome, Thandi' });
    const points = within(card).getAllByRole('listitem').map((li) => li.textContent);
    expect(points).toHaveLength(4);
    expect(points[0]).toMatch(/tiles on the home page/);
    expect(points[1]).toMatch(/Guided.*Form/);
    expect(points[2]).toMatch(/Lost signal/);
    expect(points[3]).toMatch(/round Help button/);
  });

  it('is shown once: closed, it does not come back for that person', async () => {
    const user = userEvent.setup();
    const { unmount } = signIn(WORKER);
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    signIn(WORKER);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('greets the next person on the same tablet too', async () => {
    const user = userEvent.setup();
    const { unmount } = signIn(WORKER);
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    unmount();

    signIn({ id: 12, role: 'warehouse_worker', firstName: 'Sipho' });
    expect(screen.getByRole('dialog', { name: 'Welcome, Sipho' })).toBeInTheDocument();
  });

  it('tells a manager and an admin about their own screens', () => {
    const { unmount } = signIn({ id: 2, role: 'manager', firstName: 'Lerato' });
    expect(within(screen.getByRole('dialog')).getByText('Operations reports')).toBeInTheDocument();
    unmount();

    signIn({ id: 3, role: 'admin', firstName: 'Ana' });
    const card = screen.getByRole('dialog', { name: 'Welcome, Ana' });
    expect(within(card).getByText('Master data')).toBeInTheDocument();
    expect(within(card).queryByText('Operations reports')).toBeNull();
  });

  it('is not shown to a volunteer', () => {
    signIn({ id: 50, role: 'guest', firstName: 'Volunteer' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the tip on the Help button', () => {
  it('waits for the welcome card, then shows, and goes when Help is tapped', async () => {
    const user = userEvent.setup();
    signIn(WORKER);
    expect(tip()).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(tip()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(tip()).toBeNull();
    expect(screen.getByText('Help panel')).toBeInTheDocument();
  });

  it('is shown once per device, and can be closed on its own', async () => {
    const user = userEvent.setup();
    const { unmount } = signIn({ id: 50, role: 'guest', firstName: 'Volunteer' });
    await user.click(screen.getByRole('button', { name: 'Close this tip' }));
    expect(tip()).toBeNull();
    unmount();

    signIn({ id: 51, role: 'guest', firstName: 'Another' });
    expect(tip()).toBeNull();
  });
});

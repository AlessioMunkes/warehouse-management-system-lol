// ─────────────────────────────────────────────────────────────
// GuestContainment.test.jsx
//
// A signed-in guest must not reach the warehouse floor.
//
// The bug this locks down: the staff route groups in App.jsx carried no
// `roles` prop, and ProtectedRoute skips its role check entirely when
// `roles` is undefined — so "protected" meant "any logged-in user",
// guests included. A guest who typed /noc/packing got the packer flow
// rendered at them. The API refused every request behind it, so no data
// leaked, but the screens still drew and the spec says guests never see
// the worker surface.
//
// These tests use the real STAFF_ROLES constant rather than a literal
// list, so removing a role from the app's guard fails here too.
// ─────────────────────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import { PACKING, STAFF, STAFF_ROLES } from '../routes/paths';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

// Mirrors the staff group in App.jsx: the task dashboard plus the four
// floor flows, all behind STAFF_ROLES.
const renderRoute = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<div>Login</div>} />
      <Route path="/guest-home" element={<div>Guest home</div>} />
      <Route element={<ProtectedRoute roles={STAFF_ROLES} />}>
        <Route path="/noc" element={<div>Task dashboard</div>} />
        <Route path={PACKING.board} element={<div>Packing</div>} />
        <Route path={PACKING.detailPattern} element={<div>Packing detail</div>} />
        <Route path={STAFF.receiving} element={<div>Receiving</div>} />
        <Route path="/noc/decanting" element={<div>Decanting</div>} />
        <Route path={STAFF.dispatch} element={<div>Dispatch</div>} />
      </Route>
    </Routes>
  </MemoryRouter>
);

// Every floor route a guest could plausibly type or follow a stale link to.
const STAFF_PATHS = [
  ['the task dashboard', '/noc'],
  ['the packing board', PACKING.board],
  ['a single picking slip', '/noc/packing/42'],
  ['receiving', STAFF.receiving],
  ['decanting', '/noc/decanting'],
  ['dispatch', STAFF.dispatch],
];

beforeEach(() => vi.clearAllMocks());

describe('Guest containment — warehouse floor routes', () => {
  it.each(STAFF_PATHS)('redirects a guest away from %s', (_label, path) => {
    useAuth.mockReturnValue({ user: { id: 1, firstName: 'Thabo', role: 'guest' }, isLoading: false });
    renderRoute(path);

    // Sent to their own home, not the worker's.
    expect(screen.getByText('Guest home')).toBeInTheDocument();
  });

  // The redirect is only half the claim. Assert the worker screen never
  // rendered at all — a guest seeing it for a frame is still a guest
  // seeing it.
  it('never renders the packing screen for a guest', () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'guest' }, isLoading: false });
    renderRoute(PACKING.board);

    expect(screen.queryByText('Packing')).not.toBeInTheDocument();
    expect(screen.getByText('Guest home')).toBeInTheDocument();
  });

  // Guard against over-correcting: the fix must not lock out the people
  // whose screens these are.
  it.each(STAFF_ROLES)('still admits %s to the packing board', (role) => {
    useAuth.mockReturnValue({ user: { id: 1, role }, isLoading: false });
    renderRoute(PACKING.board);
    expect(screen.getByText('Packing')).toBeInTheDocument();
  });

  it('sends a logged-out visitor to login, not to guest home', () => {
    useAuth.mockReturnValue({ user: null, isLoading: false });
    renderRoute(PACKING.board);
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  // While /api/me is still in flight the route must stay closed — but it
  // must not decide anything either, or a valid session gets bounced on
  // every refresh.
  it('holds the route closed while the session is still loading', () => {
    useAuth.mockReturnValue({ user: null, isLoading: true });
    renderRoute(PACKING.board);
    expect(screen.queryByText('Packing')).not.toBeInTheDocument();
    expect(screen.queryByText('Login')).not.toBeInTheDocument();
  });
});

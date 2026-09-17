import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import { VOLUNTEERS, VOLUNTEER_MANAGEMENT_ROLES } from '../routes/paths';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const renderRoute = (path = VOLUNTEERS.events) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<div>Login</div>} />
      <Route path="/noc" element={<div>Warehouse home</div>} />
      <Route path="/guest-home" element={<div>Guest home</div>} />
      <Route element={<ProtectedRoute roles={VOLUNTEER_MANAGEMENT_ROLES} />}>
        <Route path={VOLUNTEERS.events} element={<div>Volunteer events</div>} />
        <Route path={VOLUNTEERS.eventPattern} element={<div>Event workspace</div>} />
      </Route>
    </Routes>
  </MemoryRouter>
);

beforeEach(() => vi.clearAllMocks());

describe('Volunteer Management routing', () => {
  it.each(['manager', 'admin'])('allows %s management access', (role) => {
    useAuth.mockReturnValue({ user: { id: 1, role }, isLoading: false });
    renderRoute('/volunteers/events/event-1');
    expect(screen.getByText('Event workspace')).toBeInTheDocument();
  });

  // Only warehouse_worker. The other name here was 'finance', a role
  // this system no longer has — it was standing in for "somebody who
  // gets bounced" and passing for the wrong reason.
  it('returns a warehouse worker to the warehouse home', () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'warehouse_worker' }, isLoading: false });
    renderRoute();
    expect(screen.getByText('Warehouse home')).toBeInTheDocument();
  });

  it('returns a guest to the guest home', () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'guest' }, isLoading: false });
    renderRoute();
    expect(screen.getByText('Guest home')).toBeInTheDocument();
  });
});

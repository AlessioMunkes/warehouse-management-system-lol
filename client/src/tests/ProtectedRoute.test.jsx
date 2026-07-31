// ─────────────────────────────────────────────────────────────
// src/tests/ProtectedRoute.test.jsx
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const renderProtectedRoute = () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute', () => {
  it('redirects an unauthenticated user to /login', () => {
    useAuth.mockReturnValue({ user: null, isLoading: false });

    renderProtectedRoute();

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
  });

  it('renders the child route for an authenticated user', () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'manager' }, isLoading: false });

    renderProtectedRoute();

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });
});

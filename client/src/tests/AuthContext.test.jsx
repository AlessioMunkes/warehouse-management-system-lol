// ─────────────────────────────────────────────────────────────
// src/tests/AuthContext.test.jsx
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { apiPost } from '../services/api';

vi.mock('../services/api', () => ({
  apiPost: vi.fn(),
}));

const TestConsumer = () => {
  const { user, logout } = useAuth();
  return (
    <div>
      <div data-testid="user">{user ? user.name : 'no-user'}</div>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

const renderAuth = () =>
  render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );

beforeEach(() => {
  localStorage.clear();
  apiPost.mockReset();
});

describe('AuthContext', () => {
  it('clears an invalid/expired stored session on startup', () => {
    // The auth credential itself lives in an httpOnly cookie the server
    // expires — this simulates a stale/corrupted 'wms_user' entry left
    // behind from an old session, which readSavedUser() should discard.
    localStorage.setItem('wms_user', 'not-valid-json');

    renderAuth();

    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(localStorage.getItem('wms_user')).toBeNull();
  });

  it('restores the user from a valid stored session on startup', () => {
    localStorage.setItem('wms_user', JSON.stringify({ id: 1, name: 'Jane', role: 'manager' }));

    renderAuth();

    expect(screen.getByTestId('user')).toHaveTextContent('Jane');
  });

  it('clears user state and storage on logout', async () => {
    localStorage.setItem('wms_user', JSON.stringify({ id: 1, name: 'Jane', role: 'manager' }));
    apiPost.mockResolvedValue({ success: true });

    renderAuth();
    expect(screen.getByTestId('user')).toHaveTextContent('Jane');

    fireEvent.click(screen.getByText('Logout'));

    await screen.findByText('no-user');
    expect(localStorage.getItem('wms_user')).toBeNull();
    // Mounted at /api/login in index.js, so logout is a sub-path of it.
    expect(apiPost).toHaveBeenCalledWith('/api/login/logout', {});
  });
});
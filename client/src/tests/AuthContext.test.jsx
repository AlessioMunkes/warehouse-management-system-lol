// ─────────────────────────────────────────────────────────────
// src/tests/AuthContext.test.jsx
//
// The session used to be whatever localStorage said, which never
// expires — so the UI showed "logged in" long after the 8h cookie
// had died and every request 401'd. These tests pin the new rule:
// localStorage is a cache, GET /api/me is the truth, and a network
// failure is not the same as a rejected session.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/api', () => ({
  apiGet:  vi.fn(),
  apiPost: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

const { apiGet, apiPost, setUnauthorizedHandler } = await import('../services/api');
const { AuthProvider, useAuth } = await import('../context/AuthContext');

const CACHED  = { id: 1, firstName: 'Jane', lastName: 'Doe', role: 'manager' };
const SERVER  = { id: 1, firstName: 'Jane', lastName: 'Doe', role: 'admin' };

const TestConsumer = () => {
  const { user, isLoading, isOffline, sessionMessage, logout } = useAuth();
  return (
    <div>
      <div data-testid="user">{user ? `${user.firstName}:${user.role}` : 'no-user'}</div>
      <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="offline">{isOffline ? 'offline' : 'online'}</div>
      <div data-testid="message">{sessionMessage ?? ''}</div>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

const renderAuth = () =>
  render(<AuthProvider><TestConsumer /></AuthProvider>);

const cacheUser = (u = CACHED) => localStorage.setItem('wms_user', JSON.stringify(u));

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const netError = () =>
  Object.assign(new Error('Could not reach the server.'), { isNetworkError: true });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  apiGet.mockResolvedValue({ success: true, user: SERVER });
});

describe('AuthContext — session verification on boot', () => {
  it('asks the server who the user is instead of trusting the cache', async () => {
    cacheUser();
    renderAuth();

    await screen.findByText('ready');
    expect(apiGet).toHaveBeenCalledWith('/api/me');
    // The server said 'admin'; the cache said 'manager'. Server wins.
    expect(screen.getByTestId('user')).toHaveTextContent('Jane:admin');
  });

  it('holds isLoading true until the server has answered', async () => {
    let resolve;
    apiGet.mockReturnValue(new Promise((r) => { resolve = r; }));
    cacheUser();
    renderAuth();

    // Routes must stay closed here — deciding early would either
    // bounce a valid session or admit an expired one.
    expect(screen.getByTestId('loading')).toHaveTextContent('loading');

    resolve({ success: true, user: SERVER });
    await screen.findByText('ready');
  });

  it('clears a cached session the server rejects with 401', async () => {
    // This is the bug: cache present, cookie long dead.
    cacheUser();
    apiGet.mockRejectedValue(httpError(401, 'Session expired. Please log in again.'));
    renderAuth();

    await screen.findByText('ready');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(localStorage.getItem('wms_user')).toBeNull();
    expect(screen.getByTestId('message')).toHaveTextContent('Session expired');
  });

  it('clears the session when the account has been deactivated', async () => {
    cacheUser();
    apiGet.mockRejectedValue(httpError(401, 'This account has been deactivated.'));
    renderAuth();

    await screen.findByText('ready');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
  });

  it('discards a corrupted cache entry', async () => {
    localStorage.setItem('wms_user', 'not-valid-json');
    apiGet.mockRejectedValue(httpError(401, 'Session expired.'));
    renderAuth();

    await screen.findByText('ready');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(localStorage.getItem('wms_user')).toBeNull();
  });
});

describe('AuthContext — degraded connectivity', () => {
  it('keeps the cached session when the server is unreachable', async () => {
    // A dropped connection is not a rejected session. Logging a
    // warehouse worker out mid-shift over a signal blip — onto a login
    // screen they cannot submit — would be its own bug.
    cacheUser();
    apiGet.mockRejectedValue(netError());
    renderAuth();

    await screen.findByText('ready');
    expect(screen.getByTestId('user')).toHaveTextContent('Jane:manager');
    expect(screen.getByTestId('offline')).toHaveTextContent('offline');
    expect(localStorage.getItem('wms_user')).not.toBeNull();
  });

  it('keeps the cached session when the server returns a 500', async () => {
    cacheUser();
    apiGet.mockRejectedValue(httpError(500, 'Could not verify your session.'));
    renderAuth();

    await screen.findByText('ready');
    expect(screen.getByTestId('user')).toHaveTextContent('Jane:manager');
  });
});

describe('AuthContext — 401 from anywhere else', () => {
  it('registers a handler that tears the session down mid-session', async () => {
    cacheUser();
    renderAuth();
    await screen.findByText('ready');
    expect(screen.getByTestId('user')).toHaveTextContent('Jane:admin');

    // Simulate any other request 401ing — e.g. the session expiring
    // while the packer is halfway through a pallet.
    const handler = setUnauthorizedHandler.mock.calls.at(-1)[0];
    fireEvent.click(document.body); // flush
    handler('Session expired. Please log in again.');

    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('no-user'));
    expect(localStorage.getItem('wms_user')).toBeNull();
  });
});

describe('AuthContext — logout', () => {
  it('clears state and storage, and calls the right endpoint', async () => {
    cacheUser();
    apiPost.mockResolvedValue({ success: true });
    renderAuth();
    await screen.findByText('ready');

    fireEvent.click(screen.getByText('Logout'));

    await screen.findByText('no-user');
    expect(localStorage.getItem('wms_user')).toBeNull();
    // Mounted at /api/login in index.js, so logout is a sub-path of it.
    expect(apiPost).toHaveBeenCalledWith('/api/login/logout', {});
  });

  it('still clears local state when the logout request fails', async () => {
    // On a shared warehouse tablet, "log me out" must not depend on
    // the network being up.
    cacheUser();
    apiPost.mockRejectedValue(netError());
    renderAuth();
    await screen.findByText('ready');

    fireEvent.click(screen.getByText('Logout'));

    await screen.findByText('no-user');
    expect(localStorage.getItem('wms_user')).toBeNull();
  });
});
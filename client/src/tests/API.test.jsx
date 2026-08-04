// ─────────────────────────────────────────────────────────────
// src/tests/api.test.js
//
// The API layer has to make two distinctions the session logic
// depends on:
//   1. Which status the server returned (401 means log out).
//   2. Whether the request reached the server at all (offline
//      must NOT log anyone out).
// Before this, every failure was a bare Error with neither.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost, setUnauthorizedHandler } from '../services/api';

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  setUnauthorizedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('api error shape', () => {
  it('attaches the HTTP status to the thrown error', async () => {
    fetch.mockResolvedValue(jsonResponse(403, { message: 'Access denied.' }));

    await expect(apiGet('/api/stock')).rejects.toMatchObject({
      status: 403,
      message: 'Access denied.',
    });
  });

  it('flags a failed fetch as a network error, with no status', async () => {
    // fetch() only rejects when the request never completed. Callers
    // rely on the absence of .status to tell this apart from a refusal.
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const err = await apiGet('/api/stock').catch((e) => e);
    expect(err.isNetworkError).toBe(true);
    expect(err.status).toBeUndefined();
  });

  it('survives a non-JSON error body instead of throwing a parse error', async () => {
    // A proxy timeout or the SPA fallback returns HTML; res.json()
    // would throw and mask the real status.
    fetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });

    await expect(apiPost('/api/stock/adjust', {})).rejects.toMatchObject({ status: 502 });
  });

  it('returns the parsed body on success', async () => {
    fetch.mockResolvedValue(jsonResponse(200, { success: true, data: [1, 2] }));
    await expect(apiGet('/api/stock')).resolves.toEqual({ success: true, data: [1, 2] });
  });
});

describe('unauthorized handler', () => {
  it('fires on a 401 from any endpoint', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetch.mockResolvedValue(jsonResponse(401, { message: 'Session expired.' }));

    await apiGet('/api/picking').catch(() => {});

    expect(handler).toHaveBeenCalledWith('Session expired.');
  });

  it('does not fire on a 403 — that is a role problem, not a session one', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetch.mockResolvedValue(jsonResponse(403, { message: 'Access denied.' }));

    await apiGet('/api/stock/adjust').catch(() => {});

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire on a network failure', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await apiGet('/api/stock').catch(() => {});

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('credentials', () => {
  it('sends the auth cookie on every request', async () => {
    fetch.mockResolvedValue(jsonResponse(200, {}));
    await apiGet('/api/me');
    await apiPost('/api/login', { username: 'x' });

    for (const call of fetch.mock.calls) {
      expect(call[1].credentials).toBe('include');
    }
  });
});
// ─────────────────────────────────────────────────────────────
// src/tests/ApiWakeRetry.test.jsx  (script 48)
//
// A proxy 502/503 (Render waking, Express restarting under Vite)
// is retried for reads and login only. A JSON 503 from Express
// itself, and any other write, fail straight away.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost, setUnauthorizedHandler } from '../services/api';

const proxyDown = (status = 502) => ({
  ok: false,
  status,
  headers: new Headers({ 'content-type': 'text/html' }),
  json: async () => { throw new Error('not json'); },
});

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn());
  setUnauthorizedHandler(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('wake retry', () => {
  it('retries login through a proxy 502 and succeeds', async () => {
    fetch
      .mockResolvedValueOnce(proxyDown(502))
      .mockResolvedValueOnce(jsonRes(200, { success: true }));

    const p = apiPost('/api/login', { username: 'u', password: 'p' });
    await vi.runAllTimersAsync();

    await expect(p).resolves.toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last delay with a readable message', async () => {
    fetch.mockResolvedValue(proxyDown(503));

    const p = apiGet('/api/stock').catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await p;

    expect(err.status).toBe(503);
    expect(err.message).toMatch(/starting up/i);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry a JSON 503 from Express', async () => {
    fetch.mockResolvedValue(jsonRes(503, { message: 'AI provider unavailable.' }));

    await expect(apiGet('/api/reporting/x')).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry other writes', async () => {
    fetch.mockResolvedValue(proxyDown(502));

    await expect(apiPost('/api/stock/adjust', {})).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

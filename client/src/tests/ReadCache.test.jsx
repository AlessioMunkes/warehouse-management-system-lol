// ─────────────────────────────────────────────────────────────
// src/tests/ReadCache.test.jsx  (script 49)
//
// jsdom has no IndexedDB, so — as in Offline.test.jsx — this checks
// the parts that must hold without storage: which requests are
// touched, that reachability is reported for every /api call, and
// that a failure with nothing saved still fails honestly. The stored
// copy itself is verified in a real browser.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const connection = await import('../services/connection');
const { classify, installReadCache, setReadCacheScope } = await import('../services/readCache');

const ORIGIN = 'http://wms.test';

const makeTarget = (impl) => ({
  fetch: vi.fn(impl),
  location: { origin: ORIGIN },
});

beforeEach(() => {
  connection.reportReach();
  setReadCacheScope('manager:1');
});

describe('classify', () => {
  it('caches same-origin API reads', () => {
    expect(classify('/api/stock?page=2', undefined, ORIGIN))
      .toEqual({ api: true, cacheable: true, path: '/api/stock?page=2' });
  });

  it('never caches writes', () => {
    expect(classify('/api/stock', { method: 'POST' }, ORIGIN).cacheable).toBe(false);
  });

  it('never caches session, health, Gmail, the assistant or public token pages', () => {
    for (const path of [
      '/api/me', '/api/login/logout', '/api/health', '/api/gmail/status',
      '/api/assistant/ask', '/api/slip/code/ABC123', '/api/volunteers/sign-in',
      '/api/donations/section-18a/form/tok',
    ]) {
      expect(classify(path, undefined, ORIGIN).cacheable).toBe(false);
    }
  });

  it('ignores other sites and paths that only look like the API', () => {
    expect(classify('https://api.mapbox.com/api/x', undefined, ORIGIN).api).toBe(false);
    expect(classify('/apiary', undefined, ORIGIN).api).toBe(false);
  });
});

describe('the fetch wrapper', () => {
  it('reports the server as reached on any answer, even a refusal', async () => {
    const target = makeTarget(async () => new Response('{}', { status: 400 }));
    installReadCache(target);
    connection.reportUnreachable();

    await target.fetch('/api/stock');
    expect(connection.isReachable()).toBe(true);
  });

  it('reports no signal, and still fails, when nothing was saved', async () => {
    const boom = new TypeError('Failed to fetch');
    const target = makeTarget(async () => { throw boom; });
    installReadCache(target);

    await expect(target.fetch('/api/stock')).rejects.toBe(boom);
    expect(connection.isReachable()).toBe(false);
  });

  it('does not treat a cancelled request as lost signal', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const target = makeTarget(async () => { throw abort; });
    installReadCache(target);

    await expect(target.fetch('/api/stock')).rejects.toBe(abort);
    expect(connection.isReachable()).toBe(true);
  });

  it('leaves other sites alone', async () => {
    const target = makeTarget(async () => { throw new TypeError('offline'); });
    installReadCache(target);

    await expect(target.fetch('https://api.mapbox.com/x')).rejects.toThrow('offline');
    expect(connection.isReachable()).toBe(true);
  });

  it('installs once', () => {
    const target = makeTarget(async () => new Response('{}'));
    installReadCache(target);
    const first = target.fetch;
    installReadCache(target);
    expect(target.fetch).toBe(first);
  });
});

// ─────────────────────────────────────────────────────────────
// src/tests/RefreshCache.test.js
//
// "Refresh cache" clears every copy this device keeps and reloads. It
// refuses with no connection, because clearing the app's own files
// offline would leave nothing to open.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/readCache', () => ({ clearReadCache: vi.fn(async () => {}) }));
vi.mock('../services/api', () => ({ clearApiCache: vi.fn() }));

const { clearReadCache } = await import('../services/readCache');
const { clearApiCache } = await import('../services/api');
const { refreshCache } = await import('../lib/refreshCache');

const online = (value) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });

beforeEach(() => { vi.clearAllMocks(); online(true); });
afterEach(() => { vi.unstubAllGlobals(); online(true); });

describe('refreshCache', () => {
  it('clears the saved reads, the short memo and the app files, then reloads', async () => {
    const deleted = [];
    vi.stubGlobal('caches', {
      keys: async () => ['workbox-precache', 'icons'],
      delete: async (name) => { deleted.push(name); return true; },
    });
    const reload = vi.fn();

    await refreshCache({ reload });

    expect(clearApiCache).toHaveBeenCalledOnce();
    expect(clearReadCache).toHaveBeenCalledOnce();
    expect(deleted).toEqual(['workbox-precache', 'icons']);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('still reloads on a browser with no cache storage', async () => {
    vi.stubGlobal('caches', undefined);
    const reload = vi.fn();
    await refreshCache({ reload });
    expect(reload).toHaveBeenCalledOnce();
  });

  it('refuses with no connection, and clears nothing', async () => {
    online(false);
    const reload = vi.fn();
    await expect(refreshCache({ reload })).rejects.toThrow(/offline/i);
    expect(clearReadCache).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

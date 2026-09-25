// ─────────────────────────────────────────────────────────────
// client/src/services/readCache.js   (script 49)
//
// The last good answer to every read, kept on the device so a screen
// can still show something when the warehouse loses signal.
//
// HOW IT WORKS
// installReadCache() wraps window.fetch once, at boot (main.jsx). It
// has to be fetch and not apiGet: dispatchAPI, pickingAPI and the
// donation modules all call fetch directly, and a cache that only saw
// api.js would leave the gate and packing screens blank offline.
//
//   same-origin GET /api/...   network first, always. A good JSON
//                              answer is copied into IndexedDB.
//   the network fails          the copy is served instead, marked with
//                              X-WMS-Cached-At, and the offline bar
//                              says how old it is.
//   anything else              passed straight through.
//
// Online, nothing here changes what a screen shows — the cache is
// only ever read when the request could not complete.
//
// It is also the single place that reports reachability for every
// /api request (connection.js), for the same reason.
//
// WHOSE DATA
// Tablets are shared. Every entry carries the signed-in person's
// scope (role:id), is only served back to that same scope, and the
// whole store is cleared whenever the person changes or signs out
// (AuthContext.writeCachedUser). Nothing is cached before sign-in.
//
// WHAT IS NEVER KEPT
// Session and auth answers (/api/me must stay the server's word),
// the health probe, Gmail, the AI assistant, and the public token
// pages (slip lookup, the donor's section 18A form), which do not
// belong to whoever holds the tablet.
//
// LIMITS
// Entries older than 7 days are not served and are pruned, and the
// store keeps the newest 400. A read that has not answered in 20s is
// treated as no signal: one bar of wifi otherwise hangs a screen for
// minutes before the browser gives up.
//
// Writes are NOT made from here. A cached stock level can be hours
// old; the server still checks every submission against live data,
// which is what makes showing old numbers safe.
// ─────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react';
import { reportReach, reportUnreachable } from './connection';

const DB_NAME = 'batches-read-cache';
const STORE   = 'responses';
const VERSION = 1;

const MAX_AGE_MS     = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES    = 400;
const PRUNE_EVERY    = 50;
const GET_TIMEOUT_MS = 20000;

const NEVER_CACHE = [
  /^\/api\/me(\/|$)/,
  /^\/api\/login(\/|$)/,
  /^\/api\/health(\/|$)/,
  /^\/api\/gmail(\/|$)/,
  /^\/api\/assistant(\/|$)/,
  /^\/api\/slip(\/|$)/,
  /^\/api\/volunteers\/sign-(in|out)(\/|$)/,
  /^\/api\/donations\/section-18a\/form(\/|$)/,
];

// ── Whose data this is ────────────────────────────────────────
let scope = null;
export const setReadCacheScope = (next) => { scope = next || null; };

// ── "Showing saved data from …" ───────────────────────────────
// The oldest copy served since the last real answer. Cleared the
// moment any real response arrives.
let servedAt = null;
const servedListeners = new Set();
const setServed = (next) => {
  if (servedAt === next) return;
  servedAt = next;
  for (const listener of servedListeners) {
    try { listener(); } catch { /* not our problem */ }
  }
};
const subscribeServed = (listener) => {
  servedListeners.add(listener);
  return () => servedListeners.delete(listener);
};
export const getServedAt = () => servedAt;
export const useServedFromCache = () =>
  useSyncExternalStore(subscribeServed, getServedAt, () => null);

// ── IndexedDB ─────────────────────────────────────────────────
// Same shape and the same reasoning as outbox.js: localStorage's 5MB
// would be gone after a few stock lists.
let dbPromise = null;
const openDb = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('No IndexedDB in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
};

const run = async (mode, fn) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request && 'result' in request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const read = async (key) => {
  try {
    const row = await run('readonly', (store) => store.get(key));
    if (!row || Date.now() - row.savedAt > MAX_AGE_MS) return null;
    return row;
  } catch {
    return null;
  }
};

const prune = async () => {
  try {
    const rows = (await run('readonly', (store) => store.getAll())) ?? [];
    const cutoff = Date.now() - MAX_AGE_MS;
    const doomed = [...rows]
      .sort((a, b) => b.savedAt - a.savedAt)
      .filter((row, i) => i >= MAX_ENTRIES || row.savedAt < cutoff || row.scope !== scope);
    if (doomed.length === 0) return;
    await run('readwrite', (store) => {
      for (const row of doomed) store.delete(row.key);
    });
  } catch { /* no storage */ }
};

let writes = 0;
const write = async (row) => {
  try {
    await run('readwrite', (store) => store.put(row));
    writes += 1;
    if (writes % PRUNE_EVERY === 0) await prune();
  } catch {
    // No storage on this device: nothing is kept, nothing breaks.
  }
};

export const clearReadCache = async () => {
  setServed(null);
  try {
    await run('readwrite', (store) => store.clear());
  } catch { /* no storage */ }
};

// ── Which requests this touches ───────────────────────────────
export const classify = (input, init, origin) => {
  let url;
  let method;
  try {
    const raw = typeof input === 'string' ? input : (input?.url ?? String(input));
    url = new URL(raw, origin);
    method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
  } catch {
    return { api: false, cacheable: false };
  }
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) {
    return { api: false, cacheable: false };
  }
  return {
    api: true,
    cacheable: method === 'GET' && !NEVER_CACHE.some((re) => re.test(url.pathname)),
    path: url.pathname + url.search,
  };
};

const withTimeout = (init) => {
  if (init?.signal) return init;
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return init;
  return { ...init, signal: AbortSignal.timeout(GET_TIMEOUT_MS) };
};

const isJson = (res) => (res.headers?.get?.('content-type') || '').includes('application/json');

// ── The fetch wrapper ─────────────────────────────────────────
export const installReadCache = (target = globalThis) => {
  if (!target || typeof target.fetch !== 'function' || target.fetch.wmsReadCache) {
    return () => {};
  }
  const original = target.fetch;
  const realFetch = original.bind(target);
  const origin = target.location?.origin;

  const wrapped = async (input, init) => {
    const info = classify(input, init, origin);
    if (!info.api) return realFetch(input, init);

    const requestScope = scope;
    const key = info.cacheable && requestScope ? `${requestScope} ${info.path}` : null;

    let res;
    try {
      // Only a plain URL gets the timeout: a Request object carries
      // its own signal, and replacing it would drop the caller's.
      const useInit = key && typeof input === 'string' ? withTimeout(init) : init;
      res = await realFetch(input, useInit);
    } catch (err) {
      // A request the page cancelled says nothing about the network.
      if (err?.name === 'AbortError') throw err;
      reportUnreachable();
      if (key) {
        const row = await read(key);
        if (row && row.scope === requestScope) {
          setServed(servedAt === null ? row.savedAt : Math.min(servedAt, row.savedAt));
          return new Response(row.body, {
            status: 200,
            headers: {
              'Content-Type': row.contentType || 'application/json',
              'X-WMS-Cached-At': String(row.savedAt),
            },
          });
        }
      }
      throw err;
    }

    reportReach();
    setServed(null);

    if (key && res.ok && isJson(res)) {
      const contentType = res.headers.get('content-type');
      res.clone().text()
        .then((body) => {
          // Signed out, or someone else signed in, while this was in
          // flight: their data is not ours to keep.
          if (scope !== requestScope) return undefined;
          return write({ key, scope: requestScope, body, contentType, savedAt: Date.now() });
        })
        .catch(() => {});
    }
    return res;
  };

  wrapped.wmsReadCache = true;
  target.fetch = wrapped;
  return () => { target.fetch = original; };
};

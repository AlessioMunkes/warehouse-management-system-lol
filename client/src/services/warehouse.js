// ─────────────────────────────────────────────────────────────
// src/services/warehouse.js
//
// Which warehouse this browser is working in, and making sure every
// request to the server says so.
//
// With one database none of this does anything: the server never
// names a warehouse, so nothing is ever stored here and no header is
// ever sent. The app behaves exactly as before.
//
// With several, the server tells the app which warehouses a person
// can use (see AuthContext). The one they picked is kept here, and
// every call to /api carries it in the X-Warehouse header. The server
// checks that header against the session on every request; this file
// only says which site is meant, it grants nothing.
//
// WHY A fetch WRAPPER
// Requests go out through api.js but also through a dozen feature
// modules that call fetch() themselves. Adding the header in each of
// them would miss the next one somebody writes. Wrapping fetch once
// at startup covers all of them, including FormData uploads.
//
// An explicit X-Warehouse header on a request always wins. That is how
// the offline outbox replays a queued delivery to the warehouse it was
// recorded in, whichever warehouse is selected when it finally sends.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'wms_warehouse';
export const WAREHOUSE_HEADER = 'X-Warehouse';

const read = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

let active = read();
let override = null; // set synchronously around one call by runWithWarehouse
const listeners = new Set();

/** The warehouse code requests are going to, or null (one database / guest). */
export const getActiveWarehouse = () => active;

export const setActiveWarehouse = (code) => {
  const next = code || null;
  if (next === active) return;
  active = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode: still works for this tab */ }
  for (const listener of listeners) {
    try { listener(next); } catch { /* not our problem */ }
  }
};

export const clearActiveWarehouse = () => setActiveWarehouse(null);

export const subscribeWarehouse = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Runs fn with every fetch it STARTS SYNCHRONOUSLY sent to `code`.
 * The api.js helpers call fetch before their first await, so
 *   runWithWarehouse('gauteng', () => apiPost(url, body))
 * sends that one request to Gauteng without touching the selection.
 * A null code runs fn unchanged.
 */
export const runWithWarehouse = (code, fn) => {
  if (!code) return fn();
  const previous = override;
  override = code;
  try {
    return fn();
  } finally {
    override = previous;
  }
};

const isApiRequest = (url) => {
  try {
    const u = new URL(url, globalThis.location?.href || 'http://localhost/');
    return u.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

let installed = false;

/** Wraps window.fetch once. Called from main.jsx before the app renders. */
export const installWarehouseFetch = () => {
  if (installed || typeof globalThis.fetch !== 'function') return;
  installed = true;
  const original = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (input, init = {}) => {
    const code = override || active;
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!code || !isApiRequest(url)) return original(input, init);

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has(WAREHOUSE_HEADER)) headers.set(WAREHOUSE_HEADER, code);
    return original(input, { ...init, headers });
  };
};

/** Test hook. */
export const resetWarehouseForTests = () => {
  active = null;
  override = null;
  listeners.clear();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
};

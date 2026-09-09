// ─────────────────────────────────────────────────────────────
// src/services/api.js
//
// removed all localStorage token handling.
// The browser automatically sends the httpOnly cookie on every
// request — we just need credentials: 'include' to enable that.
// ─────────────────────────────────────────────────────────────

// In production the API is served from the SAME origin as this app
// (Express serves client/dist), so an empty base gives relative URLs
// like /api/login. In dev, Vite runs on :5173 and the API on :5000,
// so we need the absolute origin.
//
// Note the DEV check rather than `|| fallback`: VITE_API_URL is baked
// in at BUILD time, so an unset variable in a production build would
// otherwise leave every request pointing at the developer's localhost.
export const API_BASE =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? 'http://localhost:5000' : '');

// ── Idempotency keys ──────────────────────────────────────────
// Lives here rather than in one feature's API module because three
// write paths now need it — receiving, donation intake and the
// dispatch gate — and they must agree on the format. The server
// validates the shape against a UUID v4 regex, so the fallback below
// has to set the version and variant bits properly.
//
// A key identifies ONE attempt at a write, and must be reused on
// every retry of that attempt. Generating a fresh one per tap makes
// each retry look like a new delivery to the server, which is the
// exact problem the key exists to prevent.
//
// crypto.randomUUID is unavailable on plain http:// origins, which is
// how a tablet reaches a laptop on the warehouse LAN during testing —
// hence the fallback rather than a hard dependency.
export const newIdempotencyKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;   // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;   // variant 10x

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
};

// ── Unauthorized hook ─────────────────────────────────────────
// AuthContext registers a callback here at mount. When ANY request
// comes back 401, the session is gone as far as the server is
// concerned, so the client must stop pretending otherwise.
//
// Without this, an expired session produces a UI that looks logged
// in while every action fails — the exact failure this module is
// meant to prevent. A single 401 anywhere is enough to know.
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

// ── Handle response — throw a clean error on non-2xx ─────────
// The thrown error carries `.status`, because callers need to tell
// "the server rejected this" (401/403/404) apart from "the request
// never arrived". On a warehouse tablet with patchy signal those two
// cases must be handled differently: one means log out, the other
// means wait.
const handleResponse = async (res) => {
  // Not every non-2xx response is JSON — a proxy timeout or the SPA
  // fallback returns HTML, and res.json() would throw a parse error
  // that masks the real status.
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized(data.message);

    const error = new Error(data.message || `Request failed (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return data;
};

// ── Network-level failures ────────────────────────────────────
// fetch() only rejects when the request never completed (offline,
// DNS failure, connection refused). These errors get no `.status`,
// which is how callers distinguish them from a real server refusal.
const networkError = () => {
  const error = new Error('Could not reach the server. Check your connection and try again.');
  error.isNetworkError = true;
  return error;
};

// ── GET ───────────────────────────────────────────────────────
export const apiGet = async (endpoint) => {
  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      method:      'GET',
      credentials: 'include', // sends the httpOnly cookie automatically
      headers:     { 'Content-Type': 'application/json' },
    });
  } catch {
    throw networkError();
  }
  return handleResponse(res);
};

// ── POST ──────────────────────────────────────────────────────
export const apiPost = async (endpoint, body) => {
  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(body),
    });
  } catch {
    throw networkError();
  }
  return handleResponse(res);
};

// ── PATCH ─────────────────────────────────────────────────────
export const apiPatch = async (endpoint, body = {}) => {
  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      method:      'PATCH',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(body),
    });
  } catch {
    throw networkError();
  }
  return handleResponse(res);
};

// ── Short-lived cache for rarely-changing dropdown data ────────
// Suppliers, open-order suppliers, decantable products — all barely
// change minute to minute, but each staff task page is a fresh route
// mount (ReceivingPage/DecantingPage don't stay alive between visits),
// so without this every single visit re-paid the full round trip
// behind a loading skeleton before Guided or Form mode could show
// anything at all. That read as "the form is slow to appear" when the
// actual cost was a page-mount fetch, not the form itself.
//
// Deliberately a plain module-level Map, not a library: this only
// needs to survive across route mounts within one tab, not across
// reloads, and a short TTL means a stale read self-heals within a
// minute even if nothing ever calls invalidateCache.
const cache = new Map();

export const cachedGet = async (key, ttlMs, fetcher) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;

  const value = await fetcher();
  cache.set(key, { value, at: Date.now() });
  return value;
};

// Call after a write that could change what a cached read above would
// return — e.g. receiving a delivery can flip a purchase order to
// 'completed', which changes who has an open order to receive against.
export const invalidateCache = (key) => cache.delete(key);

// PUT is used by the attendance contract. It lives in the shared helper so
// that future attendance components keep the same cookie, network-error and
// session-expiry behaviour as every other API call.
export const apiPut = async (endpoint, body = {}) => {
  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      method:      'PUT',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(body),
    });
  } catch {
    throw networkError();
  }
  return handleResponse(res);
};

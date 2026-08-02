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
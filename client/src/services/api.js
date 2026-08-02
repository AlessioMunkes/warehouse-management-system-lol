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

// ── Handle response — throw a clean error on non-2xx ─────────
const handleResponse = async (res) => {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong.');
  }
  return data;
};

// ── GET ───────────────────────────────────────────────────────
export const apiGet = async (endpoint) => {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:      'GET',
    credentials: 'include', // sends the httpOnly cookie automatically
    headers:     { 'Content-Type': 'application/json' },
  });
  return handleResponse(res);
};

// ── POST ──────────────────────────────────────────────────────
export const apiPost = async (endpoint, body) => {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify(body),
  });
  return handleResponse(res);
};

// ── PATCH ─────────────────────────────────────────────────────
export const apiPatch = async (endpoint, body = {}) => {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method:      'PATCH',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify(body),
  });
  return handleResponse(res);
};
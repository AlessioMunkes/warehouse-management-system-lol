// ─────────────────────────────────────────────────────────────
// src/services/api.js
//
// removed all localStorage token handling.
// The browser automatically sends the httpOnly cookie on every
// request — we just need credentials: 'include' to enable that.
// ─────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
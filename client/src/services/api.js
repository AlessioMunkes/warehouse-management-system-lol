// ─────────────────────────────────────────────────────────────
// src/services/api.js
//
// Central place for all API calls.
// Every function here talks to the backend so that:
//   - The base URL is defined in one place
//   - The auth token is attached automatically on every request
//   - Error handling is consistent
//
// Usage in a component:
//   import { apiGet, apiPost } from '../services/api'
//   const deliveries = await apiGet('/api/deliveries')
// ─────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:5000';

// ── Helper: get the stored token ──────────────────────────────
const getToken = () => localStorage.getItem('wms_token');

// ── Build headers, attaching token if it exists ───────────────
const buildHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// ── Handle response — throw a clean error on non-2xx ─────────
const handleResponse = async (res) => {
  const data = await res.json();
  if (!res.ok) {
    // Use the backend's message if available, otherwise a generic one
    throw new Error(data.message || 'Something went wrong.');
  }
  return data;
};

// ── GET request ───────────────────────────────────────────────
export const apiGet = async (endpoint) => {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  return handleResponse(res);
};

// ── POST request ──────────────────────────────────────────────
export const apiPost = async (endpoint, body) => {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
};

// ── PATCH request ─────────────────────────────────────────────
export const apiPatch = async (endpoint, body = {}) => {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse(res);
};

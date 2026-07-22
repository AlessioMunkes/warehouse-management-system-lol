// ─────────────────────────────────────────────────────────────
// src/services/TempAPI.js
// TEMPORARY — Alessio to replace with real implementation
//  Written by Abukwe as a stand-in while Alessio's real API
// service layer is unavailable. This covers the minimum needed
// to unblock the Deliveries / Procurement flow for the WMS demo.
// ─────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env?.VITE_API_BASE_URL || '';

const request = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
};

export const apiGet  = (path)       => request(path);
export const apiPost = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
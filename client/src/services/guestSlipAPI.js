// ─────────────────────────────────────────────────────────────
// client/src/services/guestSlipAPI.js
//
// Everything the guest screens call. Wraps /api/slip the way
// pickingAPI.js wraps /api/picking: one request helper so
// credentials and error shape are decided once.
//
// Kept separate from pickingAPI.js deliberately. That module is the
// staff packing surface and a guest must never end up calling it — two
// files makes that visible, one file would make it an accident waiting
// to happen.
// ─────────────────────────────────────────────────────────────
import { API_BASE } from './api';

const BASE_URL = `${API_BASE}/api/slip`;

const request = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    // The guest session is an httpOnly cookie. Without this the
    // browser sends nothing and every authenticated call 401s.
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('We could not reach the system. Ask a staff member for help.');
  }

  const json = await res.json();
  if (!json.success) {
    const err = new Error(json.message || 'Something went wrong.');
    err.status = res.status;
    // The short-code screen needs to tell "no such code" from "that code
    // matches more than one pallet" — they need different wording.
    err.ambiguous = Boolean(json.ambiguous);
    throw err;
  }
  return json.data;
};

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

// ── Public: no session needed ─────────────────────────────────
export const fetchSlipPreview   = (token) => request(`/${encodeURIComponent(token)}`);
export const fetchSlipByCode    = (code)  => request(`/code/${encodeURIComponent(code.trim().toLowerCase())}`);

// Claim by either form. `name` is ignored by the server when the caller
// already has a guest session, so the same call serves a first-time
// scan and a signed-in volunteer picking off the list.
export const claimSlipByToken = (token, name) => post(`/${encodeURIComponent(token)}/claim`, { name });
export const claimSlipByCode  = (code, name)  => post(`/code/${encodeURIComponent(code.trim().toLowerCase())}/claim`, { name });

// ── Guest session required ────────────────────────────────────
export const fetchAvailableSlips = () => request('/available');

// Entry path 3: a signed-in volunteer picking a pallet off the list.
// They hold no token and no printed code — there is nothing to type —
// so the claim goes by slip id and is authorised by their session.
export const claimSlipById = (slipId) => post(`/claim/${slipId}`, {});
export const fetchMySlip         = () => request('/mine');

export const confirmItem = (slipId, itemId, packedQuantity) =>
  post(`/${slipId}/items/${itemId}/confirm`, { packedQuantity });

export const flagItem = (slipId, itemId, reason, packedQuantity) =>
  post(`/${slipId}/items/${itemId}/flag`, { reason, packedQuantity });

export const completeSlip = (slipId) => post(`/${slipId}/complete`, {});

export default {
  fetchSlipPreview, fetchSlipByCode,
  claimSlipByToken, claimSlipByCode,
  fetchAvailableSlips, claimSlipById, fetchMySlip,
  confirmItem, flagItem, completeSlip,
};

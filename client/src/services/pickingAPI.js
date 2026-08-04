// src/services/pickingAPI.js
// Centralized backend communication for the Packing feature.
// Components should never call fetch() directly — everything
// goes through these functions so error handling and request
// shapes stay in one place.

import { API_BASE } from './api';

const BASE_URL = `${API_BASE}/api/picking`;

// ── Shared request helper ─────────────────────────────────────
// Every call goes through here so two things can never be
// forgotten on a new endpoint:
//
//   credentials: 'include'  — auth is an httpOnly cookie. Without
//     this, fetch() sends no cookie and EVERY picking request
//     comes back 401, even while the user is logged in.
//
//   API_BASE — in dev the client runs on :5173 and the API on
//     :5000 with no Vite proxy, so a bare '/api/picking' would hit
//     the Vite dev server and 404. In production Express serves
//     both from one origin and API_BASE is ''.
const request = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return handleResponse(res);
};

// Unwraps the { success, data, message } envelope every endpoint
// returns. Throws on failure so callers can just try/catch.
async function handleResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Could not reach the Packing API (status ${res.status}). The backend may not be running yet.`
    );
  }

  const json = await res.json();
  if (!json.success) {
    const err = new Error(json.message || 'Request failed.');
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json.data;
}

// GET /api/picking — list slips for the board view, filtered by
// dispatch date / cohort / status, and "mine" for non-managers.
export async function fetchPickingSlips({ dispatchDate, cohort, status, mine } = {}) {
  const params = new URLSearchParams();
  if (dispatchDate) params.set('dispatchDate', dispatchDate);
  if (cohort) params.set('cohort', cohort);
  if (status) params.set('status', status);
  if (mine) params.set('mine', 'true');

  const qs = params.toString();
  return request(qs ? `?${qs}` : '');
}

// GET /api/picking/:id — one slip plus its full item list, for
// the detail view.
export async function fetchPickingSlip(slipId) {
  return request(`/${slipId}`);
}

// POST /api/picking/:id/assign — claim a slip. This UI only ever
// claims for the current user, so packerId is omitted; the
// backend infers it from the session.
export async function assignSlip(slipId, packerId) {
  return request(`/${slipId}/assign`, {
    method: 'POST',
    body: JSON.stringify(packerId ? { packerId } : {}),
  });
}

// POST /api/picking/:id/items/:itemId/confirm — mark one item as
// packed as required.
export async function confirmItem(slipId, itemId, packedQuantity) {
  return request(`/${slipId}/items/${itemId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ packedQuantity }),
  });
}

// POST /api/picking/:id/items/:itemId/flag — mark one item as
// short, damaged, or substituted. packedQuantity is optional
// (the packer may not know how much actually went out).
export async function flagItem(slipId, itemId, flagReason, packedQuantity) {
  return request(`/${slipId}/items/${itemId}/flag`, {
    method: 'POST',
    body: JSON.stringify(
      packedQuantity !== undefined && packedQuantity !== ''
        ? { flagReason, packedQuantity }
        : { flagReason }
    ),
  });
}

// POST /api/picking/:id/complete — close the slip once every item
// is confirmed or flagged. May return shortfalls for the caller
// to surface as a discrepancy notice.
export async function completeSlip(slipId, palletRef) {
  return request(`/${slipId}/complete`, {
    method: 'POST',
    body: JSON.stringify(palletRef ? { palletRef } : {}),
  });
}
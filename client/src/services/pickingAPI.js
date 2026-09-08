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

// POST /api/picking/:id/assign — claim a slip. A packer calling this
// with no packerId claims for themselves (packerId is ignored for
// them server-side either way). A manager may pass packerId to
// assign a slip to a specific worker — see AssignPickingSlipsPage.jsx,
// the first caller that actually uses this for someone other than
// the current user.
export async function assignSlip(slipId, packerId) {
  return request(`/${slipId}/assign`, {
    method: 'POST',
    body: JSON.stringify(packerId ? { packerId } : {}),
  });
}

// POST /api/picking/generate — bulk-generate the week's slips
// (manager only). Idempotent on the repository side.
export async function generateSlips({ dispatchDate, cohort }) {
  return request('/generate', {
    method: 'POST',
    body: JSON.stringify({ dispatchDate, cohort }),
  });
}

// POST /api/picking — create one ad-hoc slip for a single beneficiary
// (manager only): a late-registered centre, a correction, or a
// make-up delivery outside its normal rotation. `force` overrides
// the cohort-schedule check for a deliberate make-up run.
export async function createSlip({ ecdId, dispatchDate, cohort, force }) {
  return request('', {
    method: 'POST',
    body: JSON.stringify({ ecdId, dispatchDate, cohort, force }),
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

// GET /api/picking/workers — active warehouse_worker accounts
// (id + name only), manager only. Feeds AssignPickingSlipsPage.jsx's
// dropdown — deliberately not userAPI.getUsers, which is admin-only
// account provisioning, not a directory read.
export async function fetchAssignableWorkers() {
  return request('/workers');
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
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
// them server-side either way). The service still honours a manager
// passing packerId to assign someone specific, but no UI calls it
// that way any more — PickingSlipManagementPage.jsx now only ever
// releases a slip back to the floor (see releaseSlip below), not
// hand-picks who claims it.
export async function assignSlip(slipId, packerId) {
  return request(`/${slipId}/assign`, {
    method: 'POST',
    body: JSON.stringify(packerId ? { packerId } : {}),
  });
}

// POST /api/picking/:id/assign-second — add a second packer to a
// slip that already has a primary one. Manager only (enforced
// server-side) — see PickingSlipManagementPage.jsx, the only caller.
export async function addSecondPacker(slipId, packerId) {
  return request(`/${slipId}/assign-second`, {
    method: 'POST',
    body: JSON.stringify({ packerId }),
  });
}

// POST /api/picking/:id/release — manager only. Returns a claimed
// slip to the floor: clears both packer slots and sets status back to
// 'pending'. The only way to undo assignSlip's claim — see
// PickingSlipManagementPage.jsx, the only caller.
export async function releaseSlip(slipId) {
  return request(`/${slipId}/release`, { method: 'POST' });
}

// PATCH /api/picking/:id — manager only, and only while the slip is
// still pending: dispatch date, cohort, and/or the whole product-line
// list. `items`, when sent, REPLACES the slip's current lines — send
// the full edited set, not a delta. See PickingSlipManagementPage.jsx,
// the only caller.
export async function editSlip(slipId, { dispatchDate, cohort, force, items } = {}) {
  const body = {};
  if (dispatchDate !== undefined) body.dispatchDate = dispatchDate;
  if (cohort !== undefined)       body.cohort = cohort;
  if (force !== undefined)        body.force = force;
  if (items !== undefined)        body.items = items;
  return request(`/${slipId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

// POST /api/picking/generate — bulk-generate the week's slips
// (manager only). Idempotent on the repository side.
export async function generateSlips({ dispatchDate, cohort }) {
  return request('/generate', {
    method: 'POST',
    body: JSON.stringify({ dispatchDate, cohort }),
  });
}

// POST /api/picking — create one new slip for a single beneficiary
// (manager only): a late-registered centre, a correction, or a
// make-up delivery outside its normal rotation. `force` overrides
// the cohort-schedule check for a deliberate make-up run. `items`,
// when given, replaces the usual pull from the centre's standing
// order (ecd_order_lines) — a manager typed or adjusted the lines by
// hand instead of taking the standing order as-is.
export async function createSlip({ ecdId, dispatchDate, cohort, force, items }) {
  const body = { ecdId, dispatchDate, cohort, force };
  if (items !== undefined) body.items = items;
  return request('', { method: 'POST', body: JSON.stringify(body) });
}

// POST /api/picking/:id/items/:itemId/confirm — mark one item as
// packed as required.
export async function confirmItem(slipId, itemId, packedQuantity, note) {
  const body = { packedQuantity };
  if (note !== undefined && note !== '') body.note = note;
  return request(`/${slipId}/items/${itemId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// POST /api/picking/:id/items/:itemId/flag — mark one item as
// short, damaged, or substituted. packedQuantity is optional
// (the packer may not know how much actually went out). note is the
// paper slip's "Comment" column — for anything worth recording that
// isn't the flag reason itself.
export async function flagItem(slipId, itemId, flagReason, packedQuantity, note) {
  const body = { flagReason };
  if (packedQuantity !== undefined && packedQuantity !== '') body.packedQuantity = packedQuantity;
  if (note !== undefined && note !== '') body.note = note;
  return request(`/${slipId}/items/${itemId}/flag`, {
    method: 'POST',
    body: JSON.stringify(body),
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
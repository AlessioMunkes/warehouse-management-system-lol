// ─────────────────────────────────────────────────────────────
// src/services/communityRequestAPI.js
//
// Client wrapper around /api/community-requests (ADM-5.0 / BR-28 —
// benevolent requests). Mirrors communityRequest.controller.js, one
// function per route.
//
// Two jobs, same as supplierAPI.js / stockAPI.js:
//   1. Unwrap the { success, data } envelope.
//   2. Map the live snake_case columns to one camelCase shape.
//
// THE FLOW
//   log → approve (a manager chooses products and quantities; stock is
//   set aside) → claim or assign a packer → confirm what went out
//   (stock leaves) — or decline at either stage.
//
//   A request whose stock was used by a pallet stays approved but is
//   flagged (itemsShortAt): it "needs new items" until a manager
//   chooses other items.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch, apiPut } from './api';
import { postOrQueue } from './offlinePost';

// request_outcome enum. 'pending' is shown as "Awaiting approval".
// 'referred' exists in the DB but is not used.
export const OUTCOME_LABELS = {
  pending:             'Awaiting approval',
  approved:            'Approved',
  fulfilled:           'Fulfilled',
  partially_fulfilled: 'Partially fulfilled',
  declined:            'Declined',
  referred:            'Referred',
};

export const OUTCOMES = ['pending', 'approved', 'fulfilled', 'partially_fulfilled', 'declined', 'referred'];

const fullName = (first, last) => `${first ?? ''} ${last ?? ''}`.trim() || null;

const toItem = (line = {}) => ({
  id:               line.id,
  productId:        line.productId,
  productName:      line.productName ?? '',
  unit:             line.unit ?? '',
  quantityApproved: Number(line.quantityApproved ?? 0),
  quantityReleased: Number(line.quantityReleased ?? 0),
  shortAt:          line.shortAt ?? null,
});

// ── Row mapper ───────────────────────────────────────────────
export const toRequest = (row = {}) => ({
  id:             row.id,
  requestedAt:    row.requested_at ?? null,
  callerName:     row.caller_name ?? '',
  callerContact:  row.caller_contact ?? '',
  itemsRequested: row.items_requested ?? '',
  quantityNote:   row.quantity_note ?? '',
  outcome:        row.outcome ?? 'pending',
  outcomeNote:    row.outcome_note ?? '',
  handledBy:      row.handled_by ?? null,
  handledByName:  fullName(row.handled_by_first_name, row.handled_by_last_name),
  resolvedAt:     row.resolved_at ?? null,
  createdAt:      row.created_at ?? null,
  approvedAt:     row.approved_at ?? null,
  approvedBy:     row.approved_by ?? null,
  approvedByName: fullName(row.approved_by_first_name, row.approved_by_last_name),
  assignedTo:     row.assigned_to ?? null,
  assignedToName: fullName(row.assigned_to_first_name, row.assigned_to_last_name),
  // Set while any approved line ran short of stock.
  itemsShortAt:   row.items_short_at ?? null,
  items:          (row.items ?? []).map(toItem),
});

// ── GET /api/community-requests ──────────────────────────────
export const getRequests = async ({ outcome = '', search = '' } = {}) => {
  const params = new URLSearchParams();
  if (outcome) params.set('outcome', outcome);
  if (search.trim()) params.set('search', search.trim());
  const qs = params.toString();
  const body = await apiGet(`/api/community-requests${qs ? `?${qs}` : ''}`);
  return (body.data ?? []).map(toRequest);
};

// ── GET /api/community-requests/:id ──────────────────────────
export const getRequest = async (id) => {
  const body = await apiGet(`/api/community-requests/${id}`);
  return toRequest(body.data ?? {});
};

// ── POST /api/community-requests ─────────────────────────────
// `keepOffline` is the floor's: with no signal the request is kept on
// the phone and this returns { queued: true, label } (offlinePost.js).
// The manager's screen leaves it off, because only the floor's shell
// shows what is waiting and sends it.
export const logRequest = async (payload, { keepOffline = false } = {}) => {
  const body = keepOffline
    ? await postOrQueue('/api/community-requests', payload, { kind: 'request', label: 'A benevolent request' })
    : await apiPost('/api/community-requests', payload);
  return body.queued ? body : toRequest(body.data ?? {});
};

// ── POST /:id/approve ────────────────────────────────────────
// items: [{ productId, quantity }]. Manager or admin. Refused with a
// message if more is asked for than is available.
export const approveRequest = async (id, items) => {
  const body = await apiPost(`/api/community-requests/${id}/approve`, { items });
  return toRequest(body.data ?? {});
};

// ── POST /:id/decline ────────────────────────────────────────
// Awaiting approval or approved. Releases any stock set aside.
export const declineRequest = async (id, reason) => {
  const body = await apiPost(`/api/community-requests/${id}/decline`, { reason });
  return toRequest(body.data ?? {});
};

// ── PATCH /:id/assign ────────────────────────────────────────
// userId null clears the packer.
export const assignRequest = async (id, userId) => {
  const body = await apiPatch(`/api/community-requests/${id}/assign`, { userId });
  return toRequest(body.data ?? {});
};

// ── PUT /:id/items ───────────────────────────────────────────
// Choose other items for an approved request. Clears the flag.
export const rechooseItems = async (id, items) => {
  const body = await apiPut(`/api/community-requests/${id}/items`, { items });
  return toRequest(body.data ?? {});
};

// ── PATCH /:id/claim ─────────────────────────────────────────
// The current user takes an approved request. No body.
export const claimRequest = async (id) => {
  const body = await apiPatch(`/api/community-requests/${id}/claim`, {});
  return toRequest(body.data ?? {});
};

// ── POST /:id/confirm ────────────────────────────────────────
// items: [{ productId, quantityReleased }]; leave it out to release
// everything that was approved.
export const confirmRequest = async (id, items) => {
  const body = await postOrQueue(`/api/community-requests/${id}/confirm`, items ? { items } : {}, {
    kind: 'request', label: `Request ${id}`,
  });
  return body.queued ? body : toRequest(body.data ?? {});
};

export default {
  getRequests, getRequest, logRequest,
  approveRequest, declineRequest, assignRequest, rechooseItems, claimRequest, confirmRequest,
  OUTCOMES, OUTCOME_LABELS,
};

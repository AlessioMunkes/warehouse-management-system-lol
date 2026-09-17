// ─────────────────────────────────────────────────────────────
// src/services/communityRequestAPI.js
//
// Client wrapper around /api/community-requests (ADM-5.0 / BR-28 —
// the benevolent package call-in log). Mirrors
// communityRequest.controller.js, one function per route.
//
// Two jobs, same as supplierAPI.js / stockAPI.js:
//   1. Unwrap the { success, data } envelope.
//   2. Map the live snake_case columns to one camelCase shape.
//
// The table has a two-step workflow: log → claim (sets handledBy) →
// resolve (sets outcome + outcomeNote + resolvedAt). Claiming and
// resolving are separate calls; the UI must not conflate them.
//
// LOG ONLY — no endpoint here moves stock, and none is coming.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch } from './api';

// request_outcome enum. 'referred' exists in the DB and can appear on
// a row, so it has a label — but it is never offered as a resolve
// target (see RESOLVE_OUTCOMES).
export const OUTCOME_LABELS = {
  pending:             'Pending',
  fulfilled:           'Fulfilled',
  partially_fulfilled: 'Partially fulfilled',
  declined:            'Declined',
  referred:            'Referred',
};

export const OUTCOMES = ['pending', 'fulfilled', 'partially_fulfilled', 'declined', 'referred'];

// What staff may resolve a request to (BR-28 scope — excludes
// 'pending', the starting state, and 'referred', out of scope).
export const RESOLVE_OUTCOMES = ['fulfilled', 'partially_fulfilled', 'declined'];

// ── Row mapper ───────────────────────────────────────────────
export const toRequest = (row = {}) => {
  const first = row.handled_by_first_name ?? '';
  const last  = row.handled_by_last_name ?? '';
  const handledByName = `${first} ${last}`.trim();
  return {
    id:             row.id,
    requestedAt:    row.requested_at ?? null,
    callerName:     row.caller_name ?? '',
    callerContact:  row.caller_contact ?? '',
    itemsRequested: row.items_requested ?? '',
    quantityNote:   row.quantity_note ?? '',
    outcome:        row.outcome ?? 'pending',
    outcomeNote:    row.outcome_note ?? '',
    handledBy:      row.handled_by ?? null,
    handledByName:  handledByName || null,
    resolvedAt:     row.resolved_at ?? null,
    createdAt:      row.created_at ?? null,
  };
};

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
export const logRequest = async (payload) => {
  const body = await apiPost('/api/community-requests', payload);
  return toRequest(body.data ?? {});
};

// ── PATCH /api/community-requests/:id/claim ──────────────────
// The current user takes ownership. No body.
export const claimRequest = async (id) => {
  const body = await apiPatch(`/api/community-requests/${id}/claim`, {});
  return toRequest(body.data ?? {});
};

// ── PATCH /api/community-requests/:id/resolve ────────────────
export const resolveRequest = async (id, { outcome, outcomeNote }) => {
  const body = await apiPatch(`/api/community-requests/${id}/resolve`, { outcome, outcomeNote });
  return toRequest(body.data ?? {});
};

export default {
  getRequests, getRequest, logRequest, claimRequest, resolveRequest,
  OUTCOMES, OUTCOME_LABELS, RESOLVE_OUTCOMES,
};

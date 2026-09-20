// ─────────────────────────────────────────────────────────────
// client/src/services/collectionKitAPI.js
//
// Wrapper around /api/collection-kits — Feed the Soil kit tracking.
// One function per route in collectionKit.routes.js. Status naming
// stays 'assigned' | 'logged' | 'dispatched' end to end, matching the
// server exactly — see collectionKit.service.js's own note on why.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch } from './api';

// GET /api/collection-kits?search=
export const listKits = (search) =>
  apiGet(`/api/collection-kits${search ? `?search=${encodeURIComponent(search)}` : ''}`);

// POST /api/collection-kits — assign a new kit to an owner
export const createKit = (payload) => apiPost('/api/collection-kits', payload);

// GET /api/collection-kits/:id — kit + its full record history
export const getKit = (id) => apiGet(`/api/collection-kits/${id}`);

// GET /api/collection-kits/records?status=logged|dispatched&search=
export const listRecords = (params = {}) => {
  const { status, search } = typeof params === 'string' ? { status: params } : params;
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (search) query.set('search', search);
  const qs = query.toString();
  return apiGet(`/api/collection-kits/records${qs ? `?${qs}` : ''}`);
};

// GET /api/collection-kits/records/:recordId — one record, with its kit's identity
export const getRecord = (recordId) => apiGet(`/api/collection-kits/records/${recordId}`);

// POST /api/collection-kits/:id/records — log a compost weigh-in
export const logCompost = (kitId, payload) =>
  apiPost(`/api/collection-kits/${kitId}/records`, payload);

// PATCH /api/collection-kits/records/:recordId/dispatch
export const markDispatched = (recordId, dispatchedTo) =>
  apiPatch(`/api/collection-kits/records/${recordId}/dispatch`, { dispatchedTo });

export default {
  listKits, createKit, getKit, listRecords, getRecord, logCompost, markDispatched,
};

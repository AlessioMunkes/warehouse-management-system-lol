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

// GET /api/collection-kits/records?status=logged|dispatched
export const listRecords = (status) =>
  apiGet(`/api/collection-kits/records${status ? `?status=${encodeURIComponent(status)}` : ''}`);

// POST /api/collection-kits/:id/records — log a compost weigh-in
export const logCompost = (kitId, payload) =>
  apiPost(`/api/collection-kits/${kitId}/records`, payload);

// PATCH /api/collection-kits/records/:recordId/dispatch
export const markDispatched = (recordId) =>
  apiPatch(`/api/collection-kits/records/${recordId}/dispatch`, {});

export default { listKits, createKit, getKit, listRecords, logCompost, markDispatched };

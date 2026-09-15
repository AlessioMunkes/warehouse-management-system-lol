// ─────────────────────────────────────────────────────────────
// client/src/services/collectionKitAPI.js
//
// Wrapper around /api/collection-kits — Feed the Soil kit logging.
// One function per route in collectionKit.routes.js.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPatch } from './api';

// GET /api/collection-kits?status=out|returned
export const listKits = (status) =>
  apiGet(`/api/collection-kits${status ? `?status=${encodeURIComponent(status)}` : ''}`);

// POST /api/collection-kits
export const logKitOut = (payload) => apiPost('/api/collection-kits', payload);

// PATCH /api/collection-kits/:id/return
export const markReturned = (id, kgCompostReturned) =>
  apiPatch(`/api/collection-kits/${id}/return`, { kgCompostReturned });

export default { listKits, logKitOut, markReturned };

// ─────────────────────────────────────────────────────────────
// server/src/constants/storageAreas.js
//
// The storage-area vocabulary, in one place.
//
// These are the slugs ReceivingFlow.jsx's LOCATIONS list sends, the
// values donation_category_routing.storage_area holds, and the values
// delivery_note_items.storage_area is constrained to by migration 018.
//
// It lives here rather than in reportCatalog.js because the delivery
// service needs it too, and a service importing from the reporting
// feature to validate a receipt is the wrong direction. reportCatalog
// re-exports from here so there is still exactly one list — the same
// reasoning as purchaseOrderStatus.js, and for the same reason:
// movement_type drifted once because two modules each kept their own
// copy.
// ─────────────────────────────────────────────────────────────

export const STORAGE_AREAS = [
  'cold_room',
  'dry_store',
  'fts_section',
  'mezzanine',
  'boardroom',
];

export const isStorageArea = (value) =>
  STORAGE_AREAS.includes(String(value || '').trim());

export default { STORAGE_AREAS, isStorageArea };

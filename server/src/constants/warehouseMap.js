// ─────────────────────────────────────────────────────────────
// server/src/constants/warehouseMap.js
//
// The warehouse map's fixed lists, in one place: the kinds of area an
// admin can draw, what each kind holds, and the size of the grid.
//
// The kinds are the warehouse_areas.kind CHECK constraint (migrations
// 048, 049 and 051). The grid size is mirrored once on the client
// (features/warehouseMap/mapGeometry.js), which draws the same grid.
// ─────────────────────────────────────────────────────────────

export const AREA_KINDS = ['dry', 'cold', 'floor', 'staging', 'door', 'dispatch_gate', 'receiving_gate'];

// Where pallets leave and deliveries arrive. Like a door they hold
// nothing; the map stands a truck at them for the day's collections and
// expected deliveries.
export const GATE_KINDS = ['dispatch_gate', 'receiving_gate'];

// Stock is counted into these, and they can have a capacity by weight
// and preferred stock.
export const STORAGE_KINDS = ['dry', 'cold', 'floor'];

// Packed pallets wait here; capacity is in pallet spaces. A door holds
// nothing and is drawn for orientation.
export const STAGING_KIND = 'staging';

export const GRID = Object.freeze({ cols: 40, rows: 24 });

export const MAX_LEVELS = 4;
export const MAX_NAME_LENGTH = 40;
// A plan with more than this is not a floor plan.
export const MAX_AREAS = 200;
export const MAX_CAPACITY_KG = 10_000_000;
export const MAX_PALLET_SPACES = 999;
export const MAX_PREFERENCES = 200;
export const MAX_CATEGORY_LENGTH = 80;

export const isAreaKind = (value) => AREA_KINDS.includes(value);
export const isStorageKind = (value) => STORAGE_KINDS.includes(value);

export default {
  AREA_KINDS, GATE_KINDS, STORAGE_KINDS, STAGING_KIND, GRID, MAX_LEVELS, MAX_NAME_LENGTH, MAX_AREAS,
  MAX_CAPACITY_KG, MAX_PALLET_SPACES, MAX_PREFERENCES, MAX_CATEGORY_LENGTH, isAreaKind, isStorageKind,
};

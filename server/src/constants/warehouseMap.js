// ─────────────────────────────────────────────────────────────
// server/src/constants/warehouseMap.js
//
// The warehouse map's fixed lists, in one place: the kinds of area an
// admin can draw, which of them hold stock, and the size of the grid.
//
// The kinds are the warehouse_areas.kind CHECK constraint (migration
// 048). The grid size is mirrored once on the client
// (features/warehouseMap/mapGeometry.js), which draws the same grid.
// ─────────────────────────────────────────────────────────────

export const AREA_KINDS = ['dry', 'cold', 'floor', 'door'];

// A door is drawn for orientation; nothing is counted into it.
export const STORAGE_KINDS = ['dry', 'cold', 'floor'];

export const GRID = Object.freeze({ cols: 40, rows: 24 });

export const MAX_LEVELS = 4;
export const MAX_NAME_LENGTH = 40;
// A plan with more than this is not a floor plan.
export const MAX_AREAS = 200;

export const isAreaKind = (value) => AREA_KINDS.includes(value);
export const isStorageKind = (value) => STORAGE_KINDS.includes(value);

export default { AREA_KINDS, STORAGE_KINDS, GRID, MAX_LEVELS, MAX_NAME_LENGTH, MAX_AREAS, isAreaKind, isStorageKind };

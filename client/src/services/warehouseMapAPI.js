// ─────────────────────────────────────────────────────────────
// client/src/services/warehouseMapAPI.js
//
// The warehouse map: the floor plan an admin draws, and the counts a
// manager records into its areas. Mirrors warehouseMap.controller.js.
//
// Every call answers with the whole map (plan, what each area holds,
// what is not placed), so a screen replaces what it had rather than
// patching it. The server already sends numbers, worked out in
// JavaScript, not NUMERIC strings.
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPut, apiPatch } from './api';

const EMPTY = { ready: false, grid: { cols: 40, rows: 24 }, today: null, areas: [], products: [] };

const toMap = (body) => ({ ...EMPTY, ...(body?.data ?? {}) });

export const getWarehouseMap = async (options) => toMap(await apiGet('/api/warehouse-map', options));

/** areas: [{ id?, name, kind, x, y, w, h, levels }], the whole plan. */
export const saveWarehouseLayout = async (areas) => toMap(await apiPut('/api/warehouse-map/layout', { areas }));

/** One area's capacity, from the map: { capacityKg } or { palletSpaces }; null clears it. */
export const setAreaCapacity = async (areaId, capacity) =>
  toMap(await apiPatch(`/api/warehouse-map/areas/${areaId}/capacity`, capacity));

/** lines: [{ productId, quantity }], everything seen in the area. */
export const recordAreaCount = async (areaId, lines) =>
  toMap(await apiPost(`/api/warehouse-map/areas/${areaId}/counts`, { lines }));

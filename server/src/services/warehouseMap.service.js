// ─────────────────────────────────────────────────────────────
// server/src/services/warehouseMap.service.js
//
// The warehouse map: the floor plan an admin draws, and the counts a
// manager records into its areas.
//
// ONE ANSWER SHARED FOR A FEW SECONDS. Every manager with the Map tab open
// reads it once a minute, and building it replays the stock ledger for
// the expiry estimate. So the answer is kept for CACHE_MS per warehouse
// and handed to every reader, and saving a plan or a count drops it.
// Dispatch and packing do not drop it: the map catches up within
// CACHE_MS, which for a secondary screen is fresh enough.
//
// Nothing here touches stock_levels or the ledger. A count is a record
// of what was seen; the map shows it beside what is on hand, and a
// difference is corrected with the ordinary stock adjustment. Receiving,
// packing and dispatch never read any of this, so a plan nobody has
// drawn, or an area nobody has counted, holds up no one.
// ─────────────────────────────────────────────────────────────
import mapModel from '../repositories/warehouseMap.repository.js';
import { loadShelfLots, todayInSAST } from '../repositories/shelfLots.repository.js';
import { earliestLive } from '../features/stock/shelfLots.js';
import { placeStock } from '../features/warehouseMap/placement.js';
import { checkLayout } from '../features/warehouseMap/layout.js';
import { assertWholeByProduct } from '../features/units/wholeItems.js';
import { GRID, isStorageKind, MAX_CAPACITY_KG, MAX_PALLET_SPACES } from '../constants/warehouseMap.js';
import { toQuantity } from '../utils/validation.js';
import { currentWarehouse } from '../config/warehouseContext.js';
import { withTransaction } from '../utils/transaction.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const NOT_MIGRATED = 'This warehouse has no map yet: its database needs the latest update (npm run migrate).';

const num = (v) => Number(v ?? 0);

const CACHE_MS = 15_000;
const cache = new Map();
const cacheKey = () => currentWarehouse() ?? 'default';
const forget = () => cache.delete(cacheKey());

// ── The map ───────────────────────────────────────────────────
// The plan, what each area holds now, and every product with how much
// of it is not placed in any area. `ready` is false on a database
// without the tables.
const getMap = async () => {
  const key = cacheKey();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await buildMap();
  if (value.ready) cache.set(key, { at: Date.now(), value });
  return value;
};

const buildMap = async () => {
  const areas = await mapModel.listAreas();
  if (areas === null) return { ready: false, grid: GRID, areas: [], products: [] };
  const today = todayInSAST();
  const [counts, products, pallets, sizes, shelf, day, toPackRows] = await Promise.all([
    mapModel.listLatestCounts(),
    mapModel.listMapProducts(),
    mapModel.listPackedPallets(),
    mapModel.readUnitSizes(),
    loadShelfLots(),
    mapModel.listDayActivity(today),
    mapModel.listToPack(),
  ]);
  // Still to pack, per product: [{ quantity, unit, pallets, firstDay }].
  const toPackOf = new Map();
  for (const r of toPackRows) {
    const list = toPackOf.get(r.product_id) ?? [];
    list.push({ quantity: num(r.to_pack), unit: r.unit, pallets: r.pallets, firstDay: r.first_day });
    toPackOf.set(r.product_id, list);
  }
  const placed = placeStock({
    areas: areas.map((a) => ({
      id: a.id, name: a.name, kind: a.kind,
      x: num(a.x), y: num(a.y), w: num(a.w), h: num(a.h), levels: num(a.levels),
      capacityKg: a.capacity_kg === null || a.capacity_kg === undefined ? null : num(a.capacity_kg),
      palletSpaces: a.pallet_spaces ?? null,
      preferredProductIds: a.preferred_product_ids ?? [],
      preferredCategories: a.preferred_categories ?? [],
    })),
    counts: counts.map((c) => ({
      areaId: c.area_id, productId: c.product_id, quantity: num(c.quantity),
      countedAt: c.counted_at, countedByName: c.counted_by_name,
    })),
    products: products.map((p) => ({
      id: p.id, name: p.name, sku: p.sku, unit: p.unit, onHand: num(p.on_hand), onPallets: num(p.on_pallets),
      category: p.category ?? null, weightKg: p.weight_kg === null || p.weight_kg === undefined ? null : num(p.weight_kg),
      storageType: p.storage_type ?? null,
      programmeId: p.programme_id ?? null, programmeName: p.programme_name ?? null,
      earliestExpiry: earliestLive(shelf.get(p.id)?.lots ?? [], today)?.expiryDate ?? null,
      toPack: toPackOf.get(p.id) ?? [],
    })),
    pallets: pallets.map((r) => ({
      id: r.id, ref: r.pallet_ref ?? null, beneficiary: r.beneficiary ?? null, dispatchDate: r.dispatch_date ?? null,
    })),
    sizes,
  });

  // day: what is happening today, for the Today strip, the gates and
  // their trucks (listDayActivity). Packed pallets are in `areas` and
  // `unstagedPallets` already.
  return { ready: true, grid: GRID, today, day, ...placed };
};

// ── Saving the plan (admin) ───────────────────────────────────
const saveLayout = async (body, userId) => {
  const { areas, error } = checkLayout(body?.areas);
  if (error) fail(400, error);

  try {
    await withTransaction((client) => mapModel.saveLayout(client, areas, userId));
    forget();
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') fail(503, NOT_MIGRATED);
    // The partial unique index: another admin saved the same name in
    // the moment between the check and the write.
    if (err.code === '23505') fail(409, 'Another area already has one of these names. Reload and try again.');
    throw err;
  }
  return getMap();
};

// ── Counting an area (manager) ────────────────────────────────
// The lines are everything the manager saw in the area. A product the
// area held before that is not among them is recorded as 0: counting an
// area replaces what it held.
const recordCount = async (areaId, body, userId) => {
  const id = Number(areaId);
  if (!Number.isInteger(id) || id <= 0) fail(400, 'Choose an area to count.');

  let area;
  try {
    area = await mapModel.getArea(id);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') fail(503, NOT_MIGRATED);
    throw err;
  }
  if (!area) fail(404, 'That area is no longer on the plan. Reload the map.');
  if (!isStorageKind(area.kind)) fail(400, 'A door holds no stock. Choose another area.');

  const raw = body?.lines;
  if (!Array.isArray(raw)) fail(400, 'Send what you counted as a list of products.');

  const lines = [];
  const seen = new Set();
  for (const line of raw) {
    const productId = Number(line?.productId);
    const quantity = toQuantity(line?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) fail(400, 'Each line needs a product.');
    if (!Number.isFinite(quantity) || quantity < 0) fail(400, 'Enter a quantity of 0 or more for each product.');
    if (seen.has(productId)) fail(400, 'A product is listed twice. Enter it once with the total.');
    seen.add(productId);
    lines.push({ productId, quantity });
  }

  const before = await mapModel.latestCountsForArea(id);
  for (const row of before) {
    if (num(row.quantity) > 0 && !seen.has(row.product_id)) lines.push({ productId: row.product_id, quantity: 0 });
  }
  if (lines.length === 0) return getMap();

  const products = await mapModel.productsForCount(lines.map((l) => l.productId));
  const productOf = new Map(products.map((p) => [p.id, p]));
  const missing = lines.find((l) => !productOf.has(l.productId));
  if (missing) fail(400, 'One of these products is not in the catalogue. Reload the map.');

  await assertWholeByProduct(lines);

  await withTransaction((client) => mapModel.insertCounts(client, {
    areaId: id,
    countedBy: userId,
    lines: lines.map((l) => {
      const p = productOf.get(l.productId);
      return { ...l, unit: p.unit || 'each', onHand: num(p.on_hand) };
    }),
  }));
  forget();

  return getMap();
};

// ── An area's capacity, from the map ──────────────────────────
// A manager adjusts what an area holds without redrawing the plan
// (Warehouse layout, admins only): kilograms for a store, pallet spaces
// for staging. Blank clears it. Answers with the map.
const positiveOrNull = (raw, { whole = false, label }) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || (whole && !Number.isInteger(n))) {
    fail(400, `${label} must be ${whole ? 'a whole number' : 'a number'} above 0, or blank for none.`);
  }
  return n;
};

const setCapacity = async (areaId, body = {}) => {
  const id = Number(areaId);
  if (!Number.isInteger(id) || id <= 0) fail(400, 'Choose an area.');
  const area = await mapModel.getArea(id);
  if (!area) fail(404, 'That area is not on the plan any more. Reload the map.');
  if (!isStorageKind(area.kind) && area.kind !== 'staging') fail(400, 'This area has no capacity to set.');
  const capacityKg = area.kind === 'staging'
    ? (area.capacity_kg ?? null)
    : positiveOrNull(body.capacityKg, { label: 'Capacity' });
  const palletSpaces = area.kind === 'staging'
    ? positiveOrNull(body.palletSpaces, { whole: true, label: 'Pallet spaces' })
    : (area.pallet_spaces ?? null);
  // The same ceilings the layout keeps (constants/warehouseMap.js).
  if (capacityKg !== null && capacityKg > MAX_CAPACITY_KG) fail(400, 'That capacity is more than any area holds. Check the number.');
  if (palletSpaces !== null && palletSpaces > MAX_PALLET_SPACES) fail(400, 'That is more pallet spaces than any area has. Check the number.');
  await mapModel.setAreaCapacity(id, { capacityKg, palletSpaces });
  forget();
  return getMap();
};

// For tests: start from an empty cache.
export const clearMapCache = () => cache.clear();

export default { getMap, saveLayout, recordCount, setCapacity, clearMapCache };

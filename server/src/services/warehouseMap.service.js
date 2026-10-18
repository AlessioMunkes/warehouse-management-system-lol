// ─────────────────────────────────────────────────────────────
// server/src/services/warehouseMap.service.js
//
// The warehouse map: the floor plan an admin draws, and the counts a
// manager records into its areas.
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
import { GRID, isStorageKind } from '../constants/warehouseMap.js';
import { toQuantity } from '../utils/validation.js';
import { withTransaction } from '../utils/transaction.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const NOT_MIGRATED = 'This warehouse has no map yet: its database needs the latest update (npm run migrate).';

const num = (v) => Number(v ?? 0);

// ── The map ───────────────────────────────────────────────────
// The plan, what each area holds now, and every product with how much
// of it is not placed in any area. `ready` is false on a database
// without the tables.
const getMap = async () => {
  const [areas, counts, products, shelf] = await Promise.all([
    mapModel.listAreas(),
    mapModel.listLatestCounts(),
    mapModel.listMapProducts(),
    loadShelfLots(),
  ]);
  if (areas === null) return { ready: false, grid: GRID, areas: [], products: [] };

  const today = todayInSAST();
  const placed = placeStock({
    areas: areas.map((a) => ({
      id: a.id, name: a.name, kind: a.kind,
      x: num(a.x), y: num(a.y), w: num(a.w), h: num(a.h), levels: num(a.levels),
    })),
    counts: counts.map((c) => ({
      areaId: c.area_id, productId: c.product_id, quantity: num(c.quantity),
      countedAt: c.counted_at, countedByName: c.counted_by_name,
    })),
    products: products.map((p) => ({
      id: p.id, name: p.name, sku: p.sku, unit: p.unit, onHand: num(p.on_hand),
      storageType: p.storage_type ?? null,
      programmeId: p.programme_id ?? null, programmeName: p.programme_name ?? null,
      earliestExpiry: earliestLive(shelf.get(p.id)?.lots ?? [], today)?.expiryDate ?? null,
    })),
  });

  return { ready: true, grid: GRID, today, ...placed };
};

// ── Saving the plan (admin) ───────────────────────────────────
const saveLayout = async (body, userId) => {
  const { areas, error } = checkLayout(body?.areas);
  if (error) fail(400, error);

  try {
    await withTransaction((client) => mapModel.saveLayout(client, areas, userId));
  } catch (err) {
    if (err.code === '42P01') fail(503, NOT_MIGRATED);
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
    if (err.code === '42P01') fail(503, NOT_MIGRATED);
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

  return getMap();
};

export default { getMap, saveLayout, recordCount };

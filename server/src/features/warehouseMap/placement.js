// ─────────────────────────────────────────────────────────────
// server/src/features/warehouseMap/placement.js
//
// WHAT IS IN EACH AREA OF THE MAP, worked out rather than stored.
//
// A manager counts an area and records what they saw there
// (warehouse_area_counts). Stock then keeps moving: pallets are
// dispatched, deliveries come in. Nobody on the floor records which
// area stock was taken from, and nothing is asked of them, so a count
// gets older the moment it is saved.
//
// The same answer as committed stock (repositories/committedStock.sql.js):
// derive, never store a second balance that can drift. For each product:
//
//   counted  the newest count of it in every area, added up
//   onHand   stock_levels, what the ledger says is in the building
//
//   counted <= onHand   each area shows what was counted there, and the
//                       rest is "not placed": in the building, in no
//                       counted area (just received, or never counted)
//   counted >  onHand   stock has left since the counts (or more was
//                       counted than the ledger holds). Each area is
//                       scaled down in proportion, so the areas never
//                       add up to more than is on hand. The map says
//                       "about" for these.
//
// Nothing here can stop a delivery, a pallet or a dispatch. A product
// nobody has counted is simply all "not placed".
//
// The difference a manager acts on is countedTotal against onHand,
// shown beside the product; correcting the ledger is the ordinary
// stock adjustment.
//
// No SQL and no clock here.
// ─────────────────────────────────────────────────────────────

const EPSILON = 1e-9;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * areas     active areas: { id, name, kind, x, y, w, h, levels }
 * counts    the newest count per area and product:
 *           { areaId, productId, quantity, countedAt, countedByName }
 * products  every active product: { id, name, sku, unit, onHand,
 *           programmeId, programmeName, storageType, earliestExpiry }
 *
 * Returns { areas, products }:
 *   areas[i].items   what is in it now: { productId, name, sku, unit,
 *                    counted, about, scaled, countedAt, countedByName }
 *   areas[i].lastCountedAt, earliestExpiry, programmes
 *   products[i]      the product with countedTotal, placed, unplaced
 */
export const placeStock = ({ areas = [], counts = [], products = [] }) => {
  const productOf = new Map(products.map((p) => [p.id, p]));
  const areaIds = new Set(areas.map((a) => a.id));

  // Only counts of an area still on the plan and a product still
  // active, and only what was actually there.
  const live = counts.filter((c) => areaIds.has(c.areaId) && productOf.has(c.productId) && num(c.quantity) > EPSILON);

  const countedOf = new Map();
  for (const c of live) countedOf.set(c.productId, (countedOf.get(c.productId) ?? 0) + num(c.quantity));

  const factorOf = new Map();
  for (const [productId, counted] of countedOf) {
    const onHand = Math.max(num(productOf.get(productId).onHand), 0);
    factorOf.set(productId, counted > onHand + EPSILON ? onHand / counted : 1);
  }

  const itemsOf = new Map(areas.map((a) => [a.id, []]));
  const placedOf = new Map();
  for (const c of live) {
    const p = productOf.get(c.productId);
    const factor = factorOf.get(c.productId);
    const about = round(num(c.quantity) * factor);
    placedOf.set(c.productId, (placedOf.get(c.productId) ?? 0) + about);
    itemsOf.get(c.areaId).push({
      productId: p.id,
      name: p.name,
      sku: p.sku ?? null,
      unit: p.unit ?? '',
      counted: round(num(c.quantity)),
      about,
      scaled: factor < 1,
      countedAt: c.countedAt ?? null,
      countedByName: c.countedByName ?? null,
    });
  }

  const placedAreas = areas.map((area) => {
    const items = itemsOf.get(area.id).sort((a, b) => a.name.localeCompare(b.name));
    const stocked = items.filter((i) => i.about > EPSILON);

    const lastCountedAt = items.reduce((latest, i) => {
      const at = i.countedAt ? new Date(i.countedAt).toISOString() : null;
      return at && (!latest || at > latest) ? at : latest;
    }, null);

    const earliestExpiry = stocked.reduce((soonest, i) => {
      const day = productOf.get(i.productId).earliestExpiry;
      return day && (!soonest || day < soonest) ? day : soonest;
    }, null);

    // By how many products, not by quantity: kilograms and crates do not
    // add up.
    const byProgramme = new Map();
    for (const i of stocked) {
      const p = productOf.get(i.productId);
      const key = p.programmeId ?? null;
      const entry = byProgramme.get(key) ?? { id: key, name: p.programmeName ?? null, products: 0 };
      entry.products += 1;
      byProgramme.set(key, entry);
    }
    const programmes = [...byProgramme.values()]
      .sort((a, b) => b.products - a.products || String(a.name ?? '').localeCompare(String(b.name ?? '')));

    return { ...area, items, lastCountedAt, earliestExpiry, programmes };
  });

  const placedProducts = products.map((p) => {
    const onHand = num(p.onHand);
    const placed = round(placedOf.get(p.id) ?? 0);
    return {
      ...p,
      onHand,
      countedTotal: round(countedOf.get(p.id) ?? 0),
      placed,
      unplaced: round(Math.max(onHand - placed, 0)),
    };
  });

  return { areas: placedAreas, products: placedProducts };
};

export default { placeStock };

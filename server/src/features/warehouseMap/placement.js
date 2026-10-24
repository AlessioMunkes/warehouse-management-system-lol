// ─────────────────────────────────────────────────────────────
// server/src/features/warehouseMap/placement.js
//
// WHAT IS IN EACH AREA OF THE MAP, worked out rather than stored.
//
// Nobody on the floor records where stock is put or taken from, and
// nothing is asked of them. The map is built every time from facts the
// system already has, so nothing can drift (the same reasoning as
// repositories/committedStock.sql.js):
//
//   onHand      stock_levels: what the ledger says is in the building
//   onPallets   packed onto a pallet that has not been dispatched
//               (committedStock, pallets only). It has left the shelves
//               and stands in a staging area
//   shelf       onHand - onPallets: what is on the shelves
//
// and, for each product, in this order:
//
//   1. COUNTED   the newest count of it in each area a manager counted.
//                When the counts add up to more than is on the shelves
//                (stock went out since, or onto a pallet), every area is
//                scaled down in proportion, so the map never shows more
//                than there is. Shown as "about".
//   2. EXPECTED  what is left goes to the areas meant for it: an area
//                that names the product, or failing that its category.
//                Split by the areas' capacity when every one has one,
//                evenly otherwise. Shown as "expected here".
//   3. NOT PLACED whatever is still left: stock with no counted area and
//                no area meant for it.
//
// Dispatch lowers onHand and packing raises onPallets, so both empty
// the shelves on the map on their own, with no write of their own.
//
// PALLETS. Each packed, not dispatched pallet goes to a staging area,
// filling them in plan order. More pallets than spaces stay in the last
// one and show it over capacity, which is the truth.
//
// WEIGHT, for capacity. Kilograms, grams and the sized units (crate,
// bag, box, punnet, Settings → Stock rules) convert; a litre is taken as
// a kilogram; an item counted "each" uses the product's weight, or, with
// none on record, a size in its name ("Baked Beans 410g", "Oil 2L").
// Stock whose weight is still not known is counted in `unweighed`.
//
// No SQL and no clock here.
// ─────────────────────────────────────────────────────────────
import { convertQuantity } from '../units/unitConversion.js';
import { STAGING_KIND, isStorageKind } from '../../constants/warehouseMap.js';

const EPSILON = 1e-9;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const round = (n) => Math.round(n * 1000) / 1000;
const LITRES = { l: 1, ml: 0.001 };

/** A quantity of a product in kilograms, or null when its weight is not known. */
export const weightKg = (product, quantity, sizes = {}) => {
  const q = num(quantity);
  if (q === 0) return 0;
  const unit = product.unit || '';
  const kg = convertQuantity(q, unit, 'kg', sizes);
  if (kg !== null) return kg;
  if (LITRES[unit]) return q * LITRES[unit];
  const each = num(product.weightKg) > 0 ? num(product.weightKg) : sizeInName(product.name);
  return each > 0 ? q * each : null;
};

// "410g", "2 kg", "750ml", "5L" in a product's name, as kilograms; null for none.
const SIZE = /(\d+(?:[.,]\d+)?)\s?(kg|g|ml|l)\b/i;
const SIZE_KG = { kg: 1, g: 0.001, l: 1, ml: 0.001 };
export const sizeInName = (name) => {
  const m = String(name ?? '').match(SIZE);
  return m ? Number(m[1].replace(',', '.')) * SIZE_KG[m[2].toLowerCase()] : null;
};

const lower = (s) => String(s ?? '').trim().toLowerCase();

/**
 * areas     active areas: { id, name, kind, x, y, w, h, levels,
 *           capacityKg, palletSpaces, preferredProductIds, preferredCategories }
 * counts    the newest count per area and product:
 *           { areaId, productId, quantity, countedAt, countedByName }
 * products  every active product: { id, name, sku, unit, onHand, onPallets,
 *           weightKg, category, programmeId, programmeName, storageType,
 *           earliestExpiry }
 * pallets   packed pallets not yet dispatched:
 *           { id, ref, beneficiary, dispatchDate }
 * sizes     unit sizes as saved { crate, bag, box, punnet } (unitConversion.js)
 */
export const placeStock = ({ areas = [], counts = [], products = [], pallets = [], sizes = {} }) => {
  const productOf = new Map(products.map((p) => [p.id, p]));
  const storage = areas.filter((a) => isStorageKind(a.kind));
  const storageIds = new Set(storage.map((a) => a.id));

  const shelfOf = new Map(products.map((p) => [p.id, Math.max(num(p.onHand) - Math.max(num(p.onPallets), 0), 0)]));

  // ── 1. Counted ──────────────────────────────────────────────
  const live = counts.filter((c) => storageIds.has(c.areaId) && productOf.has(c.productId) && num(c.quantity) > EPSILON);
  const countedOf = new Map();
  for (const c of live) countedOf.set(c.productId, (countedOf.get(c.productId) ?? 0) + num(c.quantity));

  const itemsOf = new Map(areas.map((a) => [a.id, []]));
  const placedOf = new Map();
  const item = (p, about, extra) => ({
    productId: p.id, name: p.name, sku: p.sku ?? null, unit: p.unit ?? '',
    about: round(about), kg: weightKg(p, about, sizes), ...extra,
  });

  for (const c of live) {
    const p = productOf.get(c.productId);
    const counted = countedOf.get(c.productId);
    const shelf = shelfOf.get(c.productId);
    const factor = counted > shelf + EPSILON ? shelf / counted : 1;
    const about = num(c.quantity) * factor;
    placedOf.set(p.id, (placedOf.get(p.id) ?? 0) + about);
    itemsOf.get(c.areaId).push(item(p, about, {
      source: 'counted',
      counted: round(num(c.quantity)),
      scaled: factor < 1,
      countedAt: c.countedAt ?? null,
      countedByName: c.countedByName ?? null,
    }));
  }

  // ── 2. Expected, in the areas meant for it ──────────────────
  const byProduct = new Map();
  const byCategory = new Map();
  for (const a of storage) {
    for (const id of a.preferredProductIds ?? []) {
      if (!byProduct.has(id)) byProduct.set(id, []);
      byProduct.get(id).push(a);
    }
    for (const cat of a.preferredCategories ?? []) {
      const key = lower(cat);
      if (!key) continue;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(a);
    }
  }

  const expectedOf = new Map();
  for (const p of products) {
    const rest = shelfOf.get(p.id) - (placedOf.get(p.id) ?? 0);
    if (rest <= EPSILON) continue;
    const homes = byProduct.get(p.id) ?? byCategory.get(lower(p.category)) ?? [];
    if (homes.length === 0) continue;
    const byCapacity = homes.every((a) => num(a.capacityKg) > 0);
    const total = byCapacity ? homes.reduce((s, a) => s + num(a.capacityKg), 0) : homes.length;
    for (const a of homes) {
      const share = rest * (byCapacity ? num(a.capacityKg) : 1) / total;
      itemsOf.get(a.id).push(item(p, share, { source: 'expected', counted: null, scaled: false, countedAt: null, countedByName: null }));
    }
    expectedOf.set(p.id, rest);
  }

  // ── Pallets into staging areas ──────────────────────────────
  const staging = areas.filter((a) => a.kind === STAGING_KIND);
  const palletsOf = new Map(staging.map((a) => [a.id, []]));
  let next = 0;
  staging.forEach((a, index) => {
    const last = index === staging.length - 1;
    const room = last ? Infinity : Math.max(num(a.palletSpaces), 0) || 0;
    const take = pallets.slice(next, next + room);
    palletsOf.get(a.id).push(...take);
    next += take.length;
  });
  const unstagedPallets = pallets.slice(next);

  // ── The areas ───────────────────────────────────────────────
  const placedAreas = areas.map((area) => {
    const items = itemsOf.get(area.id).sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
    const stocked = items.filter((i) => i.about > EPSILON);
    const areaPallets = palletsOf.get(area.id) ?? [];

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

    const heldKg = round(stocked.reduce((s, i) => s + (i.kg ?? 0), 0));
    const unweighed = stocked.filter((i) => i.kg === null).length;
    const capacityKg = num(area.capacityKg) > 0 ? num(area.capacityKg) : null;
    const palletSpaces = num(area.palletSpaces) > 0 ? num(area.palletSpaces) : null;
    const fill = area.kind === STAGING_KIND
      ? (palletSpaces ? round(areaPallets.length / palletSpaces) : null)
      : (capacityKg ? round(heldKg / capacityKg) : null);

    return {
      ...area, capacityKg, palletSpaces, items, pallets: areaPallets,
      heldKg, unweighed, fill, lastCountedAt, earliestExpiry, programmes,
    };
  });

  // ── The products ────────────────────────────────────────────
  const placedProducts = products.map((p) => {
    const onHand = num(p.onHand);
    const shelf = shelfOf.get(p.id);
    const placed = round(placedOf.get(p.id) ?? 0);
    const expected = round(expectedOf.get(p.id) ?? 0);
    return {
      ...p,
      onHand,
      onPallets: round(Math.max(num(p.onPallets), 0)),
      shelf: round(shelf),
      countedTotal: round(countedOf.get(p.id) ?? 0),
      placed,
      expected,
      unplaced: round(Math.max(shelf - placed - expected, 0)),
    };
  });

  // ── Totals, for the capacity summary ────────────────────────
  const sum = (list, key) => round(list.reduce((s, a) => s + (num(a[key]) || 0), 0));
  const storageAreas = placedAreas.filter((a) => isStorageKind(a.kind));
  const byKind = Object.fromEntries(['dry', 'cold', 'floor'].map((kind) => {
    const list = storageAreas.filter((a) => a.kind === kind);
    return [kind, { areas: list.length, heldKg: sum(list, 'heldKg'), capacityKg: sum(list.filter((a) => a.capacityKg), 'capacityKg') || null }];
  }));
  const stagingAreas = placedAreas.filter((a) => a.kind === STAGING_KIND);
  const totals = {
    storage: {
      heldKg: sum(storageAreas, 'heldKg'),
      // Only what is held in areas WITH a capacity is compared with it.
      heldInSizedKg: sum(storageAreas.filter((a) => a.capacityKg), 'heldKg'),
      capacityKg: sum(storageAreas.filter((a) => a.capacityKg), 'capacityKg') || null,
      unweighed: storageAreas.reduce((s, a) => s + a.unweighed, 0),
    },
    byKind,
    pallets: {
      total: pallets.length,
      spaces: sum(stagingAreas.filter((a) => a.palletSpaces), 'palletSpaces') || null,
      unstaged: unstagedPallets.length,
    },
  };

  return { areas: placedAreas, products: placedProducts, unstagedPallets, totals };
};

export default { placeStock, weightKg, sizeInName };

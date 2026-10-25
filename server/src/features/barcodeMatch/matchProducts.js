// ─────────────────────────────────────────────────────────────
// server/src/features/barcodeMatch/matchProducts.js
//
// Which stock item a barcode nobody has seen probably belongs to.
//
// The case it is for: the warehouse stocks "Baked beans 410g" and has
// Brand A's barcode on it. A delivery of Brand B's beans arrives, same
// food, same size, new barcode. Open Food Facts says what Brand B's
// pack is; this compares that with each stock item and says which one
// it looks like, so the worker attaches the code with one tap instead
// of searching. It only ever SUGGESTS: a person confirms every link,
// because a wrong one counts stock against the wrong item.
//
// RULES, NOT AI. Three plain checks, each a reason the screen can
// show ("same pack size", "same name", "same kind of food"):
//
//   size   the pack size Open Food Facts gives against the stock item's
//          own weight and the sizes of the barcodes already on it.
//          Within 1% is the same size (a rounding difference). More
//          than 2% apart rules the item out altogether: a 400 g tin is
//          not the 410 g stock item, and 410 g beans are not the 800 g
//          one, however alike the names. Only for items counted by the
//          pack (a tin, "each"): an item counted by weight or volume (kg,
//          g, l, ml) is the same stock item in any pack, so a 5 kg bag of
//          rice is still Rice, whatever size its other barcodes are.
//   name   the words that say what the food IS, against the stock
//          item's name and the names of its other barcodes. Brand,
//          sizes and filler words are taken out, and so is everything
//          after "in" or "with": in "pilchards in tomato sauce" the
//          sauce is what it is packed in, and beans in the same sauce
//          are not pilchards. All the shorter name's words found is a
//          full match; half of them a partial one. The pack's Open Food
//          Facts categories count as names for it too, but only when a
//          category's words ARE the stock item's name: Heinz call
//          theirs "Beanz" and file it under "baked beans in tomato
//          sauce", which reads as {baked, beans}, exactly the stock
//          item "Baked Beans". A broader category ("prepared
//          vegetables") never matches a stock item ("Vegetables") just
//          because it contains its word.
//   kind   the pack's categories against those of the barcodes already
//          on the stock item. Open Food Facts does not list them in
//          any reliable order, so it is the share that counts: at
//          least 80% of the shorter list in common is the same kind of
//          food, the strongest sign two brands are the same thing; at
//          least half is a broader likeness.
//
//   points   same size 3 · full name 3 · partial name 2 · same kind 3
//            · a broader likeness 1
//   shown    3 points or more, and at least a name match or the same
//            kind: a size alone says nothing about what the food is.
//
// The best three are returned, best first. Nothing scoring enough is
// an empty list, and the screen carries on as it always has.
// ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'in', 'with', 'for', 'to', 'on', 'or',
  'tin', 'tins', 'can', 'cans', 'pack', 'packs', 'pkt', 'bag', 'box', 'jar', 'bottle',
  'g', 'kg', 'ml', 'l', 'lt', 'x', 'each', 'ea', 'pcs', 'no',
]);

const SAME_SIZE = 0.01;
const OTHER_SIZE = 0.02;
const SHOW_AT = 3;
// Counted by weight or volume: the pack size says nothing about which
// stock item it is.
const WEIGHED = ['kg', 'g', 'l', 'ml'];
const LIMIT = 3;

// "Baked Beans in Tomato Sauce 410g" → {'baked', 'bean'}
export const nameWords = (text, brand = null) => {
  const brandWords = new Set(String(brand ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return new Set(String(text ?? '')
    .toLowerCase()
    // What it is packed in or served with is not what it is.
    .split(/\s(?:in|with)\s/)[0]
    .replace(/\d+(\.\d+)?\s*(kg|g|ml|l|lt)\b/g, ' ')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !brandWords.has(w))
    .map((w) => {
      if (w.endsWith('oes') && w.length > 4) return w.slice(0, -2);   // tomatoes → tomato
      if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;   // berries → berry
      if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
      return w;
    }));
};

// 1 = every word of the shorter name is in the longer one.
const nameOverlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size);
};

const sizeGap = (a, b) => Math.abs(a - b) / Math.max(a, b);

// food:       { productName, brand, weightKg, categories }
// candidates: [{ id, name, sku, unit, weightKg, barcodes: [{ foodName, foodBrand,
//               foodWeightKg, foodCategories }] }]
// → [{ productId, productName, sku, score, reasons: ['size'|'name'|'kind'] }]
export const matchProducts = (food, candidates) => {
  if (!food) return [];
  const cats = [...new Set((food.categories ?? []).filter(Boolean))];
  const ownName = nameWords(food.productName, food.brand);
  // Each category read as a name: "baked-beans-in-tomato-sauce" → {baked, bean}.
  const categoryNames = cats.map((tag) => nameWords(tag.replace(/-/g, ' '))).filter((w) => w.size > 0);
  const sameWords = (a, b) => a.size > 0 && a.size === b.size && [...a].every((w) => b.has(w));

  const scored = [];
  for (const c of candidates ?? []) {
    const barcodes = c.barcodes ?? [];

    // Size: the item's own weight, and every pack size already on it.
    const sizes = [c.weightKg, ...barcodes.map((b) => b.foodWeightKg)]
      .map(Number).filter((n) => Number.isFinite(n) && n > 0);
    let sameSize = false;
    if (food.weightKg && sizes.length && !WEIGHED.includes(c.unit)) {
      sameSize = sizes.some((s) => sizeGap(s, food.weightKg) <= SAME_SIZE);
      if (!sameSize && sizes.every((s) => sizeGap(s, food.weightKg) > OTHER_SIZE)) continue;
    }

    // Name: the best of the item's own name and its barcodes' names.
    const theirNames = [nameWords(c.name), ...barcodes.map((b) => nameWords(b.foodName, b.foodBrand))]
      .filter((w) => w.size > 0);
    const overlap = Math.max(0, ...theirNames.map((theirs) => nameOverlap(ownName, theirs)));
    const byCategory = theirNames.some((theirs) => categoryNames.some((cat) => sameWords(cat, theirs)));
    const nameScore = overlap >= 0.999 || byCategory ? 3 : overlap >= 0.5 ? 2 : 0;

    // Kind: how much of the two packs' category lists agree.
    const theirCats = new Set(barcodes.flatMap((b) => b.foodCategories ?? []));
    const sharedCats = cats.filter((t) => theirCats.has(t)).length;
    const share = sharedCats / Math.max(1, Math.min(cats.length, theirCats.size));
    const sameKind = sharedCats >= 2 && share >= 0.8;
    const kindScore = sameKind ? 3 : sharedCats >= 2 && share >= 0.5 ? 1 : 0;

    const score = (sameSize ? 3 : 0) + nameScore + kindScore;
    if (score < SHOW_AT || (nameScore === 0 && !sameKind)) continue;

    scored.push({
      productId: c.id,
      productName: c.name,
      sku: c.sku ?? null,
      score,
      reasons: [sameSize && 'size', nameScore > 0 && 'name', sameKind && 'kind'].filter(Boolean),
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.productName.localeCompare(b.productName))
    .slice(0, LIMIT);
};

export default { matchProducts, nameWords };

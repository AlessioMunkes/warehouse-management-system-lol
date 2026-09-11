// ─────────────────────────────────────────────────────────────
// client/src/features/purchaseOrders/components/purchaseOrderLine.js
//
// The empty-line factory and the arithmetic that keeps a line's three
// numbers agreeing with each other.
//
// A module that exports both a component and a plain function opts out
// of Fast Refresh, so every keystroke in the PO form remounted the
// whole table and dropped focus. Hence these live apart from the
// component that uses them.
//
// THE THREE NUMBERS ARE ONE FACT
// Quantity, expected weight and line cost are three ways of saying the
// same thing about an order line, tied together by two facts from the
// catalogue: what one of these weighs, and what one costs. Type any of
// the three and the other two follow.
//
//   quantity q   -> weight = q x weightPerUnit,  cost = q x costPerUnit
//   weight  w    -> cost   = w x (costPerUnit / weightPerUnit)
//   cost    c    -> weight = c x (weightPerUnit / costPerUnit)
//
// WEIGHT AND COST DO NOT DRIVE QUANTITY, deliberately. expected_quantity
// is an integer — you order three crates, not 1.4 of them — so
// back-computing it from a weight would either produce a fraction the
// column cannot hold or round the number the buyer actually typed. The
// realistic case is the other way round: you ordered 3 crates, this
// supplier's crates run heavy, so you correct the expected weight and
// the money follows it.
//
// EVERY LINK IS SKIPPED WHEN THE CATALOGUE IS SILENT. A product with no
// recorded weight leaves the weight box alone; one with no cost leaves
// the cost alone. Filling a confident 0 into an order for something
// nobody has priced is worse than leaving it blank, which is also why
// unit_cost is nullable — see migration 020.
// ─────────────────────────────────────────────────────────────

export const blankLine = () => ({
  // A client-side key so React can track a row that has no id yet.
  // Array index would do the wrong thing the moment a middle row is
  // removed: every row below it would re-key and lose focus.
  key: `line-${Math.random().toString(36).slice(2, 10)}`,
  productId: '',
  // One. Nobody adds a line meaning to order none of something, and a
  // blank box is one more thing to fill in on every single row.
  expectedQuantity: '1',
  expectedWeightKg: '',
  lineCost: '',
});

// Money to two places, weight to three. Both as strings, because these
// go straight back into controlled inputs and a float would render as
// 4.800000000000001 the moment it is multiplied.
const asMoney  = (n) => (Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : '');
const asWeight = (n) => {
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 1000) / 1000;
  // No trailing zeros on a whole number — "30" reads better than
  // "30.000" in a box somebody is about to retype.
  return String(rounded);
};

const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// What a freshly chosen product should put in the row. Quantity is
// whatever the row already had, which is 1 on a new line and whatever
// the buyer typed on one they are re-pointing at a different product.
export const lineForProduct = (line, product) => {
  const qty = positive(line.expectedQuantity) ?? 1;
  const perWeight = product ? positive(product.weightKg) : null;
  const perCost   = product && Number.isFinite(Number(product.unitCost)) && product.unitCost !== null
    ? Number(product.unitCost)
    : null;

  return {
    ...line,
    productId: product ? String(product.id) : '',
    expectedQuantity: String(qty),
    expectedWeightKg: perWeight ? asWeight(qty * perWeight) : line.expectedWeightKg,
    lineCost: perCost !== null ? asMoney(qty * perCost) : line.lineCost,
  };
};

// One of the three changed. Recompute the other two where the
// catalogue gives us enough to do it.
export const relinkLine = (line, product, field, raw) => {
  const next = { ...line, [field]: raw };
  if (!product) return next;

  const perWeight = positive(product.weightKg);
  const perCost   = product.unitCost === null || product.unitCost === undefined
    ? null
    : Number(product.unitCost);
  const hasCost   = perCost !== null && Number.isFinite(perCost);

  if (field === 'expectedQuantity') {
    const qty = positive(raw);
    if (qty === null) return next;                  // mid-typing, or cleared
    if (perWeight) next.expectedWeightKg = asWeight(qty * perWeight);
    if (hasCost)   next.lineCost         = asMoney(qty * perCost);
    return next;
  }

  if (field === 'expectedWeightKg') {
    const w = Number(raw);
    // perCost of exactly 0 is a real price (a donated line), and
    // 0 x anything is 0 — which is the right answer, so this only
    // needs perWeight to be non-zero to avoid dividing by it.
    if (perWeight && hasCost && Number.isFinite(w)) {
      next.lineCost = asMoney(w * (perCost / perWeight));
    }
    return next;
  }

  if (field === 'lineCost') {
    const c = Number(raw);
    // Here the divisor is the cost, so a zero-cost product cannot map a
    // price back to a weight — there is no ratio. Leave the weight be.
    if (perWeight && hasCost && perCost > 0 && Number.isFinite(c)) {
      next.expectedWeightKg = asWeight(c * (perWeight / perCost));
    }
    return next;
  }

  return next;
};

// The line as the server wants it. purchase_order_items stores
// unit_price PER UNIT and the estimate is quantity x unit_price, so the
// line cost the buyer typed is divided back out here. Doing it at the
// boundary rather than in the form keeps one number on screen and the
// right number in the table.
export const unitPriceFor = (line) => {
  const qty  = positive(line.expectedQuantity);
  const cost = line.lineCost === '' || line.lineCost === null ? null : Number(line.lineCost);
  if (qty === null || cost === null || !Number.isFinite(cost)) return null;
  return Math.round((cost / qty) * 100) / 100;
};

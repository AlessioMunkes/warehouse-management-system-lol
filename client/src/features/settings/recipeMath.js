// ─────────────────────────────────────────────────────────────
// client/src/features/settings/recipeMath.js
//
// A recipe line is an amount per child. A centre's child count is
// rounded UP to a multiple of the band (Settings → Recipes, "Children
// per band") before it is multiplied, so centres are supplied in bands:
// with bands of 5, a centre of 23 gets the slip for 25.
//
// The same sums the server does when it writes a slip
// (server: features/recipes/recipeSeason.js, recipe.repository.js),
// including the rounding to two decimals.
// ─────────────────────────────────────────────────────────────
export const DEFAULT_CHILD_BAND = 5;
// Deliberately not a multiple of 5, so the example shows the rounding.
export const EXAMPLE_CHILDREN = 23;

const round2 = (n) => Math.round(n * 100) / 100;

export const bandedChildCount = (childCount, band = DEFAULT_CHILD_BAND) => {
  const count = Number(childCount);
  const size = Number.isInteger(Number(band)) && Number(band) >= 1 ? Number(band) : 1;
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.ceil(count / size) * size;
};

// What a slip carries for one line, for a centre of `children`.
export const exampleQuantity = (quantityPerChild, { children = EXAMPLE_CHILDREN, band = DEFAULT_CHILD_BAND } = {}) => {
  const n = Number(quantityPerChild);
  return Number.isFinite(n) && n > 0 ? round2(n * bandedChildCount(children, band)) : null;
};

// "for 23 children (counted as 25)", or just "for 23 children" when the
// band leaves the count as it is.
export const exampleCentre = ({ children = EXAMPLE_CHILDREN, band = DEFAULT_CHILD_BAND } = {}) => {
  const counted = bandedChildCount(children, band);
  return counted === children ? `for ${children} children` : `for ${children} children (counted as ${counted})`;
};

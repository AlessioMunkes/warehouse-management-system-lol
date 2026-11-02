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
// including rounding loose amounts UP to the decimal places set under
// Settings → Recipes (0 by default: whole units, so 3.3 L becomes 4 L).
// ─────────────────────────────────────────────────────────────
export const DEFAULT_CHILD_BAND = 5;
export const DEFAULT_LOOSE_PLACES = 0;
// Deliberately not a multiple of 5, so the example shows the rounding.
export const EXAMPLE_CHILDREN = 23;

// Units that are counted, not weighed or poured.
const COUNTED_UNITS = ['each', 'bag', 'box', 'crate', 'punnet'];

// Rounds UP to `places` decimals (0, 1 or 2; anything else is 0).
const roundUpTo = (n, places) => {
  const p = Number.isInteger(Number(places)) && places >= 0 && places <= 2 ? Number(places) : 0;
  const step = 10 ** p;
  return Math.ceil(Math.round(n * step * 1e6) / 1e6) / step;
};

export const bandedChildCount = (childCount, band = DEFAULT_CHILD_BAND) => {
  const count = Number(childCount);
  const size = Number.isInteger(Number(band)) && Number(band) >= 1 ? Number(band) : 1;
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.ceil(count / size) * size;
};

// What a slip carries for one line, for a centre of `children`.
// A line in a counted unit is rounded UP to a whole one: nobody picks
// 3.6 cans.
// `whole` is for a product that is not decantable: whatever its unit, a
// slip carries a whole number of it.
export const exampleQuantity = (quantityPerChild, {
  children = EXAMPLE_CHILDREN, band = DEFAULT_CHILD_BAND, unit, whole = false, places = DEFAULT_LOOSE_PLACES,
} = {}) => {
  const n = Number(quantityPerChild);
  if (!Number.isFinite(n) || n <= 0) return null;
  const amount = n * bandedChildCount(children, band);
  // Rounded to six places first: 0.12 × 75 is 9.000000000000002 in
  // floating point, and that must not become 10 cans.
  const exact = Math.round(amount * 1e6) / 1e6;
  return whole || COUNTED_UNITS.includes(unit) ? Math.ceil(exact) : roundUpTo(exact, places);
};

// "for 23 children (counted as 25)", or just "for 23 children" when the
// band leaves the count as it is.
export const exampleCentre = ({ children = EXAMPLE_CHILDREN, band = DEFAULT_CHILD_BAND } = {}) => {
  const counted = bandedChildCount(children, band);
  return counted === children ? `for ${children} children` : `for ${children} children (counted as ${counted})`;
};

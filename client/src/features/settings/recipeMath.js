// ─────────────────────────────────────────────────────────────
// client/src/features/settings/recipeMath.js
//
// A recipe line is an amount per child. This is what a slip carries for
// a centre of a given size — the same rounding the server uses when it
// writes the slip (two decimals).
// ─────────────────────────────────────────────────────────────
export const EXAMPLE_CHILDREN = 25;

const round2 = (n) => Math.round(n * 100) / 100;

export const exampleQuantity = (quantityPerChild, children = EXAMPLE_CHILDREN) => {
  const n = Number(quantityPerChild);
  return Number.isFinite(n) && n > 0 ? round2(n * children) : null;
};

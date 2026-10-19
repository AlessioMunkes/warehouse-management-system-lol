// ─────────────────────────────────────────────────────────────
// client/src/features/impactMap/impactScale.js
//
// How big a centre's circle is drawn. The AREA of a circle is what the
// eye compares, so the radius grows with the square root of the meals:
// a centre with four times the meals has twice the radius and four
// times the area. The largest in view gets MAX_RADIUS; a centre that
// was served but would be a speck gets MIN_RADIUS so it can still be
// seen and clicked, and a centre with nothing in the period gets the
// same small size (drawn grey, not by cohort).
// ─────────────────────────────────────────────────────────────

export const MIN_RADIUS = 5;
export const MAX_RADIUS = 26;

/** Radius in pixels for `value` (meals, or kilograms with no factor), against the largest in view. */
export const radiusFor = (value, largest, { min = MIN_RADIUS, max = MAX_RADIUS } = {}) => {
  const v = Number(value);
  const top = Number(largest);
  if (!(v > 0) || !(top > 0)) return min;
  return Math.max(min, max * Math.sqrt(Math.min(v, top) / top));
};

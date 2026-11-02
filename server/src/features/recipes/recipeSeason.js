// ─────────────────────────────────────────────────────────────
// server/src/features/recipes/recipeSeason.js
//
// Which recipe applies on a date. No database and no clock in here, so
// the rules can be tested directly.
//
//   1. An override whose dates cover the day wins. Where two overlap,
//      the one that started most recently does.
//   2. Otherwise the season: each of summer and winter starts on a day
//      of the year, and a date belongs to whichever started last.
// ─────────────────────────────────────────────────────────────

// Month and day as one comparable number: 1 May -> 501.
const dayKey = (month, day) => Number(month) * 100 + Number(day);

// 'summer' or 'winter' for an ISO date, given each season's start.
export const seasonFor = (isoDate, { summer, winter }) => {
  const [, month, day] = String(isoDate).slice(0, 10).split('-').map(Number);
  const key = dayKey(month, day);
  const s = dayKey(summer.month, summer.day);
  const w = dayKey(winter.month, winter.day);
  if (s === w) return 'summer';
  // The season that starts earlier in the year runs until the other one
  // starts; the later one runs over the new year.
  if (s < w) return key >= s && key < w ? 'summer' : 'winter';
  return key >= w && key < s ? 'winter' : 'summer';
};

// The recipe row for an ISO date, from every recipe row. null when the
// season rows are missing.
export const recipeForDate = (recipes, isoDate) => {
  const day = String(isoDate).slice(0, 10);
  const overrides = recipes
    .filter((r) => r.kind === 'override' && r.starts_on <= day && r.ends_on >= day)
    .sort((a, b) => (b.starts_on === a.starts_on ? b.id - a.id : b.starts_on.localeCompare(a.starts_on)));
  if (overrides[0]) return overrides[0];

  const summer = recipes.find((r) => r.kind === 'summer');
  const winter = recipes.find((r) => r.kind === 'winter');
  if (!summer || !winter) return summer ?? winter ?? null;
  const season = seasonFor(day, {
    summer: { month: summer.season_start_month, day: summer.season_start_day },
    winter: { month: winter.season_start_month, day: winter.season_start_day },
  });
  return season === 'summer' ? summer : winter;
};

// A centre's child count as its slip counts it: rounded UP to a multiple
// of the band, so nobody in a band is left short. 23 children in bands
// of 5 are supplied as 25. A band of 1 is the exact count. The SQL in
// recipe.repository.js does the same sum.
export const bandedChildCount = (childCount, band) => {
  const count = Number(childCount);
  const size = Number.isInteger(Number(band)) && Number(band) >= 1 ? Number(band) : 1;
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.ceil(count / size) * size;
};

// Units that are counted, not weighed or poured. Nobody picks 3.6 cans,
// so a line in one of these is rounded UP to a whole number.
export const COUNTED_UNITS = ['each', 'bag', 'box', 'crate', 'punnet'];

// What a slip carries for one recipe line, for a child count already
// rounded to its band. The SQL in recipe.repository.js does the same sum
// (looseQuantitySql below).
//
// `whole` is for a product that is not decantable, whatever its unit:
// only a decantable product can be a part quantity (migration 044).
// `places` is how many decimals a loose (decantable) amount is rounded
// UP to (Settings → Recipes, "Decimal places for loose products").
export const slipQuantity = (quantityPerChild, unit, children, { whole = false, places = 0 } = {}) => {
  const amount = Number(quantityPerChild) * Number(children);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  // Rounded to six places first: 0.12 × 75 is 9.000000000000002 in
  // floating point, and that must not become 10 cans.
  const exact = Math.round(amount * 1e6) / 1e6;
  if (whole || COUNTED_UNITS.includes(unit)) return Math.ceil(exact);
  const step = 10 ** usablePlaces(places);
  return Math.ceil(Math.round(exact * step * 1e6) / 1e6) / step;
};

// 0, 1 or 2; anything else is 0 (whole units).
export const usablePlaces = (places) => {
  const n = Number(places);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
};

// The SQL for one recipe line's slip quantity, the same sum as
// slipQuantity. `amount` is the quantity-per-child times children
// expression; `counted` and `places` are the placeholders holding
// COUNTED_UNITS and the decimal places.
export const recipeLineQuantitySql = (amount, counted, places) =>
  `CASE WHEN rl.unit = ANY(${counted}::text[]) OR NOT p.is_decantable
        THEN CEIL(ROUND(${amount}, 6))
        ELSE CEIL(ROUND(${amount}, 6) * (10::numeric ^ ${places}::int)) / (10::numeric ^ ${places}::int)
   END`;

// A day that exists every year: 29 February is refused so a season
// never starts on a date that is missing three years in four.
export const isRealDayOfYear = (month, day) => {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(2001, month, 0)).getUTCDate();
};

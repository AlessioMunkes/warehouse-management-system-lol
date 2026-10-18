// ─────────────────────────────────────────────────────────────
// server/src/services/recipe.service.js
//
// What an admin may save on Settings → Recipes, and the shape the
// screen reads. Which recipe applies on a date is recipeSeason.js.
// ─────────────────────────────────────────────────────────────
import recipeRepository from '../repositories/recipe.repository.js';
import { recipeForDate, isRealDayOfYear } from '../features/recipes/recipeSeason.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

// The units stock is kept in (stock_levels_unit_check).
const UNITS = ['kg', 'g', 'l', 'ml', 'each', 'bag', 'box', 'crate', 'punnet'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PER_CHILD = 1000;

const todayInSAST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

const isPositiveInt = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

const isRealDate = (value) => {
  if (!ISO_DAY.test(String(value))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const toRecipe = (row) => ({
  id:   row.id,
  name: row.name,
  kind: row.kind,
  seasonStart: row.kind === 'override' ? null : { month: row.season_start_month, day: row.season_start_day },
  startsOn: row.starts_on ?? null,
  endsOn:   row.ends_on ?? null,
  lines: (row.lines ?? []).map((line) => ({
    productId:        line.product_id,
    productName:      line.product_name,
    productArchived:  Boolean(line.product_archived),
    quantityPerChild: Number(line.quantity_per_child),
    unit:             line.unit,
  })),
});

// ── Read ──────────────────────────────────────────────────────
const getOverview = async () => {
  const [rows, centres] = await Promise.all([
    recipeRepository.listRecipes(),
    recipeRepository.listOwnOrderCentres(),
  ]);
  const today = todayInSAST();
  const current = recipeForDate(rows, today);
  return {
    today,
    currentRecipeId: current?.id ?? null,
    recipes: rows.map(toRecipe),
    ownOrderCentres: centres.map((c) => ({ id: c.id, name: c.name, childCount: c.child_count })),
  };
};

// ── Validation ────────────────────────────────────────────────
const cleanLines = async (lines) => {
  if (!Array.isArray(lines)) throw fail(400, 'Send the recipe lines as a list.');
  const seen = new Set();
  const cleaned = lines.map((line, i) => {
    const n = i + 1;
    if (!isPositiveInt(line?.productId)) throw fail(400, `Line ${n}: choose a product.`);
    const productId = Number(line.productId);
    if (seen.has(productId)) throw fail(400, `Line ${n}: that product is already on the recipe.`);
    seen.add(productId);

    const quantity = Number(line.quantityPerChild);
    if (line.quantityPerChild === '' || line.quantityPerChild === null || !Number.isFinite(quantity) || quantity <= 0) {
      throw fail(400, `Line ${n}: enter an amount per child greater than 0.`);
    }
    if (quantity > MAX_PER_CHILD) throw fail(400, `Line ${n}: ${MAX_PER_CHILD} per child is the most a line can be.`);
    if (!UNITS.includes(line.unit)) throw fail(400, `Line ${n}: choose a unit.`);
    return { productId, quantityPerChild: quantity, unit: line.unit };
  });

  const missing = await recipeRepository.missingProducts(cleaned.map((l) => l.productId));
  if (missing.length) throw fail(400, 'One of the products is archived or no longer exists. Remove it and save again.');
  return cleaned;
};

const cleanOverrideFields = (body) => {
  const name = String(body?.name ?? '').trim();
  if (!name) throw fail(400, 'Give the recipe a name.');
  if (name.length > 80) throw fail(400, 'Keep the name to 80 characters or fewer.');
  if (!isRealDate(body?.startsOn)) throw fail(400, 'Choose the day the recipe starts.');
  if (!isRealDate(body?.endsOn)) throw fail(400, 'Choose the day the recipe ends.');
  if (body.endsOn < body.startsOn) throw fail(400, 'The end date must be on or after the start date.');
  return { name, startsOn: body.startsOn, endsOn: body.endsOn };
};

// ── Write ─────────────────────────────────────────────────────
const createOverride = async (body, userId) => {
  const fields = cleanOverrideFields(body);
  const lines = await cleanLines(body?.lines ?? []);
  await recipeRepository.createOverride({ ...fields, lines, userId });
  return getOverview();
};

const updateRecipe = async (rawId, body) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid recipe ID is required.');
  const existing = await recipeRepository.getRecipeById(Number(rawId));
  if (!existing) throw fail(404, 'Recipe not found.');

  const lines = await cleanLines(body?.lines);
  // A season's name and start are not edited here; only an override has
  // a name and dates of its own.
  const fields = existing.kind === 'override' ? cleanOverrideFields(body) : {};
  await recipeRepository.updateRecipe(existing.id, { ...fields, lines });
  return getOverview();
};

const deleteOverride = async (rawId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid recipe ID is required.');
  const existing = await recipeRepository.getRecipeById(Number(rawId));
  if (!existing) throw fail(404, 'Recipe not found.');
  if (existing.kind !== 'override') throw fail(400, 'The summer and winter recipes cannot be deleted. Remove their lines instead.');
  await recipeRepository.deleteOverride(existing.id);
  return getOverview();
};

const cleanSeasonStart = (value, season) => {
  const month = Number(value?.month);
  const day = Number(value?.day);
  if (!isRealDayOfYear(month, day)) throw fail(400, `Choose a real day for when ${season} starts.`);
  return { month, day };
};

const setSeasonStarts = async (body) => {
  const summer = cleanSeasonStart(body?.summer, 'summer');
  const winter = cleanSeasonStart(body?.winter, 'winter');
  if (summer.month === winter.month && summer.day === winter.day) {
    throw fail(400, 'Summer and winter cannot start on the same day.');
  }
  await recipeRepository.setSeasonStarts({ summer, winter });
  return getOverview();
};

const setOwnOrderCentres = async (body, userId) => {
  if (!Array.isArray(body?.ecdIds)) throw fail(400, 'Send the centres as a list.');
  if (!body.ecdIds.every(isPositiveInt)) throw fail(400, 'One of the centres is not valid.');
  const ecdIds = [...new Set(body.ecdIds.map(Number))];
  const missing = await recipeRepository.missingCentres(ecdIds);
  if (missing.length) throw fail(400, 'One of the centres no longer exists.');
  await recipeRepository.setOwnOrderCentres(ecdIds, userId);
  return getOverview();
};

export default { getOverview, createOverride, updateRecipe, deleteOverride, setSeasonStarts, setOwnOrderCentres };

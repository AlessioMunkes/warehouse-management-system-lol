// ─────────────────────────────────────────────────────────────
// server/src/services/dashboard.service.js
//
// Little validation to do — these take no input — but kept as its own
// layer rather than having the controller call the repository
// directly, matching every other feature's controller/service/
// repository split.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/dashboard.repository.js';
import recipeRepository from '../repositories/recipe.repository.js';
import settings from '../features/settings/settings.service.js';
import { recipeForDate } from '../features/recipes/recipeSeason.js';

const getSummary = async () => repo.getSummary();
const getMyWork  = async () => repo.getMyWork();
const getAttention = async () => repo.getAttention();

const todayInSAST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

// Stock cover is worked out from the recipe today's slips are made
// from. A recipe that cannot be read, or has no products, means no
// cover figures — the other two figures still come back.
const getInsights = async () => {
  let recipe = null;
  let childBand = 1;
  try {
    const current = recipeForDate(await recipeRepository.listRecipes(), todayInSAST());
    if (current && current.lines.length > 0) {
      recipe = { id: current.id, name: current.name };
      childBand = await settings.get('recipes.childBand');
    }
  } catch (err) {
    console.error('[dashboard] No stock cover; could not read the recipe in use:', err.message);
  }
  return repo.getInsights({ recipe, childBand });
};

export default { getSummary, getMyWork, getAttention, getInsights };

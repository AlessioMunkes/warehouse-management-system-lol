// ─────────────────────────────────────────────────────────────
// server/src/controllers/recipe.controller.js
//
// Settings → Recipes. Every write answers with the whole overview, so
// the screen never has to piece a change back together.
// ─────────────────────────────────────────────────────────────
import recipeService from '../services/recipe.service.js';

const respond = (res, err, where, fallback) => {
  console.error(`[${where}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({ success: false, message: status < 500 ? err.message : fallback });
};

const send = (work, where, fallback, okStatus = 200) => async (req, res) => {
  try {
    res.status(okStatus).json({ success: true, data: await work(req) });
  } catch (err) { respond(res, err, where, fallback); }
};

// GET /api/recipes
const overview = send(() => recipeService.getOverview(), 'recipeOverview', 'Failed to load recipes.');

// POST /api/recipes — a new override
const create = send((req) => recipeService.createOverride(req.body, req.user.id), 'createRecipe', 'Failed to create the recipe.', 201);

// PUT /api/recipes/:id — its lines, and for an override its name and dates
const update = send((req) => recipeService.updateRecipe(req.params.id, req.body), 'updateRecipe', 'Failed to save the recipe.');

// DELETE /api/recipes/:id — overrides only
const remove = send((req) => recipeService.deleteOverride(req.params.id), 'deleteRecipe', 'Failed to delete the recipe.');

// PUT /api/recipes/seasons — { summer: { month, day }, winter: { month, day } }
const seasons = send((req) => recipeService.setSeasonStarts(req.body), 'setSeasonStarts', 'Failed to save the seasons.');

// PUT /api/recipes/own-order-centres — { ecdIds: [] }
const ownOrderCentres = send((req) => recipeService.setOwnOrderCentres(req.body, req.user.id), 'setOwnOrderCentres', 'Failed to save the centres.');

export default { overview, create, update, remove, seasons, ownOrderCentres };

// ─────────────────────────────────────────────────────────────
// client/src/services/recipeAPI.js
//
// Settings → Recipes (/api/recipes). Every call answers with the whole
// overview:
//   { today, currentRecipeId,
//     recipes: [{ id, name, kind, seasonStart, startsOn, endsOn,
//                 lines: [{ productId, productName, quantityPerChild, unit }] }],
//     ownOrderCentres: [{ id, name, childCount }] }
// ─────────────────────────────────────────────────────────────
import { apiGet, apiPost, apiPut, apiDelete } from './api';

export const getRecipes = async () => (await apiGet('/api/recipes')).data;

// { name, startsOn, endsOn, lines }
export const createOverrideRecipe = async (recipe) => (await apiPost('/api/recipes', recipe)).data;

// { lines } for summer and winter; { name, startsOn, endsOn, lines } for an override.
export const saveRecipe = async (id, recipe) => (await apiPut(`/api/recipes/${id}`, recipe)).data;

export const deleteOverrideRecipe = async (id) => (await apiDelete(`/api/recipes/${id}`)).data;

// { summer: { month, day }, winter: { month, day } }
export const saveSeasonStarts = async (starts) => (await apiPut('/api/recipes/seasons', starts)).data;

export const saveOwnOrderCentres = async (ecdIds) => (await apiPut('/api/recipes/own-order-centres', { ecdIds })).data;

export default { getRecipes, createOverrideRecipe, saveRecipe, deleteOverrideRecipe, saveSeasonStarts, saveOwnOrderCentres };

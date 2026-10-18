// ─────────────────────────────────────────────────────────────
// server/src/routes/recipe.routes.js
//
// Settings → Recipes. Admin only, like the rest of Settings: a recipe
// decides what goes on every centre's picking slip.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ONLY } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import recipeController from '../controllers/recipe.controller.js';

const router = express.Router();

router.get('/',  auth, requireRole(...ADMIN_ONLY), recipeController.overview);
router.post('/', auth, requireRole(...ADMIN_ONLY), recipeController.create);

// Static paths before /:id, or they are read as an id.
router.put('/seasons',           auth, requireRole(...ADMIN_ONLY), recipeController.seasons);
router.put('/own-order-centres', auth, requireRole(...ADMIN_ONLY), recipeController.ownOrderCentres);

router.put('/:id',    auth, requireRole(...ADMIN_ONLY), validateIntId, recipeController.update);
router.delete('/:id', auth, requireRole(...ADMIN_ONLY), validateIntId, recipeController.remove);

export default router;

// ─────────────────────────────────────────────────────────────
// server/src/routes/kitchen.routes.js
//
// Soup kitchens and Dignity Kitchens (migration 068), mounted at
// /api/kitchens in server/index.js. Managers and admins, like the rest
// of the beneficiary list.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import kitchenController from '../controllers/kitchen.controller.js';

const router = express.Router();

router.get('/',     auth, requireRole(...MANAGERS_UP), kitchenController.listKitchens);
router.post('/',    auth, requireRole(...MANAGERS_UP), kitchenController.createKitchen);
router.patch('/:id', auth, requireRole(...MANAGERS_UP), validateIntId, kitchenController.updateKitchen);

export default router;

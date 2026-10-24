// ─────────────────────────────────────────────────────────────
// server/src/routes/warehouseMap.routes.js
//
// The warehouse map. An admin draws the plan; a manager reads it on
// Inventory and counts stock into its areas. The floor has no screen
// for it and no route here.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ONLY, MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import mapController from '../controllers/warehouseMap.controller.js';

const router = express.Router();

// The layout builder reads the same plan, so admins read it too.
router.get('/', auth, requireRole(...MANAGERS_UP), mapController.getMap);
router.put('/layout', auth, requireRole(...ADMIN_ONLY), mapController.saveLayout);
// Gated like a stock adjustment, which a count leads to.
router.post('/areas/:id/counts', auth, requireRole(...MANAGERS_UP), validateIntId, mapController.recordCount);

export default router;

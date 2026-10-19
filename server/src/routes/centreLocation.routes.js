// ─────────────────────────────────────────────────────────────
// server/src/routes/centreLocation.routes.js
//
// Where each beneficiary centre is. Admin only: the admin sets the
// pins, the manager reads them on the Impact map.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ONLY } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import controller from '../controllers/impactMap.controller.js';

const router = express.Router();

router.get('/', auth, requireRole(...ADMIN_ONLY), controller.listLocations);
router.patch('/:id', auth, requireRole(...ADMIN_ONLY), validateIntId, controller.setLocation);

export default router;

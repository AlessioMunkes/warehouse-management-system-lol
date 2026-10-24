// ─────────────────────────────────────────────────────────────
// server/src/routes/centreLocation.routes.js
//
// Where each beneficiary centre is, for the Impact map. A manager sets
// it while editing a centre on Beneficiaries, so it is gated like the
// beneficiary writes (beneficiary.routes.js): managers and admins.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import controller from '../controllers/impactMap.controller.js';

const router = express.Router();

router.get('/', auth, requireRole(...MANAGERS_UP), controller.listLocations);
router.patch('/:id', auth, requireRole(...MANAGERS_UP), validateIntId, controller.setLocation);

export default router;

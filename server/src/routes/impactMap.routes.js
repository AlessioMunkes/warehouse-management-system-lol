// ─────────────────────────────────────────────────────────────
// server/src/routes/impactMap.routes.js
//
// The Impact map: centres, their pins and what reached them. Gated like
// the rest of reporting (reporting.routes.js): managers and admins.
// The screen itself is the manager's; an admin sets the pins on Centre
// locations (centreLocation.routes.js).
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { MANAGERS_UP } from '../constants/permissions.js';
import controller from '../controllers/impactMap.controller.js';

const router = express.Router();

router.get('/', auth, requireRole(...MANAGERS_UP), controller.getImpactMap);

export default router;

import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import decantingController          from '../controllers/decanting.controller.js';

const router = express.Router();

const ALL_ROLES    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE];
const RECEIVERS_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

// ── Static paths before /:id to prevent shadowing ────────────
router.post('/calculate', auth, requireRole(...ALL_ROLES),    decantingController.calculatePlan);
router.get('/report',     auth, requireRole(...ALL_ROLES),    decantingController.getWeeklyReport);
//router.get('/products',   auth, requireRole(...ALL_ROLES),    decantingController.getDecantableProducts);

// ── Collection ────────────────────────────────────────────────
router.get('/',  auth, requireRole(...ALL_ROLES),             decantingController.getRecords);
router.post('/', auth, requireRole(...RECEIVERS_UP),          decantingController.recordDecanting);

// ── Single record ─────────────────────────────────────────────
router.get('/:id', auth, requireRole(...ALL_ROLES), validateIntId, decantingController.getById);

// ── Export ────────────────────────────────────────────────────
router.get('/:id/export', auth, requireRole(...ALL_ROLES), validateIntId, decantingController.exportSheet);

export default router;

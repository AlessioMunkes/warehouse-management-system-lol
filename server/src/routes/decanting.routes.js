import express                      from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF } from '../constants/permissions.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import decantingController          from '../controllers/decanting.controller.js';

const router = express.Router();


// ── Static paths before /:id to prevent shadowing ────────────
router.post('/calculate', auth, requireRole(...ALL_STAFF),    decantingController.calculatePlan);
router.get('/report',     auth, requireRole(...ALL_STAFF),    decantingController.getWeeklyReport);

// ── Collection ────────────────────────────────────────────────
router.get('/',  auth, requireRole(...ALL_STAFF),             decantingController.getRecords);
router.post('/', auth, requireRole(...ALL_STAFF),          decantingController.recordDecanting);

// ── Single record ─────────────────────────────────────────────
router.get('/:id', auth, requireRole(...ALL_STAFF), validateIntId, decantingController.getById);

// ── Export ────────────────────────────────────────────────────
router.get('/:id/export', auth, requireRole(...ALL_STAFF), validateIntId, decantingController.exportSheet);

export default router;

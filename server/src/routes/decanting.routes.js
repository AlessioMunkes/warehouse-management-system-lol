import express                      from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, WORKERS_ONLY } from '../constants/permissions.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import { idempotent }               from '../middleware/idempotency.middleware.js';
import decantingController          from '../controllers/decanting.controller.js';

const router = express.Router();


// ── Static paths before /:id to prevent shadowing ────────────
router.post('/calculate', auth, requireRole(...WORKERS_ONLY), decantingController.calculatePlan);
router.get('/report',     auth, requireRole(...ALL_STAFF),    decantingController.getWeeklyReport);

// ── Collection ────────────────────────────────────────────────
router.get('/',  auth, requireRole(...ALL_STAFF),             decantingController.getRecords);
// idempotent(): a sheet cannot be un-recorded, so a repeat of one
// sent from a phone that had no signal must not record it twice.
router.post('/', auth, requireRole(...WORKERS_ONLY), idempotent('decanting'), decantingController.recordDecanting);

// ── Single record ─────────────────────────────────────────────
router.get('/:id', auth, requireRole(...ALL_STAFF), validateIntId, decantingController.getById);

// ── Export ────────────────────────────────────────────────────
router.get('/:id/export', auth, requireRole(...ALL_STAFF), validateIntId, decantingController.exportSheet);

export default router;

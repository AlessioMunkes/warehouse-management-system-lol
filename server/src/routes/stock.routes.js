// ─────────────────────────────────────────────────────────────
// server/src/routes/stock.routes.js
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import stockController              from '../controllers/stock.controller.js';

const router = express.Router();

const ALL_ROLES  = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN]; // manual adjustments only

// ── Collection ────────────────────────────────────────────────
router.get('/', auth, requireRole(...ALL_ROLES), stockController.getManifest);

// ── Static paths before /:id to prevent shadowing ────────────
router.post('/adjust', auth, requireRole(...MANAGERS_UP), stockController.adjustManually);

// ── Single product ────────────────────────────────────────────
router.get('/:id/history', auth, requireRole(...ALL_ROLES), validateIntId, stockController.getMovements);

export default router;

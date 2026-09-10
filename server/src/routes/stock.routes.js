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

// ── Ledger (manager/admin) ────────────────────────────────────
// The two /ledger/... paths are declared before /ledger itself for
// the same reason this whole block sits above /:id — Express matches
// in declaration order, and a bare /ledger route declared first would
// not shadow them, but keeping the specific-before-general habit is
// what stops the next route from being the one that breaks.
//
// Manager/admin only. The per-product drawer at /:id/history stays
// open to all roles: a packer checking why the rice count moved is a
// reasonable thing to do, whereas the warehouse-wide ledger is a
// supervisory view.
router.get('/ledger/reconciliation', auth, requireRole(...MANAGERS_UP), stockController.getReconciliation);
router.get('/ledger/actors',         auth, requireRole(...MANAGERS_UP), stockController.getLedgerActors);
router.get('/ledger',                auth, requireRole(...MANAGERS_UP), stockController.getLedger);

// ── Single product ────────────────────────────────────────────
router.get('/:id/history', auth, requireRole(...ALL_ROLES), validateIntId, stockController.getMovements);

export default router;

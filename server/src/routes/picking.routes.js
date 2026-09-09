// ─────────────────────────────────────────────────────────────
// server/src/routes/picking.routes.js
// ─────────────────────────────────────────────────────────────
import express                            from 'express';
import auth, { requireRole, ROLES }       from '../middleware/auth.middleware.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import pickingController                  from '../controllers/picking.controller.js';

const router = express.Router();

const ALL_ROLES    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const PACKERS_UP    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN]; // actually claim/pack/complete slips
const MANAGERS_UP   = [ROLES.MANAGER, ROLES.ADMIN];               // generate/create slips

// ── Static paths before /:id to prevent shadowing ────────────
// generateSlips is also re-checked for manager role inside the service
// (picking.service.js), but it's gated here too, matching decanting's
// pattern, so a non-manager gets a clean 403 before the request ever
// reaches the service/DB.
router.post('/generate', auth, requireRole(...MANAGERS_UP), pickingController.generateSlips);
router.get('/workers',   auth, requireRole(...MANAGERS_UP), pickingController.getAssignableWorkers);

// ── Collection ────────────────────────────────────────────────
router.get('/',  auth, requireRole(...ALL_ROLES),    pickingController.getSlips);
router.post('/', auth, requireRole(...MANAGERS_UP),  pickingController.createSlip); // ad-hoc slip, manager only — same reasoning as /generate above

// ── Single slip ───────────────────────────────────────────────
router.get('/:id',           auth, requireRole(...ALL_ROLES),  validateIntId, pickingController.getSlipById);
router.post('/:id/assign',   auth, requireRole(...PACKERS_UP), validateIntId, pickingController.assignSlip);
router.post('/:id/complete', auth, requireRole(...PACKERS_UP), validateIntId, pickingController.completeSlip);

// ── Slip items ────────────────────────────────────────────────
// Both params are validated. :itemId used to be left unchecked, so a
// non-numeric item id travelled all the way to Postgres and came back
// as a 500; validateIntParam('itemId') stops it at the door with a 400.
router.post('/:id/items/:itemId/confirm',
  auth, requireRole(...PACKERS_UP),
  validateIntId, validateIntParam('itemId'),
  pickingController.confirmItem
);
router.post('/:id/items/:itemId/flag',
  auth, requireRole(...PACKERS_UP),
  validateIntId, validateIntParam('itemId'),
  pickingController.flagItem
);

export default router;
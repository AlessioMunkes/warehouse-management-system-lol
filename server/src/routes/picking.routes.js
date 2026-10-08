// ─────────────────────────────────────────────────────────────
// server/src/routes/picking.routes.js
// ─────────────────────────────────────────────────────────────
import express                            from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP, WORKERS_ONLY } from '../constants/permissions.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import pickingController                  from '../controllers/picking.controller.js';

const router = express.Router();


// ── Static paths before /:id to prevent shadowing ────────────
// generateSlips is also re-checked for manager role inside the service
// (picking.service.js), but it's gated here too, matching decanting's
// pattern, so a non-manager gets a clean 403 before the request ever
// reaches the service/DB.
router.post('/generate', auth, requireRole(...MANAGERS_UP), pickingController.generateSlips);
router.get('/workers',   auth, requireRole(...MANAGERS_UP), pickingController.getAssignableWorkers);

// ── Collection ────────────────────────────────────────────────
router.get('/',  auth, requireRole(...ALL_STAFF),    pickingController.getSlips);
router.post('/', auth, requireRole(...MANAGERS_UP),  pickingController.createSlip); // "Create a new slip", manager only — same reasoning as /generate above

// ── Single slip ───────────────────────────────────────────────
router.get('/:id',           auth, requireRole(...ALL_STAFF),  validateIntId, pickingController.getSlipById);
// Manager only, and only while the slip is still pending (enforced in
// the service/repository) — dispatch date, cohort, and/or the whole
// product-line list. See PickingSlipManagementPage.jsx.
router.patch('/:id',         auth, requireRole(...MANAGERS_UP), validateIntId, pickingController.editSlip);
router.post('/:id/assign',   auth, requireRole(...ALL_STAFF), validateIntId, pickingController.assignSlip);
// Manager-only, enforced in the service (matches the pattern of
// packerId in /assign being manager-effective only) — the route
// itself stays ALL_STAFF so a non-manager gets the service's own
// 403 message rather than a generic route-level one.
router.post('/:id/assign-second', auth, requireRole(...ALL_STAFF), validateIntId, pickingController.addSecondPacker);
// A manager releases any claimed pallet; a packer only their own, and
// only before packing anything on it (enforced in the service and the
// repository).
router.post('/:id/release',  auth, requireRole(...ALL_STAFF), validateIntId, pickingController.releaseSlip);
router.post('/:id/complete', auth, requireRole(...WORKERS_ONLY), validateIntId, pickingController.completeSlip);

// ── Slip items ────────────────────────────────────────────────
// Both params are validated. :itemId used to be left unchecked, so a
// non-numeric item id travelled all the way to Postgres and came back
// as a 500; validateIntParam('itemId') stops it at the door with a 400.
router.post('/:id/items/:itemId/confirm',
  auth, requireRole(...WORKERS_ONLY),
  validateIntId, validateIntParam('itemId'),
  pickingController.confirmItem
);
router.post('/:id/items/:itemId/flag',
  auth, requireRole(...WORKERS_ONLY),
  validateIntId, validateIntParam('itemId'),
  pickingController.flagItem
);

export default router;
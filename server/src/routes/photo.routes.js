// ─────────────────────────────────────────────────────────────
// server/src/routes/photo.routes.js
//
// Photos taken on the floor, mounted at /api/photos.
//
// ROLES
// Taking one is the floor's (WORKERS_ONLY), like the packing and
// receiving actions it goes with. Looking is open to all staff: the
// manager reads them on the picking slip and the purchase order.
//
// idempotent(): a photo taken with no signal is sent later, possibly
// twice (middleware/idempotency.middleware.js).
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, WORKERS_ONLY } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import { idempotent } from '../middleware/idempotency.middleware.js';
import photoController from '../controllers/photo.controller.js';

const router = express.Router();

router.get('/', auth, requireRole(...ALL_STAFF), photoController.listPhotos);
router.post('/', auth, requireRole(...WORKERS_ONLY), idempotent('photo'), photoController.addPhoto);
router.get('/:id/image', auth, requireRole(...ALL_STAFF), validateIntId, photoController.getImage);

export default router;

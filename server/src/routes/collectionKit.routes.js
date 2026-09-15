// ─────────────────────────────────────────────────────────────
// server/src/routes/collectionKit.routes.js
//
// Feed the Soil kit logging, mounted at /api/collection-kits in
// server/index.js.
//
// ROLES — warehouse staff and up, same as communityRequest.routes.js:
// this is an operational log a warehouse worker fills in when a
// bucket physically goes out or comes back, not management-only data.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import kitController from '../controllers/collectionKit.controller.js';

const router = express.Router();

const STAFF_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

router.get ('/',            auth, requireRole(...STAFF_UP), kitController.listKits);
router.post('/',            auth, requireRole(...STAFF_UP), kitController.logKitOut);
router.patch('/:id/return', auth, requireRole(...STAFF_UP), kitController.markReturned);

export default router;

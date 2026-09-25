// ─────────────────────────────────────────────────────────────
// server/src/routes/collectionKit.routes.js
//
// Feed the Soil kit tracking, mounted at /api/collection-kits in
// server/index.js.
//
// ROLES — warehouse staff and up, same as communityRequest.routes.js:
// assigning a kit, logging compost and marking a record dispatched are
// all operational actions a warehouse worker performs, not
// management-only data.
//
// /records IS DECLARED BEFORE /:id.
// The same trap documented at the top of supplier.routes.js: a literal
// path and a /:id route with the same segment count race in
// declaration order, and /:id (via validateIntId) would 400 on
// "records" before the real handler ever ran if it came first.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import kitController from '../controllers/collectionKit.controller.js';

const router = express.Router();

const STAFF_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

router.get('/records',
  auth, requireRole(...STAFF_UP), kitController.listRecords);

router.get('/records/:recordId',
  auth, requireRole(...STAFF_UP), validateIntParam('recordId'), kitController.getRecord);

router.patch('/records/:recordId/dispatch',
  auth, requireRole(...STAFF_UP), validateIntParam('recordId'), kitController.markDispatched);

router.get('/',
  auth, requireRole(...STAFF_UP), kitController.listKits);

router.post('/',
  auth, requireRole(...STAFF_UP), kitController.createKit);

router.get('/:id',
  auth, requireRole(...STAFF_UP), validateIntId, kitController.getKit);

router.post('/:id/records',
  auth, requireRole(...STAFF_UP), validateIntId, kitController.logCompost);

export default router;

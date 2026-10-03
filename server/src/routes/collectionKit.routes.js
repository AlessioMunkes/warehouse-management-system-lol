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
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF } from '../constants/permissions.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import kitController from '../controllers/collectionKit.controller.js';

const router = express.Router();


router.get('/records',
  auth, requireRole(...ALL_STAFF), kitController.listRecords);

router.get('/records/:recordId',
  auth, requireRole(...ALL_STAFF), validateIntParam('recordId'), kitController.getRecord);

router.patch('/records/:recordId/dispatch',
  auth, requireRole(...ALL_STAFF), validateIntParam('recordId'), kitController.markDispatched);

router.get('/',
  auth, requireRole(...ALL_STAFF), kitController.listKits);

router.post('/',
  auth, requireRole(...ALL_STAFF), kitController.createKit);

router.get('/:id',
  auth, requireRole(...ALL_STAFF), validateIntId, kitController.getKit);

router.post('/:id/records',
  auth, requireRole(...ALL_STAFF), validateIntId, kitController.logCompost);

export default router;

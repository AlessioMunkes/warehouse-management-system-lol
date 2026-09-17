// ─────────────────────────────────────────────────────────────
// server/src/routes/communityRequest.routes.js
//
// ADM-5.0 "Log Benevolent Package Request" (BR-28) HTTP surface,
// mounted at /api/community-requests in server/index.js.
//
// Flow per route: auth → requireRole(...) → controller → service.
//
// ROLES — BR-01 precondition is "authenticated as Warehouse Staff or
// higher": warehouse_worker, manager and admin. requireRole is a
// strict allowlist with no admin bypass, so every role is listed.
// Reads and writes share the set — this is an operational log any
// staff member both records into and works, not management data.
//
// IDs are integers (the live community_requests.id sequence), but no
// validateIntId middleware is applied — the service does presence
// (400) and existence (404) checks, matching the love-activism slice.
// Static paths are declared before the /:id routes.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import communityRequestController from '../controllers/communityRequest.controller.js';

const router = express.Router();

const STAFF_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

router.get('/',  auth, requireRole(...STAFF_UP), communityRequestController.listRequests);
router.post('/', auth, requireRole(...STAFF_UP), communityRequestController.createRequest);

router.get('/:id',           auth, requireRole(...STAFF_UP), communityRequestController.getRequest);
router.patch('/:id/claim',   auth, requireRole(...STAFF_UP), communityRequestController.claimRequest);
router.patch('/:id/resolve', auth, requireRole(...STAFF_UP), communityRequestController.resolveRequest);

export default router;

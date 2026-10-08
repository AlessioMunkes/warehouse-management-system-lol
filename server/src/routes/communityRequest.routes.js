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
// Logging, reading and claiming are open to every staff role — this is an operational log any
// staff member records into and works. Approving, declining, assigning and choosing items are manager or admin.
//
// IDs are integers (the live community_requests.id sequence), but no
// validateIntId middleware is applied — the service does presence
// (400) and existence (404) checks, matching the love-activism slice.
// Static paths are declared before the /:id routes.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import { idempotent } from '../middleware/idempotency.middleware.js';
import communityRequestController from '../controllers/communityRequest.controller.js';

const router = express.Router();


router.get('/',  auth, requireRole(...ALL_STAFF), communityRequestController.listRequests);
// idempotent() on the two the floor can send late, after a spell with
// no signal (middleware/idempotency.middleware.js).
router.post('/', auth, requireRole(...ALL_STAFF), idempotent('communityRequest.log'), communityRequestController.createRequest);

router.get('/:id',           auth, requireRole(...ALL_STAFF), communityRequestController.getRequest);
router.patch('/:id/claim',   auth, requireRole(...ALL_STAFF), communityRequestController.claimRequest);
// Who may do what is checked again in the service; this is the outer door.
// Approving, declining, assigning and re-choosing items are manager or
// admin. Confirming is open to staff here because the claimer or the
// assigned packer may confirm; the service refuses anyone else.
router.post('/:id/approve',  auth, requireRole(...MANAGERS_UP), validateIntId, communityRequestController.approveRequest);
router.post('/:id/decline',  auth, requireRole(...MANAGERS_UP), validateIntId, communityRequestController.declineRequest);
router.patch('/:id/assign',  auth, requireRole(...MANAGERS_UP), validateIntId, communityRequestController.assignRequest);
router.put('/:id/items',     auth, requireRole(...MANAGERS_UP), validateIntId, communityRequestController.rechooseItems);
router.post('/:id/confirm',  auth, requireRole(...ALL_STAFF), validateIntId, idempotent('communityRequest.confirm'), communityRequestController.confirmRequest);

// The old resolve call. Narrowed to "decline" for managers and admins;
// a request can no longer be fulfilled without being approved first.
router.patch('/:id/resolve', auth, requireRole(...MANAGERS_UP), communityRequestController.resolveRequest);

export default router;

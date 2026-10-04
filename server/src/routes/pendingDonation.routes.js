import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP, WORKERS_ONLY } from '../constants/permissions.js';
import { validateIntParam } from '../middleware/validate.middleware.js';
import pendingDonationController from '../controllers/pendingDonation.controller.js';

const router = express.Router();


router.post(
  '/pending',
  auth,
  requireRole(...WORKERS_ONLY),
  pendingDonationController.createPendingDonation
);

router.post(
  '/pending/flags/:flagId/resolve',
  auth,
  requireRole(...MANAGERS_UP),
  validateIntParam('flagId'),
  pendingDonationController.resolvePendingDonationFlag
);

// The Classification queue is run by managers and admins alike, so its
// lists and the retry that clears a failed save are theirs together.
router.get(
  '/pending',
  auth,
  requireRole(...MANAGERS_UP),
  pendingDonationController.listPendingDonations
);

router.get(
  '/pending/reconciliation',
  auth,
  requireRole(...MANAGERS_UP),
  pendingDonationController.listReconciliationQueue
);

router.post(
  '/pending/:pendingDonationId/retry-commit',
  auth,
  requireRole(...MANAGERS_UP),
  validateIntParam('pendingDonationId'),
  pendingDonationController.retryPendingDonationCommit
);

router.get(
  '/pending/:id',
  auth,
  requireRole(...ALL_STAFF),
  validateIntParam('id'),
  pendingDonationController.getPendingDonationById
);

export default router;

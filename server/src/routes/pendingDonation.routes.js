import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntParam } from '../middleware/validate.middleware.js';
import pendingDonationController from '../controllers/pendingDonation.controller.js';

const router = express.Router();

const ALL_ROLES = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const RECEIVERS_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];
const ADMIN_ONLY = [ROLES.ADMIN];

router.post(
  '/pending',
  auth,
  requireRole(...RECEIVERS_UP),
  pendingDonationController.createPendingDonation
);

router.post(
  '/pending/flags/:flagId/resolve',
  auth,
  // Admin-only, matching the Donation Management page gate (D5) and
  // retry-commit below. MANAGERS_UP here was an oversight, not a design:
  // no manager-facing UI ever called this endpoint (the page has always
  // been admin-gated), and the old Unrecognized Item Review Queue page
  // that used the manager-permitted PUT .../finalize path has been retired.
  requireRole(...ADMIN_ONLY),
  validateIntParam('flagId'),
  pendingDonationController.resolvePendingDonationFlag
);

router.get(
  '/pending',
  auth,
  requireRole(...ADMIN_ONLY),
  pendingDonationController.listPendingDonations
);

router.get(
  '/pending/reconciliation',
  auth,
  requireRole(...ADMIN_ONLY),
  pendingDonationController.listReconciliationQueue
);

router.post(
  '/pending/:pendingDonationId/retry-commit',
  auth,
  requireRole(...ADMIN_ONLY),
  validateIntParam('pendingDonationId'),
  pendingDonationController.retryPendingDonationCommit
);

router.get(
  '/pending/:id',
  auth,
  requireRole(...ALL_ROLES),
  validateIntParam('id'),
  pendingDonationController.getPendingDonationById
);

export default router;

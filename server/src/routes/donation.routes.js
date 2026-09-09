// ─────────────────────────────────────────────────────────────
// server/src/routes/donation.routes.js
// ─────────────────────────────────────────────────────────────
import express                            from 'express';
import auth, { requireRole, ROLES }       from '../middleware/auth.middleware.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import donationController                 from '../controllers/donation.controller.js';

const router = express.Router();

const ALL_ROLES    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const RECEIVERS_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN]; // record donations at the gate
const MANAGERS_UP  = [ROLES.MANAGER, ROLES.ADMIN];               // resolve unmatched lines / reclassify — both can move stock

// ── Static paths before /:id to prevent shadowing ────────────
router.get('/unmatched',   auth, requireRole(...MANAGERS_UP), donationController.listUnmatchedItems);
router.get('/section-18a', auth, requireRole(...MANAGERS_UP), donationController.listSection18AQueue);

// ── Unmatched-item resolution ────────────────────────────────
// Also a static prefix ahead of /:id — /items/:itemId/resolve would
// otherwise be swallowed by /:id if declared after it.
router.patch('/items/:itemId/resolve',
  auth, requireRole(...MANAGERS_UP),
  validateIntParam('itemId'),
  donationController.resolveUnmatchedItem
);

// ── Collection ────────────────────────────────────────────────
router.get('/',  auth, requireRole(...ALL_ROLES),    donationController.listDonations);
router.post('/', auth, requireRole(...RECEIVERS_UP), donationController.createDonation);

// ── Single donation ───────────────────────────────────────────
router.get('/:id',        auth, requireRole(...ALL_ROLES), validateIntId, donationController.getDonationById);
router.get('/:id/events', auth, requireRole(...ALL_ROLES), validateIntId, donationController.getDonationEvents);

router.patch('/:id/classification',
  auth, requireRole(...MANAGERS_UP),
  validateIntId,
  donationController.reclassifyDonation
);

export default router;

// ─────────────────────────────────────────────────────────────
// server/src/routes/donation.routes.js
// ─────────────────────────────────────────────────────────────
import express                            from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP, WORKERS_ONLY } from '../constants/permissions.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import donationController                 from '../controllers/donation.controller.js';

const router = express.Router();


// ── Static paths before /:id to prevent shadowing ────────────
router.get('/section-18a/form/:token', donationController.getSection18AForm);
router.post('/section-18a/form/:token', donationController.submitSection18AForm);
router.get('/unmatched',   auth, requireRole(...MANAGERS_UP), donationController.listUnmatchedItems);
router.get('/section-18a', auth, requireRole(...MANAGERS_UP), donationController.listSection18AQueue);
router.get('/section-18a/emails', auth, requireRole(...MANAGERS_UP), donationController.listEmailHistory);
router.post('/section-18a/emails/:emailId/resend',
  auth, requireRole(...MANAGERS_UP),
  validateIntParam('emailId'),
  donationController.resendDonationEmail
);

// ── Unmatched-item resolution ────────────────────────────────
// Also a static prefix ahead of /:id — /items/:itemId/resolve would
// otherwise be swallowed by /:id if declared after it.
router.patch('/items/:itemId/resolve',
  auth, requireRole(...MANAGERS_UP),
  validateIntParam('itemId'),
  donationController.resolveUnmatchedItem
);

// ── Collection ────────────────────────────────────────────────
router.get('/',  auth, requireRole(...ALL_STAFF),    donationController.listDonations);
router.post('/', auth, requireRole(...WORKERS_ONLY), donationController.createDonation);

// ── Single donation ───────────────────────────────────────────
router.get('/:id',        auth, requireRole(...ALL_STAFF), validateIntId, donationController.getDonationById);
router.get('/:id/events', auth, requireRole(...ALL_STAFF), validateIntId, donationController.getDonationEvents);
router.get('/:id/section-18a/certificate',
  auth, requireRole(...MANAGERS_UP),
  validateIntId,
  donationController.downloadSection18ACertificate
);
router.post('/:id/section-18a/certificate',
  auth, requireRole(...MANAGERS_UP),
  validateIntId,
  donationController.generateSection18ACertificate
);

router.patch('/:id/classification',
  auth, requireRole(...MANAGERS_UP),
  validateIntId,
  donationController.reclassifyDonation
);

export default router;

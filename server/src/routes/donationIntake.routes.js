// ─────────────────────────────────────────────────────────────
// server/src/routes/donationIntake.routes.js
// Hardened to 10/10 Production Security Standard with Conversational Comments
//
// NOTE: this is the standalone intake controller path
// (donationIntake.controller.js / donationIntake.service.js), used by
// the integration test suite. If your real donation form posts to a
// different existing route (e.g. one already defined in
// donation.routes.js), don't double-mount this — confirm which path
// is the live one before wiring both into the app, since two routers
// both listening on the same effective path is a silent source of
// "which handler actually ran" bugs.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP } from '../constants/permissions.js';
import donationIntakeController from '../controllers/donation.intake.controller.js';

const router = express.Router();

// One group, MANAGERS_UP from constants/permissions.js, used at the
// route level here AND inside the controller's own check, rather than
// the strings typed twice. Belt-and-suspenders: even if someone mounts this
// router without auth/requireRole by mistake, the controller's internal
// check still catches it. Neither layer is trusted alone.

// Intake reads are open to every intake role — workers staff the intake
// desk too, and the product search is a read-only lookup feeding the
// "Match to stock item" combobox on the intake form.

// GET because it is a pure lookup — no rows are created or changed, so
// the search must never sit behind POST semantics.
router.get(
  '/intake/products/search',
  auth,
  requireRole(...ALL_STAFF),
  donationIntakeController.searchProducts
);

// POST because intake is a create — a new donation record and its
// downstream effects (stock upsert or manager flag) get created, never
// updated or replaced. The controller derives receivedByUserId from
// req.user.id (set by the auth middleware from the verified JWT) and
// explicitly ignores any operator/user id in the request body, so this
// endpoint can't be used to attribute a donation to someone else's
// account even by a legitimate admin/manager caller.
router.post(
  '/intake',
  auth,
  requireRole(...MANAGERS_UP),
  donationIntakeController.handleDonationIntake
);

router.post(
  '/intake/unrecognized',
  auth,
  requireRole(...MANAGERS_UP),
  donationIntakeController.handleUnrecognizedDonationIntake
);

export default router;
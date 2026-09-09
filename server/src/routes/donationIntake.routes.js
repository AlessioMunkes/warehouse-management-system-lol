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
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import donationIntakeController from '../controllers/donation.intake.controller.js';

const router = express.Router();

// Same source-of-truth pattern as donationAdmin.routes.js — one array,
// reused at the route level here AND inside the controller's own
// allowedRoles check, both importing from ROLES rather than typing the
// strings twice. Belt-and-suspenders: even if someone mounts this
// router without auth/requireRole by mistake, the controller's internal
// check still catches it. Neither layer is trusted alone.
const ADMIN_OR_MANAGER = [ROLES.ADMIN, ROLES.MANAGER];

// Intake reads are open to every intake role — workers staff the intake
// desk too, and the product search is a read-only lookup feeding the
// "Match to stock item" combobox on the intake form.
const INTAKE_READERS = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

// GET because it is a pure lookup — no rows are created or changed, so
// the search must never sit behind POST semantics.
router.get(
  '/intake/products/search',
  auth,
  requireRole(...INTAKE_READERS),
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
  requireRole(...ADMIN_OR_MANAGER),
  donationIntakeController.handleDonationIntake
);

router.post(
  '/intake/unrecognized',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationIntakeController.handleUnrecognizedDonationIntake
);

export default router;
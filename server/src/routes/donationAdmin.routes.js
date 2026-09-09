// ─────────────────────────────────────────────────────────────
// server/src/routes/donationAdmin.routes.js
// Hardened to 10/10 Production Security Standard with Conversational Comments
//
// Admin/manager-only routes for BR-10 category routing rules and
// per-product donation classification. Mounted separately from
// donationIntake.routes.js since this is configuration surface,
// not the donation intake path itself — keeping them apart means
// a bug in one route file can't accidentally expose the other's
// endpoints under the same prefix.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import donationAdminController from '../controllers/donation.admin.js';

const router = express.Router();

// Single source of truth for who's allowed on this router. Defined once
// here instead of repeating [ROLES.ADMIN, ROLES.MANAGER] on every line —
// that repetition is exactly how the earlier 'warehouse_manager' typo
// bug happened (one line got hand-edited, the others didn't, and they
// silently drifted out of sync). One array, reused everywhere below,
// means there's only one place to get it wrong.
const ADMIN_OR_MANAGER = [ROLES.ADMIN, ROLES.MANAGER];

// ── Category-level routing rules (BR-10) ────────────────────
// These affect every product in a category at once, so they're the
// more sensitive of the two config surfaces — a bad edit here has
// blast radius across the whole catalog, not just one product.

// GET is read-only, so it carries less inherent risk, but we still gate
// it behind auth + role. Category routing (storage areas, outcomes) is
// internal operational config, not something to expose to any logged-in
// user — only admins/managers should even be able to view it.
router.get(
  '/category-routing',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationAdminController.getCategoryRoutings
);

// PATCH, not PUT — this updates a subset of fields on an existing rule
// (routingOutcome / storageArea / description) rather than replacing
// the whole resource. The controller/service layer already whitelists
// which categories are valid, so we don't duplicate that validation
// here at the route level — it stays in one place (the service).
router.patch(
  '/category-routing/:category',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationAdminController.updateCategoryRouting
);

// ── Per-product classification (BR-04 accountability) ───────
// Lower blast radius than the category rules above (one product per
// call), but still audit-relevant — every write here is stamped with
// req.user.id server-side in the controller, never trusted from the
// request body, so there's no way to attribute a change to someone
// else's account.

router.get(
  '/products-with-defaults',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationAdminController.getProductsWithDefaults
);

router.get(
  '/pending-classifications',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationAdminController.getPendingClassifications
);

router.put(
  '/pending-classifications/:id/finalize',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationAdminController.finalizePendingClassification
);

// PUT because this is a full set/replace of "this product's category is
// X" — semantically an upsert, which is exactly what the repository
// layer does underneath (ON CONFLICT ... DO UPDATE), so the HTTP verb
// matches the actual database operation instead of just picking PUT
// out of habit.
router.put(
  '/products/:id/classification',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationAdminController.setProductClassification
);

// DELETE removes the preset entirely — the product falls back to manual
// category selection at intake time. No request body needed or read
// here, so there's nothing client-supplied to validate beyond the :id
// param, which the controller/service already parses and rejects if
// it's not a positive integer.
router.delete(
  '/products/:id/classification',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationAdminController.removeProductClassification
);

// ── Routing preview / dry-run ────────────────────────────────
// POST because it's not idempotent-by-convention in the REST sense
// (it's a computation, not a resource fetch), even though it has no
// side effects — this is purely a "what would happen if" check for
// admins to sanity-test rules before relying on them at real intake
// time. All input validation happens in the controller (positive
// integer productId, whitelisted category) — the route stays thin.
router.post(
  '/evaluate-routing',
  auth,
  requireRole(...ADMIN_OR_MANAGER),
  donationAdminController.evaluateRouting
);

export default router;
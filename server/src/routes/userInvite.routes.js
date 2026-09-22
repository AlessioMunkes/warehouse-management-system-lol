// ─────────────────────────────────────────────────────────────
// server/src/routes/userInvite.routes.js
//
// Admin-gated invite management, plus the two public routes an
// invitee reaches with no session at all — modelled on slip.routes.js
// as the one existing unauthenticated, token-resolved public route in
// this codebase, with one deliberate difference: accept is a WRITE
// that creates a credential-bearing users row, which no existing
// public-token route does (they only read or claim an already-
// existing record). See userInvite.service.js for the validation that
// makes that safe — role is taken from the invite, never the body.
//
// ROUTE ORDER: '/:id/resend' and '/:id/revoke' vs '/:token' and
// '/:token/accept' don't actually collide (different literal suffix,
// same as donation.routes.js's /:id vs /section-18a/form/:token), but
// validateIntId on the :id routes means a token-shaped string routed
// there fails fast with a clear 400 rather than a confusing lookup
// miss.
// ─────────────────────────────────────────────────────────────
import express                              from 'express';
import auth, { requireRole, ROLES }         from '../middleware/auth.middleware.js';
import { validateIntId }                    from '../middleware/validate.middleware.js';
import { publicInviteRateLimiter }          from '../middleware/rateLimiter.middleware.js';
import userInviteController                 from '../controllers/userInvite.controller.js';

const router = express.Router();

const ADMIN_ONLY = [ROLES.ADMIN];

// ── Admin: manage invites ────────────────────────────────────
router.post('/',
  auth, requireRole(...ADMIN_ONLY), userInviteController.create);

router.get('/',
  auth, requireRole(...ADMIN_ONLY), userInviteController.listPending);

router.post('/:id/resend',
  auth, requireRole(...ADMIN_ONLY), validateIntId, userInviteController.resend);

router.post('/:id/revoke',
  auth, requireRole(...ADMIN_ONLY), validateIntId, userInviteController.revoke);

// ── Public: the invitee has no session yet ───────────────────
router.get('/:token', publicInviteRateLimiter, userInviteController.resolve);
router.post('/:token/accept', publicInviteRateLimiter, userInviteController.accept);

export default router;

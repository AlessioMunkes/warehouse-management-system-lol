// ─────────────────────────────────────────────────────────────
// server/src/routes/slip.routes.js
//
// BR-22: every picking slip has a stable URL a volunteer can open from
// a QR code or a printed short code, without the full login flow.
//
// ROUTE ORDER MATTERS HERE. '/available' and '/code/:code' are declared
// before '/:token', because '/available' is a single path segment and
// would otherwise be swallowed by ':token' and looked up as a uuid.
// Same static-before-param rule picking.routes.js sets out.
//
// Guests reach ONLY this router. They are absent from every requireRole
// list on /api/picking, and the two guest-write routes below resolve the
// slip from the token rather than from anything the client sends.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole, ROLES, optionalGuest } from '../middleware/auth.middleware.js';
import { validateIntId, validateIntParam } from '../middleware/validate.middleware.js';
import { publicSlipRateLimiter }           from '../middleware/rateLimiter.middleware.js';
import slipAccessController                from '../controllers/slipAccess.controller.js';

const router = express.Router();

// ── Guest session required ────────────────────────────────────
// Declared first so '/available' and '/mine' are matched before the
// public ':token' pattern can claim them.

// 1.4 — today's unclaimed pallets, for the volunteer who arrived with
// no QR code at all. Entry path 3, and the accessible one.
router.get('/available', auth, requireRole(ROLES.GUEST), slipAccessController.listAvailable);

// Entry path 3's claim: a signed-in guest picking a pallet off the list
// above. Declared under a static 'claim/' prefix so a numeric id can
// never be mistaken for a token by the public ':token' pattern.
router.post('/claim/:id',
  auth, requireRole(ROLES.GUEST), validateIntId,
  slipAccessController.claimById);

// 1.5 — the guest's own slip, resolved from their token. There is no
// slip id in this URL on purpose: a guest cannot name a pallet, so
// there is nothing to tamper with.
router.get('/mine', auth, requireRole(ROLES.GUEST), slipAccessController.getMySlip);

// ── Public — no session, by necessity ─────────────────────────
// 1.2 — short code, declared before ':token' (two segments vs one, so
// they cannot actually collide, but the order documents the intent).
router.get('/code/:code', publicSlipRateLimiter, slipAccessController.getPreviewByShortCode);

// 1.3 — claim by short code or by token. Creates the volunteer, mints
// the guest session, binds the slip.
router.post('/code/:code/claim', publicSlipRateLimiter, optionalGuest, slipAccessController.claim);

// 1.1 — the preview a stranger holding a poster may see.
router.get('/:token', publicSlipRateLimiter, slipAccessController.getPreviewByToken);
router.post('/:token/claim', publicSlipRateLimiter, optionalGuest, slipAccessController.claim);

// ── Guest writes ──────────────────────────────────────────────
// The slip id IS in these URLs, because an item belongs to a slip and
// the request has to say which. Ownership is checked twice: in the
// service before the call, and again inside the repository's row lock,
// which is the check that actually guards the write.
router.post('/:id/items/:itemId/confirm',
  auth, requireRole(ROLES.GUEST),
  validateIntId, validateIntParam('itemId'),
  slipAccessController.confirmItem);

router.post('/:id/items/:itemId/flag',
  auth, requireRole(ROLES.GUEST),
  validateIntId, validateIntParam('itemId'),
  slipAccessController.flagItem);

router.post('/:id/complete',
  auth, requireRole(ROLES.GUEST),
  validateIntId,
  slipAccessController.completeSlip);

export default router;

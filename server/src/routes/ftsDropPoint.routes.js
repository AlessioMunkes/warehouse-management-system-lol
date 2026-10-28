// ─────────────────────────────────────────────────────────────
// server/src/routes/ftsDropPoint.routes.js
//
// Feed the Soil drop-off sites (migration 069), mounted at /api/fts.
//
//   /drop               the public form behind the general poster: the
//                       open sites for its dropdown, and a drop-off at
//                       one of them or at a place typed (migration 070).
//   /drop/:token        the public form behind a site's QR code: no
//                       account, rate limited. The token is the site's
//                       unguessable public_token.
//   /drop-points        the sites, for managers and admins (they set
//                       them up and print the QR posters).
//   /dropoffs           what was logged at them, to check and reject.
//
// The static paths come before /:id ones, as everywhere else.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import { publicFtsDropoffRateLimiter, publicSlipRateLimiter } from '../middleware/rateLimiter.middleware.js';
import controller from '../controllers/ftsDropPoint.controller.js';

const router = express.Router();

router.get('/drop',         publicSlipRateLimiter, controller.getPublicSites);
router.post('/drop',        publicFtsDropoffRateLimiter, controller.submitAnyDropoff);
router.get('/drop/:token',  publicSlipRateLimiter, controller.getPublicSite);
router.post('/drop/:token', publicFtsDropoffRateLimiter, controller.submitDropoff);

router.get('/drop-points',        auth, requireRole(...MANAGERS_UP), controller.listDropPoints);
router.post('/drop-points',       auth, requireRole(...MANAGERS_UP), controller.createDropPoint);
router.patch('/drop-points/:id',  auth, requireRole(...MANAGERS_UP), validateIntId, controller.updateDropPoint);
router.get('/dropoffs',           auth, requireRole(...MANAGERS_UP), controller.listDropoffs);
router.patch('/dropoffs/:id',     auth, requireRole(...MANAGERS_UP), validateIntId, controller.setDropoffStatus);

export default router;

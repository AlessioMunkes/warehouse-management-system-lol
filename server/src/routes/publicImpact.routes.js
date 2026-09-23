// ─────────────────────────────────────────────────────────────
// server/src/routes/publicImpact.routes.js
//
// Deliberately no `auth` import at all — see publicImpact.service.js
// for why this is its own tiny router rather than a route added to
// reporting.routes.js. Every route in this file must stay
// unauthenticated by design; if a route that needs auth is ever
// added here, it belongs in a different file instead.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import publicImpactController from '../controllers/publicImpact.controller.js';

const router = express.Router();

// No req.user to key on here (unauthenticated), unlike
// reporting.routes.js's own askLimiter — IP is the only identity
// available. No custom keyGenerator, matching
// rateLimiter.middleware.js's own loginRateLimiter (the other
// unauthenticated, IP-keyed limiter in this app): express-rate-limit's
// own default keyGenerator already handles IP (including IPv6)
// correctly on its own. An explicit `keyGenerator: ipKeyGenerator`
// here threw on every request instead — ipKeyGenerator is a helper
// for building a CUSTOM keyGenerator around, such as askLimiter's own
// `req.user?.id ? ... : ipKeyGenerator(req, res)`, not a drop-in
// keyGenerator by itself. The service caches for 5 minutes regardless,
// so this limit exists for abuse, not normal traffic.
const summaryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

router.get('/impact-summary', summaryLimiter, publicImpactController.getSummary);

export default router;

// ─────────────────────────────────────────────────────────────
// server/src/routes/assistant.routes.js
//
// OPEN TO EVERY SIGNED-IN STAFF ROLE, deliberately — unlike
// reporting, which is manager and admin only.
//
// The people this feature exists for are the ones with the least
// access. R3 (staff resistance to a digital workflow) and R13
// (older and disabled volunteers excluded) are both about warehouse
// staff, and a help agent gated to managers would mitigate neither.
// The warehouse worker is the primary user here.
//
// Guests are the one exception. A guest is a volunteer signed in
// with a first name for one event; they see a single screen, and
// there is nothing for an assistant to guide them through. Letting
// an unauthenticated-ish session spend the shared AI quota is also
// the obvious abuse path.
//
// The role still scopes the answer: buildTools() is given the
// asker's role and an admin-only topic is never in a worker's enum,
// so a worker cannot be told how to edit master data even by asking
// directly for it.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import assistantController          from '../controllers/assistant.controller.js';

const router = express.Router();

const STAFF_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

// Only /ask is limited — it is the one route that costs money per
// call and draws on a shared free-tier quota.
//
// Forty an hour, double reporting's twenty. Reporting is a manager
// asking a handful of considered questions; help is someone stuck
// mid-task who will rephrase three times in a minute, and hitting a
// limit at that moment is precisely the experience this feature
// exists to prevent. Still far below anything that burns the quota.
const askLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  // Per user, not per IP: the warehouse is behind one connection, so
  // an IP key would make one person's questions count against
  // everyone else's. auth runs first, so req.user is always set.
  //
  // ipKeyGenerator is required for the IP fallback — express-rate-limit
  // v8 throws at MODULE LOAD if a custom keyGenerator touches req.ip
  // without it, because raw IPv6 lets a user rotate through a /64.
  keyGenerator: (req, res) =>
    req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req, res),

  message: {
    success: false,
    message: 'You have asked me a lot in the last hour. Have a look at the suggested topics, or ask someone on the floor.',
  },
});

router.get ('/catalog',   auth, requireRole(...STAFF_UP), assistantController.getCatalog);
router.get ('/topic/:id', auth, requireRole(...STAFF_UP), assistantController.getTopic);
router.post('/ask',       auth, requireRole(...STAFF_UP), askLimiter, assistantController.ask);

export default router;

// ─────────────────────────────────────────────────────────────
// server/src/routes/reporting.routes.js
//
// Manager and admin only. There is no worker view of reporting:
// aggregate figures across all beneficiaries are management
// information, and the task pages already give workers what they
// need for their own job.
//
// The role list is MANAGER/ADMIN with no FINANCE. That role was
// dropped — users.role accepts only warehouse_worker, manager and
// admin, so a finance user cannot exist.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import reportingController          from '../controllers/reporting.controller.js';

const router = express.Router();

const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];

// Only /ask is limited. It is the one route that costs money per
// call and draws on a shared free-tier quota, so one person holding
// down enter must not exhaust the day's allowance for everyone.
// Twenty an hour is far above real use — a manager asks a handful of
// questions a day — and far below anything that would burn quota.
const askLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  // 'draft-8' matches rateLimiter.middleware.js, so both limiters
  // send the same header format.
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  // Per user, not per IP: the warehouse is behind one connection, so
  // an IP key would make one manager's questions count against
  // another's. auth runs first, so req.user is always set here.
  //
  // ipKeyGenerator is required for the IP fallback — express-rate-limit
  // v8 throws at MODULE LOAD if a custom keyGenerator touches req.ip
  // without it, because raw IPv6 addresses let a user rotate through
  // a /64 and bypass the limit entirely.
  keyGenerator: (req, res) =>
    req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req, res),

  message: {
    success: false,
    message: 'You have asked a lot of questions in the last hour. Use the report builder below, or try again shortly.',
  },
});

router.get ('/catalog', auth, requireRole(...MANAGERS_UP), reportingController.getCatalog);
router.post('/report',  auth, requireRole(...MANAGERS_UP), reportingController.runReport);
router.post('/ask',     auth, requireRole(...MANAGERS_UP), askLimiter, reportingController.ask);

export default router;

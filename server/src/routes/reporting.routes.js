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

// The written report is the other call that reaches the model. Only
// requests asking for it count; the figures, charts and lists are
// plain SQL and stay unlimited like /report.
const writeUpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req, res) =>
    req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req, res),
  skip: (req) => req.body?.narrate !== true,
  message: {
    success: false,
    message: 'You have written a lot of reports in the last hour. The figures and lists still work; try the write-up again shortly.',
  },
});

router.get ('/catalog', auth, requireRole(...MANAGERS_UP), reportingController.getCatalog);
router.post('/report',  auth, requireRole(...MANAGERS_UP), reportingController.runReport);
router.post('/ask',     auth, requireRole(...MANAGERS_UP), askLimiter, reportingController.ask);
router.post('/insight', auth, requireRole(...MANAGERS_UP), writeUpLimiter, reportingController.insight);
router.get ('/comparisons', auth, requireRole(...MANAGERS_UP), reportingController.getComparisons);
router.post('/comparison',  auth, requireRole(...MANAGERS_UP), reportingController.runComparison);
// Personal chart targets: each manager's own, keyed by req.user.id,
// so one manager moving a line never moves it for another.
router.get ('/targets',           auth, requireRole(...MANAGERS_UP), reportingController.getTargets);
router.put ('/targets/:metricId', auth, requireRole(...MANAGERS_UP), reportingController.setTarget);

router.put('/factors/:factorKey',         auth, requireRole(...MANAGERS_UP), reportingController.setFactor);
router.get('/factors/:factorKey/history', auth, requireRole(...MANAGERS_UP), reportingController.getFactorHistory);

export default router;

// ─────────────────────────────────────────────────────────────
// server/src/routes/reporting.routes.js
//
// Manager and admin only. There is no worker view of reporting:
// aggregate figures across all beneficiaries are management
// information, and the task pages already give workers what they
// need for their own job.
//
// Note the role list is MANAGER/ADMIN with no FINANCE. The finance
// role was dropped — users.role only accepts warehouse_worker,
// manager and admin, so a finance user cannot exist.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import reportingController          from '../controllers/reporting.controller.js';

const router = express.Router();

const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];

router.get('/catalog', auth, requireRole(...MANAGERS_UP), reportingController.getCatalog);
router.post('/report', auth, requireRole(...MANAGERS_UP), reportingController.runReport);

export default router;

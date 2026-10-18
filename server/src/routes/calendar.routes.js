// ─────────────────────────────────────────────────────────────
// server/src/routes/calendar.routes.js
//
// The operating calendar (features/calendar): cohort collection days
// and closed days. Managers and admins: it is the office's to keep.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import calendarController from '../controllers/calendar.controller.js';

const router = express.Router();

router.get('/',                  auth, requireRole(...MANAGERS_UP), calendarController.get);
router.put('/cohorts',           auth, requireRole(...MANAGERS_UP), calendarController.setCohortDays);
router.post('/closures',         auth, requireRole(...MANAGERS_UP), calendarController.addClosure);
router.delete('/closures/:id',   auth, requireRole(...MANAGERS_UP), validateIntId, calendarController.removeClosure);
router.post('/public-holidays',  auth, requireRole(...MANAGERS_UP), calendarController.addPublicHolidays);

export default router;

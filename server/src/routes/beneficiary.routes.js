// ─────────────────────────────────────────────────────────────
// server/src/routes/beneficiary.routes.js
//
// ROLES
// Reads are open to warehouse staff — picking/dispatch flows already
// read ecd_centres for their own screens, so this list endpoint is no
// new exposure. Writes (create/edit/status/approve) are manager and
// admin only — a bad or wrongly-approved centre is the one thing
// picking.service.js trusts without re-checking, since createSlip and
// generateSlips both gate purely on is_active/approved_at.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import beneficiaryController        from '../controllers/beneficiary.controller.js';

const router = express.Router();


router.get('/',
  auth, requireRole(...ALL_STAFF), beneficiaryController.list);

router.post('/',
  auth, requireRole(...MANAGERS_UP), beneficiaryController.register);

router.get('/:id',
  auth, requireRole(...ALL_STAFF), validateIntId, beneficiaryController.getOne);

router.patch('/:id',
  auth, requireRole(...MANAGERS_UP), validateIntId, beneficiaryController.update);

router.patch('/:id/status',
  auth, requireRole(...MANAGERS_UP), validateIntId, beneficiaryController.setStatus);

router.patch('/:id/approve',
  auth, requireRole(...MANAGERS_UP), validateIntId, beneficiaryController.approve);

router.patch('/:id/rollback-cohort',
  auth, requireRole(...MANAGERS_UP), validateIntId, beneficiaryController.rollbackCohort);

export default router;

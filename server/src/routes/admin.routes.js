// ─────────────────────────────────────────────────────────────
// server/src/routes/admin.routes.js
//
// Admin-only oversight screens: the user activity log and the archive
// of deactivated / deleted items. Read-only — restoring an item goes
// through that item's own /:id/status route, with its own rules.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import controller from '../controllers/adminActivity.controller.js';

const router = express.Router();

router.get('/activity', auth, requireRole(ROLES.ADMIN), controller.activity);
router.get('/archive',  auth, requireRole(ROLES.ADMIN), controller.archive);

export default router;

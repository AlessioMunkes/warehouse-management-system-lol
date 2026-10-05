// ─────────────────────────────────────────────────────────────
// server/src/routes/admin.routes.js
//
// Admin-only oversight screens: the user activity log and the archive
// of deactivated / deleted items. Read-only — restoring an item goes
// through that item's own /:id/status route, with its own rules.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ONLY } from '../constants/permissions.js';
import controller from '../controllers/adminActivity.controller.js';

const router = express.Router();

router.get('/activity', auth, requireRole(...ADMIN_ONLY), controller.activity);
router.get('/archive',  auth, requireRole(...ADMIN_ONLY), controller.archive);

export default router;

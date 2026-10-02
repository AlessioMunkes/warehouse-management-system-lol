// ─────────────────────────────────────────────────────────────
// server/src/routes/settings.routes.js
//
// The values an admin can change from the Settings screen
// (features/settings). Admin only: they change how the whole warehouse
// runs — when pallets are written off, when reminders go out, when
// expiry warnings fire, how long an invite lasts.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ONLY } from '../constants/permissions.js';
import settingsController from '../features/settings/settings.controller.js';

const router = express.Router();

router.get('/',   auth, requireRole(...ADMIN_ONLY), settingsController.list);
router.patch('/', auth, requireRole(...ADMIN_ONLY), settingsController.update);

export default router;

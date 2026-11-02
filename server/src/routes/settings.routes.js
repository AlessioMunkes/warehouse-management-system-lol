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
import { ADMIN_ONLY, ALL_STAFF } from '../constants/permissions.js';
import settingsController from '../controllers/settings.controller.js';
import settings from '../services/settings.service.js';

const router = express.Router();

router.get('/',   auth, requireRole(...ADMIN_ONLY), settingsController.list);
router.patch('/', auth, requireRole(...ADMIN_ONLY), settingsController.update);
// The letterhead printed on delivery and dispatch notes, for anyone who
// prints one (Settings > Documents). Never fails: defaults if unread.
router.get('/letterhead', auth, requireRole(...ALL_STAFF), async (_req, res) => {
  const all = await settings.getAll();
  const addressLines = String(all['documents.letterheadAddress'])
    .split('\n').map((line) => line.trim()).filter(Boolean);
  res.json({ success: true, data: { name: all['documents.letterheadName'], addressLines } });
});
// Settings → Connections: the health of each outside service.
router.get('/connections', auth, requireRole(...ADMIN_ONLY), settingsController.connections);

export default router;

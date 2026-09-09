// ─────────────────────────────────────────────────────────────
// server/src/routes/dashboard.routes.js
//
// Manager and admin only, same gate as reporting.routes.js — the
// dashboard summary is management information (open POs across all
// suppliers, low stock across the whole catalog), not something a
// worker's own task view needs.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import dashboardController          from '../controllers/dashboard.controller.js';

const router = express.Router();

const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];

router.get('/summary', auth, requireRole(...MANAGERS_UP), dashboardController.getSummary);

export default router;

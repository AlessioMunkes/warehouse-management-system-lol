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
// Every warehouse role, including the worker whose dashboard it feeds.
// It exposes three counts about today's work and nothing about the
// catalog or supplier spend, which is why it is not behind MANAGERS_UP.
const ALL_STAFF = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

router.get('/summary', auth, requireRole(...MANAGERS_UP), dashboardController.getSummary);
router.get('/my-work', auth, requireRole(...ALL_STAFF),   dashboardController.getMyWork);

export default router;

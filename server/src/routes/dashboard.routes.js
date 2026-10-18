// ─────────────────────────────────────────────────────────────
// server/src/routes/dashboard.routes.js
//
// Manager and admin only, same gate as reporting.routes.js — the
// dashboard summary is management information (open POs across all
// suppliers, low stock across the whole catalog), not something a
// worker's own task view needs.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF, MANAGERS_UP, MANAGER_ONLY } from '../constants/permissions.js';
import dashboardController          from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/summary', auth, requireRole(...MANAGERS_UP), dashboardController.getSummary);
// Every warehouse role, including the worker whose dashboard it feeds.
// It exposes three counts about today's work and nothing about the
// catalog or supplier spend, which is why it is not behind MANAGERS_UP.
router.get('/my-work', auth, requireRole(...ALL_STAFF),   dashboardController.getMyWork);
router.get('/attention', auth, requireRole(...MANAGERS_UP), dashboardController.getAttention);
// The manager's board only: an admin's has no widget that reads it.
router.get('/insights', auth, requireRole(...MANAGER_ONLY), dashboardController.getInsights);

export default router;

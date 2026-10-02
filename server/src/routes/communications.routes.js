// ─────────────────────────────────────────────────────────────
// server/src/routes/communications.routes.js
//
// The message history: every email the system has sent, newest first,
// filterable by type and outcome (features/communications).
//
// Admin only. The history carries donor, finance and account emails
// side by side — the same people who own those screens own this one.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ONLY } from '../constants/permissions.js';
import communicationsController from '../features/communications/communications.controller.js';

const router = express.Router();

router.get('/messages', auth, requireRole(...ADMIN_ONLY), communicationsController.listMessages);

export default router;

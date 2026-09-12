// ─────────────────────────────────────────────────────────────
// server/src/routes/certificateSettings.routes.js
//
// Routes for certificate settings API.
// Single-row singleton configuration for Section 18A certificates.
//
// Endpoints:
//   GET    /api/certificate-settings        - Get current settings
//   POST   /api/certificate-settings        - Create initial settings (admin/manager only)
//   PUT    /api/certificate-settings        - Update existing settings (admin/manager only)
//   DELETE /api/certificate-settings        - Delete settings (admin only, for testing)
//
// Authentication is required for all endpoints.
// Write operations require admin or manager role.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import certificateSettingsController from '../controllers/certificateSettings.controller.js';
//import { auth, requireRole, ROLES } from '../middleware/auth.middleware.js';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
const router = express.Router();

// All routes require authentication
router.use(auth);

// ── GET /api/certificate-settings ──────────────────────────────
// Returns the current certificate settings.
// Any authenticated user can read settings.
router.get(
  '/',
  certificateSettingsController.getSettings
);

// ── POST /api/certificate-settings ─────────────────────────────
// Creates the initial certificate settings record.
// Returns 409 if settings already exist (singleton enforcement).
// Requires admin or manager role.
router.post(
  '/',
  requireRole(ROLES.ADMIN, ROLES.MANAGER),
  certificateSettingsController.createSettings
);

// ── PUT /api/certificate-settings ──────────────────────────────
// Updates the existing certificate settings record.
// Returns 404 if settings do not exist (must create first).
// Requires admin or manager role.
router.put(
  '/',
  requireRole(ROLES.ADMIN, ROLES.MANAGER),
  certificateSettingsController.updateSettings
);

// ── DELETE /api/certificate-settings ───────────────────────────
// Deletes the certificate settings record.
// Requires admin role only.
// Primarily for testing/reset purposes.
router.delete(
  '/',
  requireRole(ROLES.ADMIN),
  certificateSettingsController.deleteSettings
);

export default router;
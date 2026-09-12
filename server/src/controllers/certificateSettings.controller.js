// ─────────────────────────────────────────────────────────────
// server/src/controllers/certificateSettings.controller.js
//
// HTTP controller for certificate settings endpoints.
// Thin layer that extracts request data, calls the service,
// and shapes the response.
//
// All business logic and validation lives in certificateSettings.service.js.
// ─────────────────────────────────────────────────────────────
import certificateSettingsService from '../services/certificateSettings.service.js';
//import { auth, requireRole, ROLES } from '../middleware/auth.middleware.js';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
// Admin and manager roles can modify certificate settings.
const ADMIN_OR_MANAGER = [ROLES.ADMIN, ROLES.MANAGER];

// ── getSettings ────────────────────────────────────────────────
// GET /api/certificate-settings
// Returns the current certificate settings.
// Requires authentication.
const getSettings = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const settings = await certificateSettingsService.getSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    console.error('[getSettings]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve certificate settings.',
    });
  }
};

// ── createSettings ─────────────────────────────────────────────
// POST /api/certificate-settings
// Creates the initial certificate settings record.
// Requires admin or manager role.
// Returns 409 if settings already exist (singleton enforcement).
const createSettings = async (req, res) => {
  try {
    // Ensure user is authenticated and has required role
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!ADMIN_OR_MANAGER.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${ADMIN_OR_MANAGER.join(' or ')}.`,
      });
    }

    const settings = await certificateSettingsService.createSettings(req.body);
    res.status(201).json({ success: true, data: settings });
  } catch (err) {
    console.error('[createSettings]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to create certificate settings.',
    });
  }
};

// ── updateSettings ─────────────────────────────────────────────
// PUT /api/certificate-settings
// Updates the existing certificate settings record.
// Requires admin or manager role.
// Returns 404 if settings do not exist (must create first).
const updateSettings = async (req, res) => {
  try {
    // Ensure user is authenticated and has required role
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!ADMIN_OR_MANAGER.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${ADMIN_OR_MANAGER.join(' or ')}.`,
      });
    }

    const settings = await certificateSettingsService.updateSettings(req.body);
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    console.error('[updateSettings]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to update certificate settings.',
    });
  }
};

// ── deleteSettings ─────────────────────────────────────────────
// DELETE /api/certificate-settings
// Deletes the certificate settings record.
// Requires admin role only.
// Primarily for testing/reset purposes.
const deleteSettings = async (req, res) => {
  try {
    // Ensure user is authenticated and has admin role
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${ROLES.ADMIN}.`,
      });
    }

    const result = await certificateSettingsService.deleteSettings();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[deleteSettings]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to delete certificate settings.',
    });
  }
};

export default {
  getSettings,
  createSettings,
  updateSettings,
  deleteSettings,
};
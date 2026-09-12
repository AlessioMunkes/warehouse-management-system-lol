// -------------------------------------------------------------
// server/src/routes/gmail.routes.js
//
// Gmail OAuth connection routes.
// -------------------------------------------------------------
import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import gmailController from '../controllers/gmail.controller.js';

console.log('[gmail.routes] Loading Gmail routes');

const router = express.Router();

const GMAIL_CONNECT_ROLES = [ROLES.ADMIN];

// Initiated by an authenticated admin user.
router.get('/connect', auth, requireRole(...GMAIL_CONNECT_ROLES), gmailController.connect);

// Callback is reached by Google's redirect and cannot require JWT auth.
router.get('/callback', gmailController.callback);

// Connection status for the authenticated admin.
router.get('/status', auth, requireRole(...GMAIL_CONNECT_ROLES), gmailController.status);

// Disconnect Gmail OAuth connection.
router.post('/disconnect', auth, requireRole(...GMAIL_CONNECT_ROLES), gmailController.disconnect);

// Development test email endpoint.
// Protected, admin-only. Sends a test email to verify Gmail integration.
router.post('/test-email', auth, requireRole(...GMAIL_CONNECT_ROLES), gmailController.testEmail);

// Update the sender display name for the connected Gmail account.
router.post('/save-display-name', auth, requireRole(...GMAIL_CONNECT_ROLES), gmailController.saveDisplayName);

console.log('[gmail.routes] Gmail routes loaded:', router.stack.map(s => s.route?.path));

export default router;

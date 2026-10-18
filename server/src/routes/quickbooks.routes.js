// ─────────────────────────────────────────────────────────────
// server/src/routes/quickbooks.routes.js
//
// Mounted at /api/quickbooks.
//
// Connecting and disconnecting the company is an admin's job, like the
// Gmail connection. Seeing whether it is connected, and sending an
// order across, is a manager's: they are the ones raising the orders.
// The callback has no role check because Intuit calls it with no
// session; the state it carries is what proves the flow started here.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ADMIN_ONLY, MANAGERS_UP } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import quickbooksController from '../controllers/quickbooks.controller.js';

const router = express.Router();

router.get('/connect',     auth, requireRole(...ADMIN_ONLY),  quickbooksController.connect);
router.get('/callback',    quickbooksController.callback);
router.get('/status',      auth, requireRole(...MANAGERS_UP), quickbooksController.status);
router.post('/disconnect', auth, requireRole(...ADMIN_ONLY),  quickbooksController.disconnect);

router.get('/purchase-orders/:id',       auth, requireRole(...MANAGERS_UP), validateIntId, quickbooksController.purchaseOrderState);
router.post('/purchase-orders/:id/send', auth, requireRole(...MANAGERS_UP), validateIntId, quickbooksController.sendPurchaseOrder);

export default router;

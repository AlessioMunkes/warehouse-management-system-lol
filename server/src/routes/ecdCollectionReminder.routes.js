import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import controller from '../controllers/ecdCollectionReminder.controller.js';

const router = express.Router();

const STAFF_ROLES = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

router.get('/whatsapp/tomorrow', auth, requireRole(...STAFF_ROLES), controller.listTomorrowWhatsApp);
router.patch('/whatsapp/:id/sent', auth, requireRole(...STAFF_ROLES), validateIntId, controller.markWhatsAppSent);

export default router;

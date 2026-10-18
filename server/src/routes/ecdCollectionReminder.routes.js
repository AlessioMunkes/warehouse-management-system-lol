import express from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF } from '../constants/permissions.js';
import { validateIntId } from '../middleware/validate.middleware.js';
import controller from '../controllers/ecdCollectionReminder.controller.js';

const router = express.Router();


router.get('/whatsapp/tomorrow', auth, requireRole(...ALL_STAFF), controller.listTomorrowWhatsApp);
router.patch('/whatsapp/:id/sent', auth, requireRole(...ALL_STAFF), validateIntId, controller.markWhatsAppSent);

export default router;

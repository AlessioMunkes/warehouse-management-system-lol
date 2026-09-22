// ─────────────────────────────────────────────────────────────
// server/src/routes/notification.routes.js
//
// Manager and admin only, same gate as reporting/dashboard — every
// current trigger (picking slip generation, BR-14's non-collection
// sweep, a PO returned/follow-up-required) is management information,
// not something a worker's own task view needs.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import notificationController       from '../controllers/notification.controller.js';

const router = express.Router();

const STAFF_ROLES = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

router.get('/',              auth, requireRole(...STAFF_ROLES), notificationController.list);
router.get('/unread-count',  auth, requireRole(...STAFF_ROLES), notificationController.unreadCount);
router.post('/read-all',     auth, requireRole(...STAFF_ROLES), notificationController.markAllRead);
router.patch('/:id/read',    auth, requireRole(...STAFF_ROLES), validateIntId, notificationController.markRead);

export default router;

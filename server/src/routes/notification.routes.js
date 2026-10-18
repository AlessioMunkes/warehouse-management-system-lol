// ─────────────────────────────────────────────────────────────
// server/src/routes/notification.routes.js
//
// Two audiences sharing one feed, split by route rather than by role
// on a single endpoint — a worker asking "what's new for me" should
// never get a manager's PO/BR-14 noise back, and a manager's view
// shouldn't have to filter a worker's picking-slip chatter out either.
//
// The main routes (manager and admin only, same gate as
// reporting/dashboard) see everything: every current trigger there
// (picking slip generation, BR-14's non-collection sweep, a PO
// returned/follow-up-required) is management information. The /floor
// routes are open to any authenticated staff member and are narrowed
// server-side (notification.service.js's FLOOR_TYPES) to just the
// "new work on the floor" events — see StaffNotificationBell.jsx.
// ─────────────────────────────────────────────────────────────
import express                      from 'express';
import auth, { requireRole } from '../middleware/auth.middleware.js';
import { ALL_STAFF } from '../constants/permissions.js';
import { validateIntId }            from '../middleware/validate.middleware.js';
import notificationController       from '../controllers/notification.controller.js';

const router = express.Router();


router.get('/',              auth, requireRole(...ALL_STAFF), notificationController.list);
router.get('/unread-count',  auth, requireRole(...ALL_STAFF), notificationController.unreadCount);
router.post('/read-all',     auth, requireRole(...ALL_STAFF), notificationController.markAllRead);
router.patch('/:id/read',    auth, requireRole(...ALL_STAFF), validateIntId, notificationController.markRead);

router.get('/floor',              auth, notificationController.listFloor);
router.get('/floor/unread-count', auth, notificationController.floorUnreadCount);
router.post('/floor/read-all',    auth, notificationController.markAllFloorRead);
// Reuses the same markRead as the manager route — it only ever
// touches this user's own read state on an id it already fetched, so
// there's no manager-only logic to duplicate here.
router.patch('/floor/:id/read',   auth, validateIntId, notificationController.markRead);

export default router;

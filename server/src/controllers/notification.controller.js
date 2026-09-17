// ─────────────────────────────────────────────────────────────
// server/src/controllers/notification.controller.js
// ─────────────────────────────────────────────────────────────
import notificationService from '../services/notification.service.js';

const respondError = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status < 500 ? err.message : fallback,
  });
};

// ── GET /api/notifications?unreadOnly= ──────────────────────────
const list = async (req, res) => {
  try {
    const data = await notificationService.listNotifications(req.user, {
      unreadOnly: req.query.unreadOnly,
    });
    res.status(200).json({ success: true, data });
  } catch (err) {
    respondError(res, err, 'listNotifications', 'Failed to retrieve notifications.');
  }
};

// ── GET /api/notifications/unread-count ─────────────────────────
const unreadCount = async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user);
    res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    respondError(res, err, 'getUnreadCount', 'Failed to retrieve the unread count.');
  }
};

// ── PATCH /api/notifications/:id/read ───────────────────────────
const markRead = async (req, res) => {
  try {
    await notificationService.markRead(req.user, req.params.id);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    respondError(res, err, 'markRead', 'Failed to mark the notification read.');
  }
};

// ── POST /api/notifications/read-all ────────────────────────────
const markAllRead = async (req, res) => {
  try {
    await notificationService.markAllRead(req.user);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    respondError(res, err, 'markAllRead', 'Failed to mark notifications read.');
  }
};

export default { list, unreadCount, markRead, markAllRead };

// ─────────────────────────────────────────────────────────────
// server/src/services/notification.service.js
//
// Thin — reads take a user id from the session, not the URL, so
// there is no cross-user ID to validate; a user can only ever see
// their own read state on a shared notification feed.
// ─────────────────────────────────────────────────────────────
import repo from '../repositories/notification.repository.js';
import { isPositiveInt } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const listNotifications = async (user, { unreadOnly } = {}) =>
  repo.listForUser(user.id, user.role, { unreadOnly: unreadOnly === true || unreadOnly === 'true' });

const getUnreadCount = async (user) => repo.getUnreadCount(user.id, user.role);

const markRead = async (user, rawId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid notification ID is required.');
  await repo.markRead(Number(rawId), user.id, user.role);
};

const markAllRead = async (user) => repo.markAllRead(user.id, user.role);

export default { listNotifications, getUnreadCount, markRead, markAllRead };

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
  repo.listForUser(user.id, { unreadOnly: unreadOnly === true || unreadOnly === 'true' });

const getUnreadCount = async (user) => repo.getUnreadCount(user.id);

const markRead = async (user, rawId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid notification ID is required.');
  await repo.markRead(Number(rawId), user.id);
};

const markAllRead = async (user) => repo.markAllRead(user.id);

// ── Floor (worker-facing) ────────────────────────────────────
// Same feed, narrowed to the types a worker's own task view cares
// about — a picking slip run or an ad-hoc slip becoming available is
// "new work on the floor"; BR-14's non-collection sweep and a PO's
// return status are management information a worker never asked for.
// markRead above is reused as-is for a floor notification too — it
// only ever touches this user's own read state on a known id, so it
// doesn't matter which bell called it.
const FLOOR_TYPES = ['picking_slips_generated', 'picking_slip_created'];

const listFloorNotifications = async (user, { unreadOnly } = {}) =>
  repo.listForUser(user.id, {
    unreadOnly: unreadOnly === true || unreadOnly === 'true',
    types: FLOOR_TYPES,
  });

const getFloorUnreadCount = async (user) => repo.getUnreadCount(user.id, { types: FLOOR_TYPES });

const markAllFloorRead = async (user) => repo.markAllRead(user.id, { types: FLOOR_TYPES });

export default {
  listNotifications, getUnreadCount, markRead, markAllRead,
  listFloorNotifications, getFloorUnreadCount, markAllFloorRead,
};

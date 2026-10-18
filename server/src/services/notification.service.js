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

// A page of the feed, newest first. The bell takes the first 50; the
// notifications page asks for more with limit and offset.
const MAX_PAGE = 200;
const pageOf = ({ limit, offset } = {}) => {
  const l = limit === undefined || limit === '' ? 50 : Number(limit);
  const o = offset === undefined || offset === '' ? 0 : Number(offset);
  if (!Number.isInteger(l) || l < 1 || l > MAX_PAGE) throw fail(400, `Limit must be a whole number from 1 to ${MAX_PAGE}.`);
  if (!Number.isInteger(o) || o < 0) throw fail(400, 'Offset must be a whole number, 0 or more.');
  return { limit: l, offset: o };
};

const listNotifications = async (user, { unreadOnly, limit, offset } = {}) =>
  repo.listForUser(user.id, user.role, {
    unreadOnly: unreadOnly === true || unreadOnly === 'true',
    ...pageOf({ limit, offset }),
  });

const getUnreadCount = async (user) => repo.getUnreadCount(user.id, user.role);

const markRead = async (user, rawId) => {
  if (!isPositiveInt(rawId)) throw fail(400, 'A valid notification ID is required.');
  await repo.markRead(Number(rawId), user.id, user.role);
};

const markAllRead = async (user) => repo.markAllRead(user.id, user.role);

// ── Floor (worker-facing) ────────────────────────────────────
// Same feed, narrowed to the types a worker's own task view cares
// about — a picking slip run or an ad-hoc slip becoming available is
// "new work on the floor"; BR-14's non-collection sweep and a PO's
// return status are management information a worker never asked for.
// markRead above is reused as-is for a floor notification too — it
// only ever touches this user's own read state on a known id, so it
// doesn't matter which bell called it.
const FLOOR_TYPES = ['picking_slips_generated', 'picking_slip_created', 'picking_slip_released'];

const listFloorNotifications = async (user, { unreadOnly, limit, offset } = {}) =>
  repo.listForUser(user.id, null, {
    unreadOnly: unreadOnly === true || unreadOnly === 'true',
    types: FLOOR_TYPES,
    ...pageOf({ limit, offset }),
  });

const getFloorUnreadCount = async (user) => repo.getUnreadCount(user.id, null, { types: FLOOR_TYPES });

const markAllFloorRead = async (user) => repo.markAllRead(user.id, null, { types: FLOOR_TYPES });

export default {
  listNotifications, getUnreadCount, markRead, markAllRead,
  listFloorNotifications, getFloorUnreadCount, markAllFloorRead,
};

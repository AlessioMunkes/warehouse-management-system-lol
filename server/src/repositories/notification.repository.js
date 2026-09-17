// ─────────────────────────────────────────────────────────────
// server/src/repositories/notification.repository.js
//
// createNotification TAKES THE CALLER'S CLIENT, same rule
// auditLog.repository.js's logAudit enforces and for the same
// reason: a notification written on a different connection to the
// change it announces would survive that change being rolled back,
// and a manager would then get told about a picking slip run or a PO
// return that never actually happened.
//
// NOT PER-USER AT WRITE TIME.
// One notifications row per event, visible to every manager/admin —
// see notification_reads for how per-user read state works without
// duplicating the row itself. Nothing here targets a specific
// person; every trigger site so far (picking slip generation, BR-14's
// non-collection sweep, a PO marked returned/follow-up-required) is
// something every manager should be able to see, not a DM.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

export const createNotification = async (client, {
  type, title, body = null, entityType = null, entityId = null,
}) => {
  if (!client) {
    throw new Error('createNotification requires the caller\'s transaction client.');
  }
  await client.query(
    `INSERT INTO notifications (type, title, body, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [type, title, body, entityType, entityId]
  );
};

// ── Read ──────────────────────────────────────────────────────
// LEFT JOINed against this user's own reads only — another manager's
// read state never affects what this user sees as unread.
const listForUser = async (userId, { limit = 50, unreadOnly = false } = {}) => {
  const { rows } = await pool.query(
    `SELECT n.id, n.type, n.title, n.body, n.entity_type, n.entity_id,
            n.created_at, nr.read_at
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      ${unreadOnly ? 'WHERE nr.read_at IS NULL' : ''}
      ORDER BY n.created_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
};

const getUnreadCount = async (userId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      WHERE nr.read_at IS NULL`,
    [userId]
  );
  return rows[0]?.count ?? 0;
};

// ── Mark read ─────────────────────────────────────────────────
// ON CONFLICT DO NOTHING rather than erroring — marking an
// already-read notification read again is a normal double-tap, not a
// fault.
const markRead = async (notificationId, userId) => {
  await pool.query(
    `INSERT INTO notification_reads (notification_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (notification_id, user_id) DO NOTHING`,
    [notificationId, userId]
  );
};

const markAllRead = async (userId) => {
  await pool.query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT n.id, $1
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      WHERE nr.read_at IS NULL
     ON CONFLICT (notification_id, user_id) DO NOTHING`,
    [userId]
  );
};

export default {
  createNotification,
  listForUser,
  getUnreadCount,
  markRead,
  markAllRead,
};

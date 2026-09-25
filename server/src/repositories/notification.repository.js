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
import { ROLES } from '../middleware/auth.middleware.js';

const MANAGER_ONLY = [ROLES.MANAGER];
const STAFF_ROLES = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const VOLUNTEER_MANAGEMENT_ROLES = [ROLES.MANAGER, ROLES.ADMIN];
const ADMIN_ONLY = [ROLES.ADMIN];

const TARGET_ROLES_BY_TYPE = {
  low_stock: MANAGER_ONLY,
  picking_slips_generated: MANAGER_ONLY,
  non_collections_flagged: MANAGER_ONLY,
  purchase_order_needs_attention: MANAGER_ONLY,
  vms_sync_failed: MANAGER_ONLY,
  stock_expiry_2_weeks: MANAGER_ONLY,
  stock_expiry_1_week: MANAGER_ONLY,
  donation_review: ADMIN_ONLY,
  section18a_handoff_failed: ADMIN_ONLY,
  picking_slip_created: STAFF_ROLES,
  volunteer: VOLUNTEER_MANAGEMENT_ROLES,
  vms: VOLUNTEER_MANAGEMENT_ROLES,
};

const targetRolesForType = (type) => {
  if (TARGET_ROLES_BY_TYPE[type]) return TARGET_ROLES_BY_TYPE[type];
  if (String(type).startsWith('section18a')) return ADMIN_ONLY;
  if (String(type).startsWith('volunteer') || String(type).startsWith('vms')) {
    return VOLUNTEER_MANAGEMENT_ROLES;
  }
  return null;
};

export const createNotification = async (client, {
  type, title, body = null, entityType = null, entityId = null, targetRoles = null, avoidDuplicate = false,
}) => {
  if (!client) {
    throw new Error('createNotification requires the caller\'s transaction client.');
  }
  const roles = targetRoles ?? targetRolesForType(type);
  if (avoidDuplicate) {
    await client.query(
      `INSERT INTO notifications (type, title, body, entity_type, entity_id, target_roles)
       SELECT $1::varchar, $2::varchar, $3::text, $4::varchar, $5::integer, $6::text[]
       WHERE NOT EXISTS (
         SELECT 1
           FROM notifications
          WHERE type = $1::varchar
            AND entity_type IS NOT DISTINCT FROM $4::varchar
            AND entity_id IS NOT DISTINCT FROM $5::integer
       )`,
      [type, title, body, entityType, entityId, roles]
    );
    return;
  }
  await client.query(
    `INSERT INTO notifications (type, title, body, entity_type, entity_id, target_roles)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [type, title, body, entityType, entityId, roles]
  );
};

// ── Read ──────────────────────────────────────────────────────
// LEFT JOINed against this user's own reads only — another manager's
// read state never affects what this user sees as unread.
const listForUser = async (userId, role, { limit = 50, unreadOnly = false } = {}) => {
  const filters = ['n.target_roles IS NOT NULL', '$2 = ANY(n.target_roles)'];
  if (unreadOnly) filters.push('nr.read_at IS NULL');
  const { rows } = await pool.query(
    `SELECT n.id, n.type, n.title, n.body, n.entity_type, n.entity_id,
            n.created_at, nr.read_at
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      WHERE ${filters.join(' AND ')}
      ORDER BY n.created_at DESC
      LIMIT $3`,
    [userId, role, limit]
  );
  return rows;
};

const getUnreadCount = async (userId, role) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      WHERE n.target_roles IS NOT NULL
        AND $2 = ANY(n.target_roles)
        AND nr.read_at IS NULL`,
    [userId, role]
  );
  return rows[0]?.count ?? 0;
};

// ── Mark read ─────────────────────────────────────────────────
// ON CONFLICT DO NOTHING rather than erroring — marking an
// already-read notification read again is a normal double-tap, not a
// fault.
const markRead = async (notificationId, userId, role) => {
  await pool.query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT n.id, $2
       FROM notifications n
      WHERE n.id = $1
        AND n.target_roles IS NOT NULL
        AND $3 = ANY(n.target_roles)
     ON CONFLICT (notification_id, user_id) DO NOTHING`,
    [notificationId, userId, role]
  );
};

const markAllRead = async (userId, role) => {
  await pool.query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT n.id, $1
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      WHERE n.target_roles IS NOT NULL
        AND $2 = ANY(n.target_roles)
        AND nr.read_at IS NULL
     ON CONFLICT (notification_id, user_id) DO NOTHING`,
    [userId, role]
  );
};

export default {
  createNotification,
  listForUser,
  getUnreadCount,
  markRead,
  markAllRead,
};

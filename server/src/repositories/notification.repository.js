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
// One notifications row per event, visible to whichever readers ask
// for its type — see notification_reads for how per-user read state
// works without duplicating the row itself. Nothing here targets a
// specific person; every trigger site so far (picking slip generation,
// BR-14's non-collection sweep, a PO marked returned/follow-up-
// required) is something a whole audience should be able to see, not
// a DM. The `types` filter on the read functions below is what lets
// two different audiences (managers, the floor) share this one feed
// without either seeing the other's noise — see notification.routes.js.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { ROLES } from '../middleware/auth.middleware.js';

const MANAGER_ONLY = [ROLES.MANAGER];
// A new slip is floor work: the worker packs it, the manager runs the
// floor. Admins look after accounts, donations and 18A, not packing.
const FLOOR_AND_MANAGER = [ROLES.WORKER, ROLES.MANAGER];
const VOLUNTEER_MANAGEMENT_ROLES = [ROLES.MANAGER, ROLES.ADMIN];
const ADMIN_ONLY = [ROLES.ADMIN];
// Managers and admins run the Classification queue together.
const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];

const TARGET_ROLES_BY_TYPE = {
  low_stock: MANAGER_ONLY,
  picking_slips_generated: MANAGER_ONLY,
  non_collections_flagged: MANAGER_ONLY,
  purchase_order_needs_attention: MANAGER_ONLY,
  vms_sync_failed: MANAGER_ONLY,
  // The names expiryWarning.service.js sends, and the older ones. Without
  // these the warnings were stored with no recipients, so nobody saw them.
  stock_expiry_warning_2w: MANAGER_ONLY,
  stock_expiry_warning_1w: MANAGER_ONLY,
  stock_expiry_2_weeks: MANAGER_ONLY,
  stock_expiry_1_week: MANAGER_ONLY,
  donation_review: MANAGERS_UP,
  // Managers and admins issue certificates together, so a failed email is both's.
  section18a_handoff_failed: MANAGERS_UP,
  section18a_email_failed: MANAGERS_UP,
  picking_slip_created: FLOOR_AND_MANAGER,
  // A manager released a claimed pallet: news for the floor only.
  picking_slip_released: [ROLES.WORKER],
  volunteer: VOLUNTEER_MANAGEMENT_ROLES,
  vms: VOLUNTEER_MANAGEMENT_ROLES,
};

const targetRolesForType = (type) => {
  if (TARGET_ROLES_BY_TYPE[type]) return TARGET_ROLES_BY_TYPE[type];
  if (String(type).startsWith('section18a')) return MANAGERS_UP;
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
//
// `role` is the reader's role: a notification reaches the roles in its
// target_roles. `types` is how the floor-facing bell
// (StaffNotificationBell) and the manager one (NotificationBell) share
// this one feed without either seeing the other's noise: the floor only
// ever asks for the picking-slip types a worker's task view cares about,
// and passes role = null because those are the floor's by definition.
// The manager route passes no types and gets everything for its role.
// Types this role must not see, whatever an older row's target_roles
// says: rows keep the recipients they were written with, so when a
// type's audience narrows (picking_slip_created used to reach admins
// too) the rows already stored would otherwise keep reaching them.
const typesHiddenFrom = (role) => Object.entries(TARGET_ROLES_BY_TYPE)
  .filter(([, roles]) => !roles.includes(role))
  .map(([type]) => type);

const filtersFor = (role, types, params, base = []) => {
  const conditions = [...base];
  if (role) {
    params.push(role);
    conditions.push('n.target_roles IS NOT NULL', `$${params.length} = ANY(n.target_roles)`);
    params.push(typesHiddenFrom(role));
    conditions.push(`NOT (n.type = ANY($${params.length}))`);
  }
  if (types && types.length > 0) {
    params.push(types);
    conditions.push(`n.type = ANY($${params.length})`);
  }
  return conditions;
};

const listForUser = async (userId, role, { limit = 50, unreadOnly = false, types = null } = {}) => {
  const params = [userId];
  const conditions = filtersFor(role, types, params, unreadOnly ? ['nr.read_at IS NULL'] : []);
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT n.id, n.type, n.title, n.body, n.entity_type, n.entity_id,
            n.created_at, nr.read_at
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY n.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
};

const getUnreadCount = async (userId, role, { types = null } = {}) => {
  const params = [userId];
  const conditions = filtersFor(role, types, params, ['nr.read_at IS NULL']);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      WHERE ${conditions.join(' AND ')}`,
    params
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

const markAllRead = async (userId, role, { types = null } = {}) => {
  const params = [userId];
  const conditions = filtersFor(role, types, params, ['nr.read_at IS NULL']);
  await pool.query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT n.id, $1
       FROM notifications n
       LEFT JOIN notification_reads nr
              ON nr.notification_id = n.id AND nr.user_id = $1
      WHERE ${conditions.join(' AND ')}
     ON CONFLICT (notification_id, user_id) DO NOTHING`,
    params
  );
};

export default {
  createNotification,
  listForUser,
  getUnreadCount,
  markRead,
  markAllRead,
};

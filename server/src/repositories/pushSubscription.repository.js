// ─────────────────────────────────────────────────────────────
// server/src/repositories/pushSubscription.repository.js
//
// The phones that asked for push notifications. See
// 030_create_push_subscriptions.sql for why a row follows whoever is
// signed in on the phone rather than staying with the first person.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// Subscribing again on the same phone (same endpoint) moves it to the
// person now signed in and refreshes the keys.
const save = async ({ userId, endpoint, p256dh, auth, userAgent = null }) => {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            user_agent = EXCLUDED.user_agent`,
    [userId, endpoint, p256dh, auth, userAgent]
  );
};

// Only the owner can remove their own phone.
const removeForUser = async (userId, endpoint) => {
  await pool.query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, endpoint]
  );
};

// A push service said this phone is gone (uninstalled, alerts turned
// off in settings): nobody owns it any more.
const removeByEndpoint = async (endpoint) => {
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
};

const markSuccess = async (endpoint) => {
  await pool.query(
    'UPDATE push_subscriptions SET last_success_at = NOW() WHERE endpoint = $1',
    [endpoint]
  );
};

// Every phone belonging to an active, unarchived person in these roles.
const listForRoles = async (roles) => {
  const { rows } = await pool.query(
    `SELECT ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
      WHERE u.role = ANY($1)
        AND u.is_active IS NOT FALSE
        AND u.archived_at IS NULL`,
    [roles]
  );
  return rows;
};

export default { save, removeForUser, removeByEndpoint, markSuccess, listForRoles };

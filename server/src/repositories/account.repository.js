// ─────────────────────────────────────────────────────────────
// server/src/repositories/account.repository.js
//
// A person changing their own sign-in details: their password and the
// email address on their account. Kept apart from user.repository.js,
// which never selects password_hash and is what admins use to manage
// other people's accounts.
//
// Each change runs in its own transaction with an audit row, the same as
// an admin edit. The audit row never carries a password or its hash.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { logAudit } from './auditLog.repository.js';
import { SESSION_VERSION_SQL } from '../utils/sessionVersion.js';

/**
 * Login: the account with this username (any case), hash included for
 * the password check. Never sent to a client. Runs on whichever
 * warehouse database the caller has selected.
 */
const findForLogin = async (username) => {
  const { rows } = await pool.query(
    `SELECT id, username, first_name, last_name, role, password_hash, is_active, email,
            ${SESSION_VERSION_SQL} AS session_version
     FROM users
     WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return rows[0] ?? null;
};

/** GET /api/me: the account as it is now, without the hash. */
const findForSession = async (userId) => {
  const { rows } = await pool.query(
    `SELECT id, username, first_name, last_name, role, is_active, email
       FROM users
       WHERE id = $1`,
    [userId],
  );
  return rows[0] ?? null;
};

/** The language this person reads the floor screens in (migration 042). */
const getLanguage = async (userId) => {
  const { rows } = await pool.query(`SELECT language FROM users WHERE id = $1`, [userId]);
  return rows[0]?.language ?? null;
};

const setLanguage = (userId, language) =>
  pool.query(`UPDATE users SET language = $2 WHERE id = $1`, [userId, language]);

/** The account's hash and email, for checking the current password. Never sent to a client. */
const getCredentials = async (userId) => {
  const { rows } = await pool.query(
    `SELECT id, password_hash, email, is_active FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] ?? null;
};

const findOtherUserWithEmail = async (email, userId) => {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1`,
    [email, userId],
  );
  return rows[0] ?? null;
};

const setPasswordHash = async (userId, passwordHash) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A new password ends every session signed in with the old one (055).
    await client.query(
      `UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1`,
      [userId, passwordHash],
    );
    await logAudit(client, {
      entityType: 'user', entityId: userId, action: 'password_changed', actorId: userId,
      reason: 'Changed their own password from Profile.',
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const setEmail = async (userId, before, email) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET email = $2 WHERE id = $1`, [userId, email]);
    await logAudit(client, {
      entityType: 'user', entityId: userId, action: 'updated', actorId: userId,
      reason: 'Changed their own email from Profile.',
      before: { email: before }, after: { email },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default {
  findForLogin, findForSession, getLanguage, setLanguage,
  getCredentials, findOtherUserWithEmail, setPasswordHash, setEmail,
};

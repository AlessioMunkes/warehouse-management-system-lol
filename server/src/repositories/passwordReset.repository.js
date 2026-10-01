// ─────────────────────────────────────────────────────────────
// server/src/repositories/passwordReset.repository.js
//
// Data access for the password-reset flow (migration 029). Raw pg,
// bound parameters everywhere, same shape as userInvite.repository.js.
//
// token_hash IS NEVER SELECTED for anything the API returns — every
// SELECT list here omits it, same reasoning as userInvite.repository.js:
// the raw token is only ever known to the caller who generated it.
//
// CREATERESET OWNS ITS OWN TRANSACTION so a reader can never observe
// the new row without the user's prior live row(s) already marked
// superseded — see the header on migration 029.
//
// CONFIRMRESET'S UPDATE IS THE CONCURRENCY GUARD. `UPDATE
// password_resets SET used_at = now() WHERE id = $1 AND used_at IS
// NULL` only ever affects a row once — if two confirms for the same
// token race, the second writer's UPDATE affects zero rows and its
// whole transaction (including the password change) rolls back,
// rather than applying the same reset twice or after a first
// successful use.
// ─────────────────────────────────────────────────────────────
import pool         from '../config/db.js';
import { logAudit } from './auditLog.repository.js';

const RESET_COLUMNS = `
  id, user_id, token_hash, expires_at, used_at, superseded_at,
  requested_ip, created_at, email_status, email_error, email_attempted_at
`;

// ── Read ──────────────────────────────────────────────────────
// The per-email throttle: a live (unused, unsuperseded) row created
// in the last 5 minutes means "don't send another one yet, just
// answer as if we did" — see passwordReset.service.js.
const findRecentActiveByUserId = async (userId) => {
  const { rows } = await pool.query(
    `SELECT ${RESET_COLUMNS} FROM password_resets
      WHERE user_id = $1 AND used_at IS NULL AND superseded_at IS NULL
        AND created_at > now() - interval '5 minutes'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
};

// token_hash IS in this SELECT — this is the one read path that
// legitimately needs it, to resolve an incoming raw token (hashed by
// the caller before this is called).
const getByTokenHash = async (tokenHash) => {
  const { rows } = await pool.query(
    `SELECT ${RESET_COLUMNS}, token_hash FROM password_resets WHERE token_hash = $1`,
    [tokenHash]
  );
  return rows[0] ?? null;
};

// ── Write ─────────────────────────────────────────────────────
// Marks any prior live request for this user superseded, then inserts
// the new one, in one transaction — see migration 029's header for
// why superseding (not overwriting expires_at) keeps request history
// honest.
const createReset = async ({ userId, tokenHash, expiresAt, requestedIp }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE password_resets
          SET superseded_at = now()
        WHERE user_id = $1 AND used_at IS NULL AND superseded_at IS NULL`,
      [userId]
    );

    const { rows } = await client.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip)
       VALUES ($1,$2,$3,$4)
       RETURNING ${RESET_COLUMNS}`,
      [userId, tokenHash, expiresAt, requestedIp]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Records the outcome of one email-send attempt. Its own plain
// UPDATE, not part of createReset's transaction — the send happens
// after the row already exists (see passwordReset.service.js), so
// there is nothing to roll back together. No audit_log row, same
// reasoning as userInvite.repository.js's recordEmailAttempt: the
// status column on the row itself is the whole record here.
const recordEmailAttempt = async (id, { status, error = null }) => {
  await pool.query(
    `UPDATE password_resets
        SET email_status       = $2,
            email_error        = $3,
            email_attempted_at = now()
      WHERE id = $1`,
    [id, status, error]
  );
};

// Consumes the token and updates the password in one transaction.
// actorId for the audit row is the account's own id — nobody else
// authenticated this action; whoever held the emailed link acted.
//
// KNOWN LIMITATION (see passwordReset.service.js's file header): this
// does not touch any existing session for the account. A session
// issued before the reset remains valid after it.
const confirmReset = async ({ resetId, userId, passwordHash }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: resetRows } = await client.query(
      `UPDATE password_resets
          SET used_at = now()
        WHERE id = $1 AND used_at IS NULL
        RETURNING ${RESET_COLUMNS}`,
      [resetId]
    );
    const reset = resetRows[0] ?? null;

    if (!reset) {
      // Raced with another confirm of the same token, or the token
      // was somehow consumed between resolve and this write. Do not
      // touch the password.
      const err = new Error('This reset link has already been used.');
      err.status = 410;
      err.reason = 'used';
      throw err;
    }

    const { rows: userRows } = await client.query(
      `UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING id`,
      [userId, passwordHash]
    );

    if (!userRows[0]) {
      // The account vanished between the service's own active/archived
      // recheck and this write. Roll back the used_at UPDATE above too
      // — the token must still work against nothing, not be burned
      // against an account that no longer exists.
      const err = new Error('This reset link was not found.');
      err.status = 404;
      throw err;
    }

    await logAudit(client, {
      entityType: 'user',
      entityId:   userId,
      action:     'password_reset',
      actorId:    userId,
      after:      { passwordResetId: reset.id },
    });

    await client.query('COMMIT');
    return reset;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default {
  findRecentActiveByUserId,
  getByTokenHash,
  createReset,
  recordEmailAttempt,
  confirmReset,
};

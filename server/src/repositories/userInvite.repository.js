// ─────────────────────────────────────────────────────────────
// server/src/repositories/userInvite.repository.js
//
// Data access for the email-invite flow (migration 023). Raw pg,
// bound parameters everywhere, same shape as user.repository.js.
//
// token_hash IS NEVER SELECTED for anything the API returns — every
// SELECT list here omits it. The raw token is shown to the admin
// exactly once, at creation/resend time, by the service; the hash is
// write-only from the API's point of view.
//
// ACCEPT OWNS ITS OWN TRANSACTION, same shape as insertUser in
// user.repository.js: the new users row and the invite's accepted_at
// are written together, and the audit rows describing both go in the
// same transaction so neither can survive the other being rolled
// back.
//
// THE ACCEPT UPDATE IS THE CONCURRENCY GUARD. `UPDATE user_invites
// SET accepted_at = NOW() WHERE id = $1 AND accepted_at IS NULL AND
// revoked_at IS NULL` only ever affects a row once — if two accept
// requests for the same invite race, or an admin revokes it a moment
// after the invitee submits, the second writer's UPDATE affects zero
// rows and the whole transaction rolls back rather than creating a
// second account or reviving a revoked invite.
// ─────────────────────────────────────────────────────────────
import pool         from '../config/db.js';
import { logAudit } from './auditLog.repository.js';

const INVITE_COLUMNS = `
  i.id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at,
  i.invited_by, i.created_at, i.last_sent_at, i.resend_count
`;

const USER_COLUMNS = `
  id, username, first_name, last_name, role, is_active, archived_at
`;

// ── Read ──────────────────────────────────────────────────────
const getById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${INVITE_COLUMNS} FROM user_invites i WHERE i.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

// token_hash IS in this SELECT — this is the one read path that
// legitimately needs it, to resolve an incoming raw token.
const getByTokenHash = async (tokenHash) => {
  const { rows } = await pool.query(
    `SELECT ${INVITE_COLUMNS}, i.token_hash
       FROM user_invites i
      WHERE i.token_hash = $1`,
    [tokenHash]
  );
  return rows[0] ?? null;
};

// "Open" = not accepted, not revoked, not expired — the state that
// should block a second invite to the same address. An expired
// invite does not count: the admin should be able to just send a
// fresh one.
const findOpenByEmail = async (email) => {
  const { rows } = await pool.query(
    `SELECT ${INVITE_COLUMNS}
       FROM user_invites i
      WHERE lower(i.email) = lower($1)
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > now()`,
    [email]
  );
  return rows[0] ?? null;
};

// Matches idx_user_invites_pending exactly.
const listPending = async () => {
  const { rows } = await pool.query(
    `SELECT ${INVITE_COLUMNS}
       FROM user_invites i
      WHERE i.accepted_at IS NULL AND i.revoked_at IS NULL
      ORDER BY i.created_at DESC`
  );
  return rows;
};

// ── Write ─────────────────────────────────────────────────────
const createInvite = async ({ email, role, tokenHash, expiresAt, invitedBy }, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO user_invites (email, role, token_hash, expires_at, invited_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING ${INVITE_COLUMNS.replace(/i\./g, '')}`,
      [email, role, tokenHash, expiresAt, invitedBy]
    );
    const invite = rows[0];

    await logAudit(client, {
      entityType: 'user_invite',
      entityId:   invite.id,
      action:     'created',
      actorId,
      after:      invite,
    });

    await client.query('COMMIT');
    return invite;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// `before` is the pre-write row the service already fetched to run
// its own checks (existence, not-already-accepted/revoked) — same
// convention as user.repository.js's updateUser.
const resendInvite = async ({ id, tokenHash, expiresAt }, before, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE user_invites
          SET token_hash   = $2,
              expires_at   = $3,
              last_sent_at = now(),
              resend_count = resend_count + 1
        WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
        RETURNING ${INVITE_COLUMNS.replace(/i\./g, '')}`,
      [id, tokenHash, expiresAt]
    );
    const invite = rows[0] ?? null;

    if (invite) {
      await logAudit(client, {
        entityType: 'user_invite',
        entityId:   id,
        action:     'resent',
        actorId,
        before,
        after:      invite,
      });
    }

    await client.query('COMMIT');
    return invite;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const revokeInvite = async (id, before, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE user_invites
          SET revoked_at = now()
        WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
        RETURNING ${INVITE_COLUMNS.replace(/i\./g, '')}`,
      [id]
    );
    const invite = rows[0] ?? null;

    if (invite) {
      await logAudit(client, {
        entityType: 'user_invite',
        entityId:   id,
        action:     'revoked',
        actorId,
        before,
        after:      invite,
      });
    }

    await client.query('COMMIT');
    return invite;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Creates the users row and marks the invite accepted, in one
// transaction. actorId for both audit rows is the new user's own id —
// nobody else authenticated this action; the invitee is who acted.
const acceptInvite = async ({ inviteId, username, firstName, lastName, role, email, passwordHash }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: userRows } = await client.query(
      `INSERT INTO users (username, first_name, last_name, role, password_hash, email, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       RETURNING ${USER_COLUMNS}`,
      [username, firstName, lastName, role, passwordHash, email]
    );
    const user = userRows[0];

    const { rows: inviteRows } = await client.query(
      `UPDATE user_invites
          SET accepted_at = now()
        WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
        RETURNING ${INVITE_COLUMNS.replace(/i\./g, '')}`,
      [inviteId]
    );
    const invite = inviteRows[0] ?? null;

    if (!invite) {
      // Invite was accepted or revoked by someone else between resolve
      // and this write — do not create the account. Falls through to
      // the catch below, which rolls back the INSERT above.
      const err = new Error('This invite is no longer valid.');
      err.status = 409;
      throw err;
    }

    await logAudit(client, {
      entityType: 'user',
      entityId:   user.id,
      action:     'created',
      actorId:    user.id,
      reason:     `Accepted invite ${invite.id}`,
      after:      user,
    });

    await logAudit(client, {
      entityType: 'user_invite',
      entityId:   invite.id,
      action:     'accepted',
      actorId:    user.id,
      after:      invite,
    });

    await client.query('COMMIT');
    return { user, invite };
  } catch (err) {
    await client.query('ROLLBACK');
    // Backstop for a username race the service's own pre-check missed —
    // two accepts for different invites submitting the same username
    // between the check and this INSERT. users_username_key is the
    // constraint that actually prevents it.
    if (err.code === '23505' && err.constraint === 'users_username_key') {
      const conflict = new Error('That username was taken a moment ago. Please choose another.');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  } finally {
    client.release();
  }
};

export default {
  getById,
  getByTokenHash,
  findOpenByEmail,
  listPending,
  createInvite,
  resendInvite,
  revokeInvite,
  acceptInvite,
};

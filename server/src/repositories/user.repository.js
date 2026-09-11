// ─────────────────────────────────────────────────────────────
// server/src/repositories/user.repository.js
//
// Data access for staff accounts. Raw pg, bound parameters
// everywhere, no dynamic SQL built from caller-supplied keys — same
// UPDATABLE whitelist approach as supplier.repository.js.
//
// password_hash IS NEVER SELECTED.
// USER_COLUMNS deliberately omits it. There is no code path in this
// file that can leak a hash to the API layer by accident — the only
// place a hash is ever written is insertUser's parameter list, never
// a RETURNING or SELECT list.
//
// WRITES OWN THEIR OWN TRANSACTION.
// insertUser, updateUser and setUserActive each run BEGIN...COMMIT
// themselves and write the audit_log row inside that same
// transaction, the same shape as createPurchaseOrder in
// purchaseOrder.repository.js. logAudit takes the transaction client,
// never the pool — an audit row written on a different connection
// would survive a rollback of the change it describes.
//
// NO created_at / deactivated_at / deactivated_by.
// Unlike suppliers, the users table carries none of those columns and
// this slice does not add them (no migration). is_active is the whole
// soft-deactivation story; audit_log is the who/when trail.
// ─────────────────────────────────────────────────────────────
import pool         from '../config/db.js';
import { logAudit } from './auditLog.repository.js';

const USER_COLUMNS = `
  u.id, u.username, u.first_name, u.last_name, u.role, u.is_active,
  u.archived_at
`;

// ── Column whitelist for updates ──────────────────────────────
const UPDATABLE = {
  username:  'username',
  firstName: 'first_name',
  lastName:  'last_name',
  role:      'role',
};

// ── Read ──────────────────────────────────────────────────────
const listUsers = async ({ includeInactive = false, search = null } = {}) => {
  const params = [];
  const where = [];

  if (!includeInactive) where.push('u.is_active = true');

  // Archived accounts leave the directory whatever the toggle says.
  // The row itself stays because audit_log.actor_id references it and
  // BR-04's trail has to keep naming who did what.
  where.push('u.archived_at IS NULL');

  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.username ILIKE $${params.length}
              OR u.first_name ILIKE $${params.length}
              OR u.last_name ILIKE $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS}
       FROM users u
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.is_active DESC, u.username ASC`,
    params
  );
  return rows;
};

const getUserById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`,
    [id]
  );
  return rows[0] ?? null;
};

// Case-insensitive, same reasoning as findSupplierByName: login.route.js
// already matches usernames with LOWER(username) = LOWER($1), so two
// accounts differing only in case would be indistinguishable at login
// even if the database allowed both to exist.
const findUserByUsername = async (username, { excludeId = null } = {}) => {
  const params = [username];
  let sql = `SELECT ${USER_COLUMNS} FROM users u WHERE lower(u.username) = lower($1)`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND u.id <> $${params.length}`;
  }
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
};

// ── Write ─────────────────────────────────────────────────────
const insertUser = async (payload, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO users (username, first_name, last_name, role, password_hash, is_active)
       VALUES ($1,$2,$3,$4,$5,true)
       RETURNING ${USER_COLUMNS.replace(/u\./g, '')}`,
      [payload.username, payload.firstName, payload.lastName, payload.role, payload.passwordHash]
    );
    const user = rows[0];

    await logAudit(client, {
      entityType: 'user',
      entityId:   user.id,
      action:     'created',
      actorId,
      after:      user,
    });

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// `before` is the pre-write row the service already fetched to run its
// own checks (existence, self-lockout) — passed through rather than
// re-read here, so the audit row and the caller's validation agree on
// what "before" meant.
const updateUser = async (id, patch, before, actorId) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    params.push(patch[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (!sets.length) return before;

  params.push(id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE users SET ${sets.join(', ')}
        WHERE id = $${params.length}
        RETURNING ${USER_COLUMNS.replace(/u\./g, '')}`,
      params
    );
    const user = rows[0] ?? null;

    if (user) {
      await logAudit(client, {
        entityType: 'user',
        entityId:   id,
        action:     'updated',
        actorId,
        before,
        after:      user,
      });
    }

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// is_active is the entire soft-deactivation story here — no
// deactivated_at / deactivated_by columns exist on users (unlike
// suppliers) and this slice does not add them. audit_log carries the
// who/when that those columns would otherwise have held.
// Archiving an account. is_active goes false in the same statement,
// which is what actually revokes access — login reads is_active — and
// the CHECK constraint from migration 019 guarantees the two can never
// drift apart.
//
// The row survives because audit_log.actor_id points at it. An archived
// admin who approved a purchase order two years ago must still have a
// name on that approval.
const archiveUser = async (id, before, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE users
          SET is_active   = false,
              archived_at = COALESCE(archived_at, now()),
              archived_by = COALESCE(archived_by, $2)
        WHERE id = $1
        RETURNING ${USER_COLUMNS.replace(/u\./g, '')}`,
      [id, actorId ?? null],
    );
    const user = rows[0] ?? null;
    if (!user) { await client.query('ROLLBACK'); return null; }

    await logAudit(client, {
      entityType: 'user',
      entityId:   id,
      action:     'archived',
      actorId,
      before,
      after:      user,
    });

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const setUserActive = async (id, isActive, before, actorId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE users SET is_active = $2
        WHERE id = $1
        RETURNING ${USER_COLUMNS.replace(/u\./g, '')}`,
      [id, isActive]
    );
    const user = rows[0] ?? null;

    if (user) {
      await logAudit(client, {
        entityType: 'user',
        entityId:   id,
        action:     isActive ? 'reactivated' : 'deactivated',
        actorId,
        before,
        after:      user,
      });
    }

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default {
  listUsers,
  getUserById,
  findUserByUsername,
  insertUser,
  updateUser,
  setUserActive,
  archiveUser,
};

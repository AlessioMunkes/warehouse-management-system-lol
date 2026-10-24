// ─────────────────────────────────────────────────────────────
// server/src/repositories/session.repository.js
//
// What auth.middleware.js re-reads on every request, so a token is
// only as good as the account behind it right now. See the note on
// checkCurrentAccount there.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { SESSION_VERSION_SQL } from '../utils/sessionVersion.js';

// The staff member's role and standing now, and the session version
// their token must carry.
const findStaffSession = async (userId) => {
  const { rows } = await pool.query(
    `SELECT id, username, role, is_active, archived_at,
            ${SESSION_VERSION_SQL} AS session_version
       FROM users
      WHERE id = $1`,
    [userId],
  );
  return rows[0] ?? null;
};

// A guest's visit: their session ends when the visit is signed out.
const findGuestSession = async (volunteerId) => {
  const { rows } = await pool.query(
    `SELECT id, signed_out_at FROM volunteers WHERE id = $1`,
    [volunteerId],
  );
  return rows[0] ?? null;
};

export default { findStaffSession, findGuestSession };

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

// A guest's visit: their session ends when the visit is signed out, or
// after GUEST_IDLE_HOURS with nothing done (migration 067). idle is the
// database's own clock, so a server with a wrong clock cannot misjudge
// it.
export const GUEST_IDLE_HOURS = 4;

const findGuestSession = async (volunteerId) => {
  const { rows } = await pool.query(
    `SELECT id, signed_out_at,
            COALESCE(last_active_at, signed_in_at) < now() - make_interval(hours => $2) AS idle,
            COALESCE(last_active_at, signed_in_at) < now() - interval '1 minute'     AS stale
       FROM volunteers WHERE id = $1`,
    [volunteerId, GUEST_IDLE_HOURS],
  );
  return rows[0] ?? null;
};

// The guest did something: they are active now. Written at most once a
// minute (the caller checks `stale`), not on every request.
const touchGuestSession = async (volunteerId) => {
  await pool.query(
    `UPDATE volunteers SET last_active_at = now() WHERE id = $1 AND signed_out_at IS NULL`,
    [volunteerId],
  );
};

// Idle too long: signed out when they last did something, so the visit
// counts the hours they were here and not the hours since.
const closeIdleGuestSession = async (volunteerId) => {
  await pool.query(
    `UPDATE volunteers SET signed_out_at = COALESCE(last_active_at, signed_in_at)
      WHERE id = $1 AND signed_out_at IS NULL`,
    [volunteerId],
  );
};

// Every visit idle that long, for the sweep (jobs/guestIdle.job.js): a
// guest who left without signing out and never came back.
const closeIdleGuestSessions = async () => {
  const { rowCount } = await pool.query(
    `UPDATE volunteers SET signed_out_at = COALESCE(last_active_at, signed_in_at)
      WHERE signed_out_at IS NULL
        AND COALESCE(last_active_at, signed_in_at) < now() - make_interval(hours => $1)`,
    [GUEST_IDLE_HOURS],
  );
  return rowCount;
};

export default { findStaffSession, findGuestSession, touchGuestSession, closeIdleGuestSession, closeIdleGuestSessions };

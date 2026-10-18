// ─────────────────────────────────────────────────────────────
// server/src/repositories/health.repository.js
//
// The database side of the Connections screen's checks.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// Throws when the database cannot be reached.
export const ping = () => pool.query('SELECT 1');

export const countFailedEmailsLastDay = async () => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM outbound_messages
      WHERE status = 'failed' AND attempted_at > NOW() - INTERVAL '24 hours'`,
  );
  return rows[0]?.n ?? 0;
};

export default { ping, countFailedEmailsLastDay };

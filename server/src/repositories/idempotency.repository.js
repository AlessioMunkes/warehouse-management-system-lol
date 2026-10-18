// ─────────────────────────────────────────────────────────────
// server/src/repositories/idempotency.repository.js
//
// idempotency_keys rows (migration 040), for
// middleware/idempotency.middleware.js, which explains the rules: who
// may claim a key, when a claim counts as abandoned, and why only a
// successful answer is kept.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// True when this request is the first to send the key.
export const claim = async (key, scope, userId) => {
  const { rows } = await pool.query(
    `INSERT INTO idempotency_keys (key, scope, user_id) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING
       RETURNING key`,
    [key, scope, userId]
  );
  return rows.length > 0;
};

// The earlier claim on this key, and whether it is older than
// `abandonedAfterSeconds` (a whole number the middleware sets).
export const findPrior = async (key, abandonedAfterSeconds) => {
  const { rows } = await pool.query(
    `SELECT scope, user_id, status_code, response,
                (created_at < NOW() - INTERVAL '${abandonedAfterSeconds} seconds') AS abandoned
           FROM idempotency_keys WHERE key = $1`,
    [key]
  );
  return rows[0] ?? null;
};

// Takes over a claim that never stored an answer. True when this request
// got it; false when another took it first or it finished meanwhile.
export const takeOverAbandoned = async (key, abandonedAfterSeconds) => {
  const { rows } = await pool.query(
    `UPDATE idempotency_keys SET created_at = NOW()
            WHERE key = $1 AND status_code IS NULL
              AND created_at < NOW() - INTERVAL '${abandonedAfterSeconds} seconds'
          RETURNING key`,
    [key]
  );
  return rows.length > 0;
};

export const storeAnswer = (key, statusCode, body) =>
  pool.query(`UPDATE idempotency_keys SET status_code = $2, response = $3::jsonb WHERE key = $1`,
    [key, statusCode, JSON.stringify(body ?? null)]);

export const forget = (key) =>
  pool.query(`DELETE FROM idempotency_keys WHERE key = $1`, [key]);

export const purgeOlderThan = (days) =>
  pool.query(`DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '${days} days'`);

export default { claim, findPrior, takeOverAbandoned, storeAnswer, forget, purgeOlderThan };

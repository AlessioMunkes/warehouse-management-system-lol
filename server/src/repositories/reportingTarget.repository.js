// ─────────────────────────────────────────────────────────────
// server/src/repositories/reportingTarget.repository.js
//
// A manager's own chart targets (migration 025). One row per
// (user, metric); no row means the default applies.
//
// The table may not exist yet on a database that has not run 025.
// Reads then return nothing (defaults everywhere, the page works);
// writes throw a 503 the manager can act on.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const notSetUp = (err) => {
  if (err.code !== '42P01') return err;
  const e = new Error('Personal targets are not set up yet: run migration 025_create_reporting_targets.sql.');
  e.status = 503;
  return e;
};

const listForUser = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT metric_id, value::float8 AS value, updated_at
         FROM reporting_targets WHERE user_id = $1`,
      [userId]
    );
    return rows;
  } catch (err) {
    if (err.code === '42P01') return [];
    throw err;
  }
};

const upsert = async ({ userId, metricId, value }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO reporting_targets (user_id, metric_id, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, metric_id)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING metric_id, value::float8 AS value, updated_at`,
      [userId, metricId, value]
    );
    return rows[0];
  } catch (err) {
    throw notSetUp(err);
  }
};

const remove = async ({ userId, metricId }) => {
  try {
    await pool.query(`DELETE FROM reporting_targets WHERE user_id = $1 AND metric_id = $2`, [userId, metricId]);
  } catch (err) {
    throw notSetUp(err);
  }
};

export default { listForUser, upsert, remove };

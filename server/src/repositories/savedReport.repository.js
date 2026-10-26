// ─────────────────────────────────────────────────────────────
// server/src/repositories/savedReport.repository.js
//
// Saved Operations reports (migration 029). Every query is limited to the
// owner. If the table doesn't exist yet, reads return nothing and writes
// return a 503 naming the migration.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const COLS = `id, title, kind, spec, preset, pinned, schedule, last_sent_at, last_error, created_at, updated_at,
  narrative, narrative_at, narrative_range`;

const notSetUp = (err) => {
  if (err.code !== '42P01') return err;
  const e = new Error('Saved reports are not set up yet: run migration 029_create_saved_reports.sql.');
  e.status = 503;
  return e;
};

const listForUser = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM saved_reports WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC`,
      [userId]
    );
    return rows;
  } catch (err) {
    if (err.code === '42P01') return [];
    throw err;
  }
};

const countForUser = async (userId) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM saved_reports WHERE user_id = $1', [userId]);
    return rows[0].n;
  } catch (err) {
    throw notSetUp(err);
  }
};

// narrative: the written report kept with it (migration 062), or null.
const create = async ({ userId, title, kind, spec, preset, pinned, schedule, narrative = null, narrativeRange = null }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO saved_reports (user_id, title, kind, spec, preset, pinned, schedule,
                                  narrative, narrative_at, narrative_range)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, CASE WHEN $8::jsonb IS NULL THEN NULL ELSE NOW() END, $9::jsonb)
       RETURNING ${COLS}`,
      [userId, title, kind, JSON.stringify(spec), preset, pinned, schedule,
        narrative ? JSON.stringify(narrative) : null, narrativeRange ? JSON.stringify(narrativeRange) : null]
    );
    return rows[0];
  } catch (err) {
    throw notSetUp(err);
  }
};

// Only the fields given change. Returns null when the row is not this user's.
// `written` ({ narrative, range }) replaces the kept written report when
// given; { narrative: null } removes it.
const update = async ({ userId, id, title, pinned, schedule, preset, written }) => {
  try {
    const { rows } = await pool.query(
      `UPDATE saved_reports
          SET title    = COALESCE($3, title),
              pinned   = COALESCE($4, pinned),
              schedule = COALESCE($5, schedule),
              preset   = COALESCE($6, preset),
              narrative       = CASE WHEN $7 THEN $8::jsonb ELSE narrative END,
              narrative_at    = CASE WHEN $7 THEN (CASE WHEN $8::jsonb IS NULL THEN NULL ELSE NOW() END) ELSE narrative_at END,
              narrative_range = CASE WHEN $7 THEN $9::jsonb ELSE narrative_range END,
              updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING ${COLS}`,
      [id, userId, title ?? null, pinned ?? null, schedule ?? null, preset ?? null,
        written !== undefined,
        written?.narrative ? JSON.stringify(written.narrative) : null,
        written?.range ? JSON.stringify(written.range) : null]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw notSetUp(err);
  }
};

const remove = async ({ userId, id }) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM saved_reports WHERE id = $1 AND user_id = $2', [id, userId]);
    return rowCount > 0;
  } catch (err) {
    throw notSetUp(err);
  }
};

const getForUser = async ({ userId, id }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS}, (SELECT email FROM users u WHERE u.id = sr.user_id) AS email
         FROM saved_reports sr WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw notSetUp(err);
  }
};

// Scheduled reports whose owner is still an active manager or admin,
// with the address to send to.
const listScheduled = async () => {
  try {
    const { rows } = await pool.query(
      `SELECT sr.id, sr.user_id, sr.title, sr.kind, sr.spec, sr.preset, sr.schedule, sr.last_sent_at, u.email
         FROM saved_reports sr JOIN users u ON u.id = sr.user_id
        WHERE sr.schedule <> 'none' AND u.is_active = true AND u.role IN ('manager', 'admin')`
    );
    return rows;
  } catch (err) {
    if (err.code === '42P01') return [];
    throw err;
  }
};

const markSent = async ({ id, error = null }) => {
  await pool.query(
    error
      ? 'UPDATE saved_reports SET last_error = $2 WHERE id = $1'
      : 'UPDATE saved_reports SET last_sent_at = NOW(), last_error = NULL WHERE id = $1',
    error ? [id, String(error).slice(0, 500)] : [id]
  );
};

export default { listForUser, countForUser, create, update, remove, getForUser, listScheduled, markSent };

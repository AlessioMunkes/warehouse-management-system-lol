// ─────────────────────────────────────────────────────────────
// server/src/repositories/translation.repository.js
//
// translation_overrides rows (migration 002): an admin's own wording
// for one piece of the floor and volunteer screens. translation.service.js
// decides what may be saved; this file only reads and writes rows.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

export const list = async () => {
  const { rows } = await pool.query(
    `SELECT language, kind, source, text, updated_at
       FROM translation_overrides
      ORDER BY language, kind, source`
  );
  return rows;
};

export const save = async ({ language, kind, source, text }, userId) => {
  const { rows } = await pool.query(
    `INSERT INTO translation_overrides (language, kind, source, text, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (language, kind, source) DO UPDATE
       SET text = EXCLUDED.text, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING language, kind, source, text, updated_at`,
    [language, kind, source, text, userId ?? null]
  );
  return rows[0];
};

export const remove = async ({ language, kind, source }) => {
  const { rowCount } = await pool.query(
    'DELETE FROM translation_overrides WHERE language = $1 AND kind = $2 AND source = $3',
    [language, kind, source]
  );
  return rowCount > 0;
};

export default { list, save, remove };

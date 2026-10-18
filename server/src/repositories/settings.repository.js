// ─────────────────────────────────────────────────────────────
// server/src/repositories/settings.repository.js
//
// app_settings rows (migration 033). What the values mean, their
// defaults and their checks are in features/settings/settingsDefinitions.js;
// settings.service.js decides what to save. This file only reads and
// writes the rows.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

export const readAll = async () => {
  const { rows } = await pool.query('SELECT key, value, updated_at FROM app_settings');
  return rows;
};

// Some keys, on the caller's connection (it may be mid-transaction).
export const readKeys = async (client, keys) => {
  const { rows } = await client.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  return rows;
};

export const remove = (client, key) =>
  client.query('DELETE FROM app_settings WHERE key = $1', [key]);

export const save = (client, key, value, userId) =>
  client.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, JSON.stringify(value), userId ?? null],
  );

export default { readAll, readKeys, remove, save };

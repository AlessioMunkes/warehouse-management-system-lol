// ─────────────────────────────────────────────────────────────
// server/src/services/settings.service.js
//
// Reading and changing the admin-editable values in app_settings
// (migration 033), against settingsDefinitions.js.
//
// READS NEVER FAIL. get() and getAll() fall back to the defaults when
// the table cannot be read — not yet migrated, a dropped connection —
// because every caller is a scheduler or a request that worked on a
// hard-coded constant until now, and must keep working on it. The
// failure is logged once per read.
//
// Values are read from the database each time rather than cached: the
// table is a handful of rows, the callers run a few times a day or per
// request, and a cache would need clearing on every warehouse when an
// admin saves.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import settingsRepository from '../repositories/settings.repository.js';
import {
  SETTINGS, SETTING_KEYS, defaults, isSettingKey, validateValue,
} from '../features/settings/settingsDefinitions.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

export const getAll = async () => {
  const values = defaults();
  try {
    for (const row of await settingsRepository.readAll()) {
      if (isSettingKey(row.key) && validateValue(row.key, row.value) === null) values[row.key] = row.value;
    }
  } catch (err) {
    console.error('[settings] Using defaults; could not read app_settings:', err.message);
  }
  return values;
};

export const get = async (key) => {
  if (!isSettingKey(key)) throw new Error(`Unknown setting "${key}".`);
  return (await getAll())[key];
};

// For the Settings screen: every setting with its definition, current
// value and whether it has been changed from the default.
export const list = async () => {
  const values = await getAll();
  // `check` is a function and stays on the server.
  return SETTING_KEYS.map((key) => {
    const def = Object.fromEntries(Object.entries(SETTINGS[key]).filter(([k]) => k !== 'check'));
    return { key, ...def, value: values[key], isDefault: values[key] === def.default };
  });
};

// Saves the changed values together, checking each against the others
// as they will be once saved (the two expiry windows depend on each
// other). A value equal to its default removes the row, so "back to
// default" leaves nothing behind.
export const update = async (changes, userId) => {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    throw fail(400, 'Send the settings to change as { key: value }.');
  }
  const keys = Object.keys(changes);
  if (keys.length === 0) throw fail(400, 'Nothing to change.');
  for (const key of keys) {
    if (!isSettingKey(key)) throw fail(400, `Unknown setting "${key}".`);
    const message = validateValue(key, changes[key]);
    if (message) throw fail(400, message);
  }

  const next = { ...(await getAll()), ...changes };
  for (const key of keys) {
    const message = SETTINGS[key].check?.(next[key], next);
    if (message) throw fail(400, message);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const key of keys) {
      if (changes[key] === SETTINGS[key].default) {
        await settingsRepository.remove(client, key);
      } else {
        await settingsRepository.save(client, key, changes[key], userId);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return list();
};

export default { get, getAll, list, update };

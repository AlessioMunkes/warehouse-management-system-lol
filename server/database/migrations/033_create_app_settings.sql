-- =============================================================
-- server/database/migrations/033_create_app_settings.sql
--
-- Values an admin can change that used to be constants in the code:
-- the non-collection cut-off hour, the collection-reminder send hour,
-- the two expiry-warning windows, and how long an invite link lasts.
--
-- ONE ROW PER CHANGED VALUE. A key with no row uses the default in
-- server/src/features/settings/settingsDefinitions.js, which is the
-- value the code had before this table existed — so applying this
-- migration changes nothing until someone saves a setting, and a
-- database without it behaves exactly as before.
--
-- value is JSONB so a setting can be a number, a string or a list
-- without a column per type; settingsDefinitions.js validates it.
--
-- Idempotent: safe to run more than once.
-- =============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

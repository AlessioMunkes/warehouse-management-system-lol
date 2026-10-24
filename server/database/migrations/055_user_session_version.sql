-- ─────────────────────────────────────────────────────────────
-- 055_user_session_version.sql
--
-- A number on each account that every session token must match.
--
-- A session is a signed token that lasts 8 hours. Until now a token
-- kept working for all of that time after the password was changed or
-- reset, or the account was deactivated or archived. Each of those now
-- adds 1 to session_version, and auth.middleware.js turns away any
-- token carrying an older number, so the person signs in again.
--
-- Existing tokens carry no number, which counts as 0: everyone stays
-- signed in through this migration.
--
-- Additive: one column with a default.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

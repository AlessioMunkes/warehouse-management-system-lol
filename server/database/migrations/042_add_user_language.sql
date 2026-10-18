-- ─────────────────────────────────────────────────────────────
-- 042_add_user_language.sql
--
-- The language a person reads the floor screens in: English, Afrikaans
-- or isiXhosa. Kept on the account, not the device, because tablets are
-- shared: it follows whoever signs in.
--
-- Additive only: one new column, English for everyone until they choose.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'af', 'xh'));

-- =============================================================
-- server/database/migrations/024_add_user_invite_email_status.sql
--
-- Persists the outcome of the last invite-email send attempt, so the
-- admin's "Pending invites" list can show it without having to be on
-- the page at the moment the send happened.
--
-- email_status is one of:
--   'sent'    — a real message went out via the connected Gmail account
--   'stubbed' — EMAIL_ENABLED=false; nothing was sent anywhere, and
--               this must never be presented to an admin as "sent"
--   'failed'  — a real attempt was made and the provider reported an
--               error (e.g. no Gmail account connected)
--   NULL      — no attempt has been made yet (a fresh 023-era row
--               that predates this migration, or the rare case where
--               the send itself threw before a status could be
--               recorded)
--
-- NOT a transactional pair with the invite create/resend write — the
-- email attempt happens after the invite already exists (see
-- userInvite.service.js's header comment: "the invite exists" and
-- "the email went out" can never be the same failure), so this column
-- is updated in its own statement, not inside that INSERT/UPDATE.
--
-- Idempotent: safe to run more than once.
-- =============================================================

ALTER TABLE user_invites ADD COLUMN IF NOT EXISTS email_status TEXT
  CHECK (email_status IN ('sent', 'stubbed', 'failed'));
ALTER TABLE user_invites ADD COLUMN IF NOT EXISTS email_error TEXT;
ALTER TABLE user_invites ADD COLUMN IF NOT EXISTS email_attempted_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- 058_runtime_schema_to_migration.sql
--
-- Schema the app used to create for itself while running, moved here.
--
-- donation.repository.js ran ALTER TABLE donations ... ADD COLUMN IF
-- NOT EXISTS on every Section 18A link save, open and submit, and
-- gmail.repository.js ran CREATE TABLE / ALTER TABLE / CREATE INDEX on
-- every Gmail read and write. Even when there is nothing to add, ALTER
-- TABLE takes the strongest table lock, so each donor opening their
-- public 18A link briefly blocked all work on donations, and the app
-- needed owner rights to run at all.
--
-- Everything below already exists in a database the app has used; this
-- makes sure every warehouse database has it, so the code can stop
-- asking. Additive only, and a no-op where it is already there.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_form_token_hash TEXT;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_form_token_expires_at TIMESTAMPTZ;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_form_submitted_at TIMESTAMPTZ;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_donor_form JSONB;

CREATE TABLE IF NOT EXISTS gmail_connections (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_email              VARCHAR(255),
  display_name             VARCHAR(255),
  token_type               VARCHAR(32) NOT NULL,
  scope                    TEXT NOT NULL,
  access_token_encrypted   TEXT NOT NULL,
  refresh_token_encrypted  TEXT NOT NULL,
  access_token_expires_at  TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  connected_by_user_id     INTEGER REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE gmail_connections ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_connections_connected_by_user_id
  ON gmail_connections (connected_by_user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_connections_updated_at
  ON gmail_connections (updated_at);
ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;

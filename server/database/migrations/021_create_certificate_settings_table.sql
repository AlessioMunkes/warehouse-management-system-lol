-- =============================================================
-- server/database/migrations/021_create_certificate_settings_table.sql
--
-- Dedicated certificate settings table for Section 18A certificate
-- configuration. Single-row singleton (id = 1) storing organisation
-- details, email defaults, and certificate template defaults.
--
-- This table is the authoritative source for all certificate-related
-- organisation information. The certificate generation service and
-- email service read from here instead of using hardcoded values.
--
-- Idempotent: safe to run more than once.
-- =============================================================

CREATE TABLE IF NOT EXISTS certificate_settings (
  id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Organisation details (required for certificates)
  organisation_name           TEXT NOT NULL DEFAULT '',
  pbo_number                  TEXT NOT NULL DEFAULT '',
  section18a_reference        TEXT NOT NULL DEFAULT '',
  physical_address            TEXT NOT NULL DEFAULT '',
  postal_address              TEXT NOT NULL DEFAULT '',
  contact_email               TEXT NOT NULL DEFAULT '',
  contact_phone               TEXT NOT NULL DEFAULT '',

  -- Email defaults
  sender_display_name         TEXT NOT NULL DEFAULT '',
  reply_to_email              TEXT NOT NULL DEFAULT '',
  subject_template            TEXT NOT NULL DEFAULT '',

  -- Certificate defaults
  footer_text                 TEXT NOT NULL DEFAULT '',
  signature_name              TEXT NOT NULL DEFAULT '',
  signature_title             TEXT NOT NULL DEFAULT '',
  default_acknowledgement_message TEXT NOT NULL DEFAULT '',

  -- Timestamps
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one row can exist (singleton pattern)
INSERT INTO certificate_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Index for efficient lookups (though there's only one row)
CREATE INDEX IF NOT EXISTS idx_certificate_settings_id ON certificate_settings(id);
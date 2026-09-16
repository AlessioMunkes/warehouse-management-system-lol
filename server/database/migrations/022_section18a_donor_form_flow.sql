ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_form_token_hash TEXT;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_form_token_expires_at TIMESTAMPTZ;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_form_submitted_at TIMESTAMPTZ;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_donor_form JSONB;

ALTER TABLE certificate_settings ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE certificate_settings ADD COLUMN IF NOT EXISTS npo_number TEXT NOT NULL DEFAULT '';
ALTER TABLE certificate_settings ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';
ALTER TABLE certificate_settings ADD COLUMN IF NOT EXISTS certificate_prefix TEXT NOT NULL DEFAULT '18A';

CREATE INDEX IF NOT EXISTS idx_donations_section18a_form_token_hash
  ON donations(section_18a_form_token_hash);

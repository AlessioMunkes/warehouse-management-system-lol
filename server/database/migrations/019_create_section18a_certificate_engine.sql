-- =============================================================
-- server/database/migrations/019_create_section18a_certificate_engine.sql
--
-- Section 18A certificate engine + donation email log.
--
-- (Recreated after the untracked-files cleanup. Every table/column
-- here is the exact shape the surviving code reads and writes:
-- repositories/donation.repository.js, services/donation.service.js
-- and services/donationAdmin.service.js.)
--
--   donations          + 4 ALTER columns (status / ref / issued_at)
--   section18a_settings  single-row org + PBA declaration settings
--   donation_settings    single-row policy figures (18A threshold)
--   section18a_certificates  issued certificates, incl. PDF bytes
--   donation_email_logs  one row per thank-you / certificate email
--
-- Idempotent: safe to run more than once.
-- =============================================================

-- ── donations: Section 18A lifecycle columns ─────────────────
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_status TEXT;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_qualifying BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_certificate_ref TEXT;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS section_18a_issued_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_donations_section_18a_status
  ON donations(section_18a_status);

-- ── section18a_settings: the organisation block on certificates ──
-- Single row (id = 1), read wholesale by getSection18ASettings and
-- snapshotted into every issued certificate. Field names mirror the
-- Donation Management > Certificate settings tab.
CREATE TABLE IF NOT EXISTS section18a_settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  organisation_name    TEXT NOT NULL DEFAULT '',
  organisation_address TEXT NOT NULL DEFAULT '',
  contact_name         TEXT NOT NULL DEFAULT '',
  contact_email        TEXT NOT NULL DEFAULT '',
  contact_phone        TEXT NOT NULL DEFAULT '',
  pba_declaration      TEXT NOT NULL DEFAULT '',
  certificate_prefix   TEXT NOT NULL DEFAULT 'S18A',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO section18a_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── donation_settings: policy figures finance changes in place ──
-- section18a_threshold_value is the Ladles of Love value threshold
-- above which a donation qualifies (Section 18A itself sets none).
CREATE TABLE IF NOT EXISTS donation_settings (
  id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  section18a_threshold_value NUMERIC(12,2),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO donation_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── section18a_certificates ──────────────────────────────────
-- pdf_content is stored with the row so a certificate issued once is
-- byte-identical every time it is re-sent. The three snapshot columns
-- freeze what the organisation/donor/donation looked like at issue
-- time, so historical rows never drift with later edits.
CREATE TABLE IF NOT EXISTS section18a_certificates (
  id                BIGSERIAL PRIMARY KEY,
  donation_id       INTEGER NOT NULL REFERENCES donations(id),
  certificate_number TEXT NOT NULL UNIQUE,
  issue_date        DATE NOT NULL,
  issued_by         INTEGER REFERENCES users(id),
  settings_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  donor_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
  donation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_content       BYTEA NOT NULL,
  pdf_filename      TEXT NOT NULL,
  pdf_content_type  TEXT NOT NULL DEFAULT 'application/pdf',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_section18a_certificates_donation
  ON section18a_certificates(donation_id);

-- ── donation_email_logs ──────────────────────────────────────
-- "Record first, notify second": one row per attempt, sent or failed,
-- never thrown away. sent_at is set only when status = 'sent' (see
-- logDonationEmail's INSERT).
CREATE TABLE IF NOT EXISTS donation_email_logs (
  id                  BIGSERIAL PRIMARY KEY,
  donation_id         INTEGER NOT NULL REFERENCES donations(id),
  certificate_id      BIGINT REFERENCES section18a_certificates(id),
  email_type          TEXT NOT NULL,
  recipient           TEXT NOT NULL,
  subject             TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_id TEXT,
  error_message       TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donation_email_logs_donation
  ON donation_email_logs(donation_id);

CREATE INDEX IF NOT EXISTS idx_donation_email_logs_created
  ON donation_email_logs(created_at DESC);

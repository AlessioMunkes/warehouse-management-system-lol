
-- =============================================================
-- server/database/migrations/022_extend_donation_email_logs.sql
--
-- Extend donation_email_logs for persistent email history.
-- Safe to run on existing databases.
-- Keeps existing enum/check values unchanged.
-- =============================================================

-- Donor + recipient metadata
ALTER TABLE donation_email_logs
ADD COLUMN IF NOT EXISTS donor_id BIGINT;

ALTER TABLE donation_email_logs
ADD COLUMN IF NOT EXISTS recipient_email TEXT;

ALTER TABLE donation_email_logs
ADD COLUMN IF NOT EXISTS recipient_name TEXT;

-- Gmail identifiers
ALTER TABLE donation_email_logs
ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;

ALTER TABLE donation_email_logs
ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;

-- User that initiated the send
ALTER TABLE donation_email_logs
ADD COLUMN IF NOT EXISTS sent_by_user_id INTEGER
REFERENCES users(id);

-- Backfill existing rows
UPDATE donation_email_logs
SET recipient_email = recipient
WHERE recipient_email IS NULL
  AND recipient IS NOT NULL;

UPDATE donation_email_logs
SET gmail_message_id = provider_message_id
WHERE gmail_message_id IS NULL
  AND provider_message_id IS NOT NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_donation_email_logs_created_desc
ON donation_email_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_donation_email_logs_type_status
ON donation_email_logs(email_type, status);

CREATE INDEX IF NOT EXISTS idx_donation_email_logs_recipient_email
ON donation_email_logs(recipient_email);
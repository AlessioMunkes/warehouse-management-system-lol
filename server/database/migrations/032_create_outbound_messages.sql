-- =============================================================
-- server/database/migrations/032_create_outbound_messages.sql
--
-- One record of every message the system sends, whatever sent it.
--
-- Before this, each sender recorded its own outcome in its own place:
-- donation_email_logs, finance_report_email_logs,
-- ecd_collection_reminders, columns on user_invites / password_resets /
-- purchase_orders — and scheduled reports nowhere. "Did that email go
-- out?" meant knowing which of five tables to look in. Every send now
-- goes through features/communications/communications.service.js,
-- which writes one row here.
--
-- THE OLD LOGS STAY. Each sender still writes its own record as it
-- always has; this table is written alongside them, not instead of
-- them, until each move is verified. Nothing reads the old tables any
-- less than before.
--
--   channel        'email' today; the column is here so SMS or push can
--                  share the history without another table
--   type           what kind of message — the keys in
--                  features/communications/messageTypes.js
--   recipient      the address it went to
--   subject        what the recipient saw as the subject, for finding it
--   status         'sent' | 'stubbed' (EMAIL_ENABLED off) | 'failed'
--   error          the provider's reason, when it failed
--   related_type / related_id
--                  the record it was about (a purchase order, an
--                  invite, a donation), for linking back
--   sent_by        the user whose action sent it, when there was one
--   attempted_at   when the send was tried
--
-- Idempotent: safe to run more than once.
-- =============================================================

CREATE TABLE IF NOT EXISTS outbound_messages (
  id            BIGSERIAL PRIMARY KEY,
  channel       TEXT NOT NULL DEFAULT 'email',
  type          TEXT NOT NULL,
  recipient     TEXT,
  subject       TEXT,
  status        TEXT NOT NULL,
  error         TEXT,
  related_type  TEXT,
  related_id    TEXT,
  sent_by       INTEGER REFERENCES users(id),
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outbound_messages_status_check'
  ) THEN
    ALTER TABLE outbound_messages
      ADD CONSTRAINT outbound_messages_status_check
      CHECK (status IN ('sent', 'stubbed', 'failed'));
  END IF;
END $$;

-- The history screen reads newest first, optionally by type.
CREATE INDEX IF NOT EXISTS idx_outbound_messages_attempted
  ON outbound_messages (attempted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_type_attempted
  ON outbound_messages (type, attempted_at DESC, id DESC);
-- "Every message about this purchase order / invite / donation".
CREATE INDEX IF NOT EXISTS idx_outbound_messages_related
  ON outbound_messages (related_type, related_id);

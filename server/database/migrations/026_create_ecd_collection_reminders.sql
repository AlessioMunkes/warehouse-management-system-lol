CREATE TABLE IF NOT EXISTS ecd_collection_reminders (
  id              SERIAL PRIMARY KEY,
  ecd_id          INTEGER NOT NULL REFERENCES ecd_centres(id),
  collection_date DATE NOT NULL,
  channel         VARCHAR(30) NOT NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  sent_at         TIMESTAMPTZ,
  provider_message_id TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ecd_id, collection_date, channel)
);

CREATE INDEX IF NOT EXISTS idx_ecd_collection_reminders_collection_date
  ON ecd_collection_reminders(collection_date);

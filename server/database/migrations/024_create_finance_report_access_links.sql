BEGIN;

CREATE TABLE IF NOT EXISTS finance_report_access_links (
  id           SERIAL PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  revoked_by   INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_finance_report_access_links_active
  ON finance_report_access_links (token_hash)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS finance_report_email_settings (
  id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  recipient_email         TEXT,
  updated_by              INTEGER REFERENCES users(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_report_email_logs (
  id                      SERIAL PRIMARY KEY,
  recipient_email         TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  finance_link_id         INTEGER REFERENCES finance_report_access_links(id),
  provider_message_id     TEXT,
  error_message           TEXT,
  sent_by_user_id         INTEGER REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_finance_report_email_logs_created_at
  ON finance_report_email_logs (created_at DESC);

COMMIT;

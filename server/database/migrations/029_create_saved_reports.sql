-- Saved Operations reports: a manager's own shortlist of reports, some
-- pinned to the top of the page, some emailed to them on a schedule.
-- `spec` is what to run (a prepared report, a custom report or a
-- comparison); `preset` is the period when opened on the page. A
-- scheduled email always covers the last full week or month.
CREATE TABLE IF NOT EXISTS saved_reports (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(120) NOT NULL,
  kind          VARCHAR(20) NOT NULL CHECK (kind IN ('report', 'custom', 'comparison')),
  spec          JSONB NOT NULL,
  preset        VARCHAR(20) NOT NULL DEFAULT 'last_3m',
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  schedule      VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (schedule IN ('none', 'weekly', 'monthly')),
  last_sent_at  TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_user ON saved_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_schedule ON saved_reports(schedule) WHERE schedule <> 'none';

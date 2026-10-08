-- ─────────────────────────────────────────────────────────────
-- 040_create_idempotency_keys.sql
--
-- Lets the server recognise a submission it has already handled.
--
-- A phone with no signal keeps what a worker submitted and sends it
-- when the signal returns (client/src/services/outbox.js). A send can
-- be interrupted after the server acted but before the phone heard
-- back, so the same submission can arrive twice. Each one carries a
-- key the phone made up; the first time the key is seen the work is
-- done and the answer stored here, and a repeat gets that stored answer
-- instead of being done again.
--
-- Receiving, dispatch and donation intake already do this with a
-- column of their own. This table is for everything else the floor
-- submits: packing, decanting, benevolent requests, Feed the Soil.
-- See server/src/middleware/idempotency.middleware.js.
--
-- status_code and response are empty while the first attempt is still
-- running.
--
-- Additive only: one new table.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 8 AND 100),
  scope       TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  status_code SMALLINT,
  response    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Old keys are cleared by age.
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys (created_at);

-- Phones that asked for push notifications. One row per browser
-- subscription (a phone's installed app), tied to whoever is signed in
-- on it: a shared floor phone moves to the next worker when they sign
-- in, and signing out removes the row so the last worker stops getting
-- alerts. The endpoint is unique because a push service hands out one
-- per browser; subscribing again on the same phone updates the row.
--
-- Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint         TEXT NOT NULL UNIQUE,
  p256dh           TEXT NOT NULL,
  auth             TEXT NOT NULL,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

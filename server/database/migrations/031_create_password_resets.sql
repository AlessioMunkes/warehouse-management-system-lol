-- =============================================================
-- server/database/migrations/031_create_password_resets.sql
--
-- Self-service password reset by email, replacing LoginPage.jsx's
-- "contact your admin" modal. Modelled directly on migration 023's
-- user_invites: token hashed at rest, resolved publicly by hash
-- before any session exists.
--
-- ONE ROW PER REQUEST, not one row per user. Unlike user_invites'
-- overwrite-in-place resend, a reset has no admin-facing "resend"
-- action — a new request from the same user does not mutate an
-- existing row, it supersedes it (see superseded_at) and inserts a
-- new one, so the full request history survives for audit.
--
-- token_hash is not UNIQUE, same reasoning as
-- idx_user_invites_token_hash: a SHA-256 collision guards against
-- nothing realistic, so this is a plain lookup index.
--
-- NOT ENFORCED HERE: single-live-token-per-user. The database allows
-- more than one live (used_at IS NULL AND superseded_at IS NULL) row
-- per user_id — the service is responsible for superseding a user's
-- prior live rows before inserting a new one, and for throttling
-- repeat requests, so a raced pair of requests can't leave two live
-- tokens outstanding for the same account.
--
-- Idempotent: safe to run more than once.
-- =============================================================

CREATE TABLE IF NOT EXISTS password_resets (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  token_hash          TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  used_at             TIMESTAMPTZ,
  -- Set when a newer request for the same user makes this one no
  -- longer current. Distinct from used_at (this token was never
  -- consumed) and distinct from simply expiring by time — see
  -- passwordReset.service.js's loadValidReset, which reports it as
  -- its own reason ('superseded') rather than folding it into
  -- 'expired'.
  superseded_at       TIMESTAMPTZ,
  requested_ip        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'sent' | 'stubbed' | 'failed' | NULL (no attempt recorded —
  -- e.g. the request was throttled before an email was ever composed).
  email_status        TEXT,
  email_error         TEXT,
  email_attempted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash
  ON password_resets(token_hash);

-- Matches exactly what the service needs to ask: "does this user have
-- a live request right now" — the per-email throttle window check and
-- the supersede-before-insert step both filter on this same shape.
CREATE INDEX IF NOT EXISTS idx_password_resets_active
  ON password_resets(user_id, created_at DESC)
  WHERE used_at IS NULL AND superseded_at IS NULL;

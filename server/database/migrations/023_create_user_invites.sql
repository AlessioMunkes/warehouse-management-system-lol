-- =============================================================
-- server/database/migrations/023_create_user_invites.sql
--
-- Email-invite account creation, replacing admin-set passwords.
--
--   users          + email (nullable — existing rows have none;
--                    unique, case-insensitively, where not null)
--   user_invites     one row per invite. No users row exists until
--                    the invite is accepted — username is NOT NULL
--                    UNIQUE on users, so a placeholder account can't
--                    be created before someone picks a username.
--
-- NOT ENFORCED HERE: two open invites to the same email. The database
-- allows it — the service layer is responsible for checking and
-- returning a clear message, so it can say "already invited" instead
-- of a raw constraint violation.
--
-- Idempotent: safe to run more than once.
-- =============================================================

-- ── users: email is contact info only, NOT the login identifier ──
-- username (existing column) stays what login.route.js checks.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Case-insensitive uniqueness, same reasoning as findUserByUsername's
-- LOWER(username) = LOWER($1) in user.repository.js: two accounts
-- differing only in case would be indistinguishable at invite time.
-- A plain UNIQUE constraint already allows multiple NULLs (rows with
-- no email), so nothing extra is needed for "nullable, unique where
-- present" beyond making the index partial and case-folded.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

-- ── user_invites ──────────────────────────────────────────────
-- role is fixed at invite time and never taken from the accept
-- request body (see user.controller.js's acceptInvite) — CHECK
-- mirrors the same three values user.service.js validates against.
--
-- One row per invite, not one row per send: resend overwrites
-- token_hash/expires_at/last_sent_at in place and bumps resend_count,
-- so a stale link can never still resolve after a resend.
--
-- revoked_at and accepted_at are mutually exclusive in practice
-- (enforced by the service, not a DB constraint) — both existing as
-- separate nullable columns keeps "revoked" distinct from "expired"
-- in the admin UI rather than collapsing both into an expiry check.
CREATE TABLE IF NOT EXISTS user_invites (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('warehouse_worker', 'manager', 'admin')),
  token_hash       TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  accepted_at      TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  invited_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resend_count     INTEGER NOT NULL DEFAULT 0
);

-- Not UNIQUE: a SHA-256 hash collision guards against nothing
-- realistic, so this is a plain lookup index for accept-by-token
-- (hash the incoming token, match here).
CREATE INDEX IF NOT EXISTS idx_user_invites_token_hash
  ON user_invites(token_hash);

-- Partial, matching the admin's "pending invites" query exactly
-- (WHERE accepted_at IS NULL AND revoked_at IS NULL) — a btree on
-- two columns that are almost always NULL would serve that query
-- poorly as a plain composite index.
CREATE INDEX IF NOT EXISTS idx_user_invites_pending
  ON user_invites(created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

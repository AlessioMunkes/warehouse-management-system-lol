-- ─────────────────────────────────────────────────────────────
-- 046_community_request_logged_by.sql
--
-- Who logged a benevolent request.
--
-- A request recorded who approved it, who was assigned to pack it and
-- who confirmed it, but not who took the call and wrote it down. The
-- person logging it now signs it off, and this is where that is kept:
-- the user, so the request can be traced back to them. The sign-off is
-- also written to audit_log, which is the record of the act itself.
--
-- Nullable, with no backfill: requests logged before this have no
-- known logger, and inventing one would be worse than saying so.
--
-- Additive only: one new column.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS logged_by INTEGER REFERENCES users(id);

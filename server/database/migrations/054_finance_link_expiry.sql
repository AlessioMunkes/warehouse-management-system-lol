-- ─────────────────────────────────────────────────────────────
-- 054_finance_link_expiry.sql
--
-- A finance report link stops working 30 days after it is made, and
-- each open is counted.
--
-- The link is a bearer token: whoever holds the URL can read the
-- figures, with no sign-in. Until now it worked until someone made a
-- new one or revoked it, so a forwarded email kept working for good.
--
--   expires_at      when the link stops opening
--   last_opened_at  the last time the report was read through it
--   open_count      how many times it has been read
--
-- Links made before this get 30 days from when they were made, so
-- one older than that stops working now. Send a new one from
-- Finance if it is still needed.
--
-- Additive: three columns, filled for the existing rows.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE finance_report_access_links
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

UPDATE finance_report_access_links
   SET expires_at = created_at + INTERVAL '30 days'
 WHERE expires_at IS NULL;

ALTER TABLE finance_report_access_links
  ALTER COLUMN expires_at SET NOT NULL;

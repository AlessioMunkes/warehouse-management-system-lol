-- =============================================================
-- server/database/migrations/020_add_gmail_display_name.sql
--
-- Adds a configurable display_name to gmail_connections so the
-- organisation can set the sender name shown in donation emails.
--
-- Idempotent: safe to run more than once.
-- =============================================================

ALTER TABLE gmail_connections ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

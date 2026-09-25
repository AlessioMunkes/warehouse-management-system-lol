-- =============================================================
-- server/database/migrations/028_add_finance_email_status_to_purchase_orders.sql
--
-- Interim "email PO to Finance" flow — API-based QuickBooks PO
-- creation is blocked pending a spike (see README), so Finance is
-- emailed the PO details and captures it in QuickBooks manually.
-- These columns record the outcome of that send so a PO list can
-- show whether Finance was actually notified.
--
-- finance_email_status is one of:
--   'sent'   — the email went out via the connected Gmail account
--   'failed' — a send was attempted and failed
--   NULL     — no attempt has been made yet
--
-- Numbered 028: 025-027 are already taken on feature/notification-fix
-- (022 and 024 collide across other branches too), so this is the
-- next number that is free everywhere.
--
-- Idempotent: safe to run more than once.
-- =============================================================

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS finance_email_status TEXT
  CHECK (finance_email_status IN ('sent', 'failed'));
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS finance_email_error TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS finance_email_attempted_at TIMESTAMPTZ;

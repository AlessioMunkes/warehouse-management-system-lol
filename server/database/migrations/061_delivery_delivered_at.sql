-- ─────────────────────────────────────────────────────────────
-- 061_delivery_delivered_at.sql
--
-- When a delivery arrived: the date AND the time.
--
-- delivery_notes.delivery_date is a calendar day the worker could
-- change. Receiving now records the moment the delivery was signed in
-- on the phone, in delivered_at, and works the day out from it, so
-- neither can be typed. created_at stays what it was: when the server
-- saved the note, which for a delivery recorded with no signal is
-- later than the delivery itself.
--
-- Deliveries already recorded take created_at, the nearest moment on
-- record.
--
-- Additive: one column, filled for existing rows.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE delivery_notes
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

UPDATE delivery_notes SET delivered_at = created_at WHERE delivered_at IS NULL;

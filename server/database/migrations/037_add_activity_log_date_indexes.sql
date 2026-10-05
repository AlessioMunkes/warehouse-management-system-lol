-- 037_add_activity_log_date_indexes.sql
--
-- The admin Activity log filters its timeline by warehouse-time date:
--   (created_at AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN from AND to
-- A plain index on created_at cannot serve that expression; an index on the
-- expression itself can (stock_movements and donations already have one).
--
-- Only the two sources that will keep growing get one: audit_log, which had
-- only its primary key, and picking_events, one row per step on every pallet.
-- The others are a few rows a week.
CREATE INDEX IF NOT EXISTS idx_audit_log_created_sast
  ON audit_log (((created_at AT TIME ZONE 'Africa/Johannesburg')::date));

CREATE INDEX IF NOT EXISTS idx_picking_events_created_sast
  ON picking_events (((created_at AT TIME ZONE 'Africa/Johannesburg')::date));

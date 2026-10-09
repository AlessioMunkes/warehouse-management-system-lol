-- ─────────────────────────────────────────────────────────────
-- 043_add_purchase_order_follow_up.sql
--
-- A follow-up order: a second purchase order for what was short on the
-- first. follow_up_of points at the order it follows.
--
-- How an order now moves when a delivery comes in short:
--
--   approved ── short delivery ──> follow_up_required
--   follow_up_required ── a manager creates the follow-up order ──> partially_received
--   the follow-up order is fully received ──> both become completed
--
-- A follow-up can itself come in short and get a follow-up of its own;
-- completing the last one completes every order behind it.
--
-- Additive only: one new column and its index.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS follow_up_of INTEGER REFERENCES purchase_orders(id);

CREATE INDEX IF NOT EXISTS purchase_orders_follow_up_of_idx
  ON purchase_orders (follow_up_of) WHERE follow_up_of IS NOT NULL;

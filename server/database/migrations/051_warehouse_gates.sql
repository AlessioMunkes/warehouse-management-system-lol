-- ─────────────────────────────────────────────────────────────
-- 051_warehouse_gates.sql
--
-- Two more kinds of area for the warehouse map (migrations 048, 049):
--
--   dispatch_gate    where pallets leave. A truck stands at it on the map
--                    while packed pallets wait to be collected today.
--   receiving_gate   where deliveries come in. A truck stands at it while
--                    a purchase order is expected today, or is late.
--
-- They hold no stock and take no capacity, like a door. What happens at
-- them is read from what the system already records (packed slips,
-- purchase orders, delivery notes); nothing new is stored.
--
-- Additive only: one widened check.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE warehouse_areas DROP CONSTRAINT IF EXISTS warehouse_areas_kind_check;
ALTER TABLE warehouse_areas
  ADD CONSTRAINT warehouse_areas_kind_check
  CHECK (kind IN ('dry', 'cold', 'floor', 'staging', 'door', 'dispatch_gate', 'receiving_gate'));

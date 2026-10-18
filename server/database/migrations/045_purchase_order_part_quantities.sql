-- ─────────────────────────────────────────────────────────────
-- 045_purchase_order_part_quantities.sql
--
-- An order line can be a part quantity: 12.5 kg of maize meal.
--
-- purchase_order_items.expected_quantity was INTEGER, so a loose
-- product bought by weight could only be ordered in whole kilograms
-- even though receiving, packing and the gate all take a part quantity
-- for it. It becomes NUMERIC, held to three decimal places, the same
-- precision stock is kept in.
--
-- Which products may be a part quantity is not decided here. That is
-- products.is_decantable (migration 044), checked by the service.
--
-- Existing rows are whole numbers and stay exactly as they are.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE purchase_order_items
  ALTER COLUMN expected_quantity TYPE NUMERIC USING expected_quantity::numeric;

ALTER TABLE purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_expected_quantity_places;

ALTER TABLE purchase_order_items
  ADD CONSTRAINT purchase_order_items_expected_quantity_places
  CHECK (expected_quantity = round(expected_quantity, 3));

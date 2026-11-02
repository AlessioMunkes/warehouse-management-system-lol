-- ─────────────────────────────────────────────────────────────
-- 066_product_preferred_supplier.sql
--
-- Who a product is usually ordered from.
--
-- A product could be linked to several suppliers (supplier_products),
-- and the reorder planner guessed which one from the latest order. A
-- manager now names the product's preferred supplier, and reordering
-- uses it: the planner's order sheet and Create purchase orders, and
-- Raise purchase order from Inventory's low stock.
--
-- Additive: one nullable column. A supplier that is deleted leaves the
-- product with no preference rather than blocking the delete.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS preferred_supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL;

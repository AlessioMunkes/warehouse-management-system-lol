-- ─────────────────────────────────────────────────────────────
-- 039_create_supplier_products.sql
--
-- What each supplier supplies: one row per (supplier, product). A
-- purchase order to a supplier with rows here may only carry those
-- products; a supplier with none listed can be ordered from freely, so
-- an unfinished list never stops an order being raised.
--
-- suppliers.category stays what it was — a free-text description
-- ("Rice, sugar, lentils", "Roller doors") — and covers the suppliers
-- of things that are not stock products at all.
--
-- Additive only: one new table.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_products (
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS supplier_products_product_idx ON supplier_products (product_id);

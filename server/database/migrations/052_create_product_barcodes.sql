-- ─────────────────────────────────────────────────────────────
-- 052_create_product_barcodes.sql
--
-- The barcodes printed on stock, each pointing at one product, so a
-- scan can stand in for picking the product by name.
--
-- A table and not a column on products, because:
--   - the same product (1 kg rice) arrives from different suppliers
--     under different barcodes, so one product can have many
--   - most donated stock has none, so a product can have zero
--   - a case and the single item inside it carry different barcodes:
--     units_per_scan says how many of the product's own unit one scan
--     of this code means (1 for the bag, 12 for the box of 12)
--
--   code            digits as printed (EAN-13, EAN-8, UPC-A, UPC-E,
--                   GTIN-14) or a supplier's own Code 128 text. Stored
--                   normalised by the server (productCode.js), so a
--                   12-digit UPC and the same code read as EAN-13 are
--                   one row. Unique: one code, one product.
--   supplier_id     whose packaging it came on, when known
--   created_by      who linked it (a worker linking a code at the bay,
--                   or an admin on the product)
--
-- Nothing else reads it: every existing query names its tables, so no
-- screen, report or pallet changes until it is used.
--
-- Additive only: one new table and an index.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_barcodes (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  code            VARCHAR(64) NOT NULL UNIQUE,
  units_per_scan  NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (units_per_scan > 0),
  supplier_id     INTEGER REFERENCES suppliers(id),
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_barcodes_product_id_idx ON product_barcodes (product_id);

-- ─────────────────────────────────────────────────────────────
-- 056_product_barcode_food_facts.sql
--
-- What the public Open Food Facts database says each linked barcode
-- is, kept beside the link (product_barcodes, migration 052).
--
-- Why: when a barcode nobody has seen is scanned, the system suggests
-- which stock item it belongs to (features/barcodeMatch). Brand B's
-- beans are matched to the stock item that already holds Brand A's
-- beans by comparing what Open Food Facts says about the two packs:
-- the same kind of food, the same size. That needs what it said about
-- Brand A's code, which is what these columns keep. They are filled
-- when a code is linked, once, and never relied on: a code Open Food
-- Facts does not know just has them empty.
--
--   food_name        its product name there, e.g. "Baked beans in tomato sauce"
--   food_brand       the first brand it lists
--   food_quantity    the pack size as printed, e.g. "410 g"
--   food_weight_kg   that size in kg, when it is a weight
--   food_categories  its category tags, most general first, without the
--                    language prefix: {"canned-foods", "baked-beans"}
--   food_checked_at  when it was asked, answered or not, so it is not
--                    asked again on every scan
--
-- Additive only: six new nullable columns.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS food_name TEXT;
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS food_brand TEXT;
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS food_quantity TEXT;
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS food_weight_kg NUMERIC(10, 3);
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS food_categories TEXT[];
ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS food_checked_at TIMESTAMPTZ;

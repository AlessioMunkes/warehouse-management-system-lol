-- ─────────────────────────────────────────────────────────────
-- 049_warehouse_area_capacity.sql
--
-- The warehouse map's areas learn three things (migration 048 made them):
--
--   kind 'staging'         a pallet staging area: where packed pallets
--                          wait for collection. The map puts every
--                          packed, not yet dispatched pallet in one.
--   capacity_kg            how much a dry store, cold room or floor area
--                          holds, by weight. Empty: not set.
--   pallet_spaces          how many pallets a staging area holds.
--   preferred_product_ids  the stock an area is meant for, by product
--   preferred_categories   or by product category. Stock nobody has
--                          counted into an area is shown in the area it
--                          is meant for, as expected rather than counted.
--
-- The product ids are not a foreign key: a preference for a product
-- that is later archived is simply ignored by the map.
--
-- Additive only: one widened check, four new columns.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE warehouse_areas DROP CONSTRAINT IF EXISTS warehouse_areas_kind_check;
ALTER TABLE warehouse_areas
  ADD CONSTRAINT warehouse_areas_kind_check CHECK (kind IN ('dry', 'cold', 'floor', 'staging', 'door'));

ALTER TABLE warehouse_areas
  ADD COLUMN IF NOT EXISTS capacity_kg NUMERIC CHECK (capacity_kg IS NULL OR capacity_kg > 0);
ALTER TABLE warehouse_areas
  ADD COLUMN IF NOT EXISTS pallet_spaces INTEGER CHECK (pallet_spaces IS NULL OR pallet_spaces > 0);
ALTER TABLE warehouse_areas
  ADD COLUMN IF NOT EXISTS preferred_product_ids INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE warehouse_areas
  ADD COLUMN IF NOT EXISTS preferred_categories TEXT[] NOT NULL DEFAULT '{}';

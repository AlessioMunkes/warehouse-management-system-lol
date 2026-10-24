-- ─────────────────────────────────────────────────────────────
-- 050_add_ecd_centre_location.sql
--
-- Where each beneficiary centre is, for the manager's Impact map. An
-- admin sets it on the Centre locations screen; a one-off script
-- (scripts/locateEcdCentres.mjs) fills in what could be found.
--
--   address, suburb        as a person writes them
--   latitude, longitude    the pin. Both or neither. South Africa only:
--                          a pin outside the country is a typing error
--   location_source        how the pin was set:
--                            manual    an admin placed or moved it
--                            geocoded  looked up from the address
--                            imported  loaded from researched data
--   location_note          where the address came from, for checking
--   location_updated_at/by who last changed any of it
--
-- The old free-text `location` column stays as it is, unused.
-- Nothing that reads ecd_centres today selects these columns (every
-- query names its columns), so no existing screen, report or pallet
-- changes.
--
-- Additive only: eight new columns and two checks.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE ecd_centres ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE ecd_centres ADD COLUMN IF NOT EXISTS suburb TEXT;
ALTER TABLE ecd_centres ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6);
ALTER TABLE ecd_centres ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);
ALTER TABLE ecd_centres ADD COLUMN IF NOT EXISTS location_source TEXT;
ALTER TABLE ecd_centres ADD COLUMN IF NOT EXISTS location_note TEXT;
ALTER TABLE ecd_centres ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
ALTER TABLE ecd_centres ADD COLUMN IF NOT EXISTS location_updated_by INTEGER REFERENCES users(id);

ALTER TABLE ecd_centres DROP CONSTRAINT IF EXISTS ecd_centres_pin_check;
ALTER TABLE ecd_centres ADD CONSTRAINT ecd_centres_pin_check CHECK (
  (latitude IS NULL AND longitude IS NULL)
  OR (latitude BETWEEN -35 AND -22 AND longitude BETWEEN 16 AND 33)
);

ALTER TABLE ecd_centres DROP CONSTRAINT IF EXISTS ecd_centres_location_source_check;
ALTER TABLE ecd_centres ADD CONSTRAINT ecd_centres_location_source_check CHECK (
  location_source IS NULL OR location_source IN ('manual', 'geocoded', 'imported')
);

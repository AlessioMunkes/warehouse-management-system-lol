-- ─────────────────────────────────────────────────────────────
-- 070_fts_dropoff_any_place.sql
--
-- One Feed the Soil QR code for every place, as well as one per site.
--
-- 069 tied every drop-off to a site the QR code named. Ladles of Love
-- do not always have set sites: a stall is somewhere new each week. A
-- general poster opens the same form with a dropdown of the open
-- sites and "Somewhere else", where the person types the place.
--
--   drop_point_id   now optional: null when the place was typed.
--   place_name      the place typed instead of a site. One of the two
--                   is always there.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE fts_dropoffs
  ALTER COLUMN drop_point_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS place_name varchar(120);

ALTER TABLE fts_dropoffs DROP CONSTRAINT IF EXISTS fts_dropoffs_site_or_place;
ALTER TABLE fts_dropoffs
  ADD CONSTRAINT fts_dropoffs_site_or_place
  CHECK (drop_point_id IS NOT NULL OR (place_name IS NOT NULL AND btrim(place_name) <> ''));

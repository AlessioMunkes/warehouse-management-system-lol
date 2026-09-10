-- 018_add_receiving_location_and_expiry.sql
--
-- delivery_note_items gains the two fields the receiving screen has
-- been collecting since it was written and the server has been
-- discarding on every submit.
--
--   storage_area  BR-07 — a receiving task closes only once a storage
--                 location is assigned to every item. ReceivingFlow.jsx
--                 sends one of the LOCATIONS slugs per line.
--   expiry_date   BR-06 — FEFO needs something to sort on. Only lines
--                 whose product is_perishable carry one.
--
-- storage_area is the slug, not a foreign key to storage_locations.
-- That table's `area` column holds prose names ('Cold Storage',
-- 'Intake Holding Area' — see donation.repository.getLocationIdForArea)
-- while the receiving screen and reportCatalog.STORAGE_AREAS both
-- speak in slugs. Storing the slug keeps this column consistent with
-- the vocabulary the rest of the application already uses; an FK can
-- be added later once storage_locations has been reconciled.
--
-- Idempotent — safe to run more than once.

ALTER TABLE delivery_note_items
  ADD COLUMN IF NOT EXISTS storage_area VARCHAR(50);

ALTER TABLE delivery_note_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Added separately from the column so a re-run doesn't trip over an
-- existing constraint of the same name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.delivery_note_items'::regclass
      AND conname  = 'delivery_note_items_storage_area_check'
  ) THEN
    ALTER TABLE delivery_note_items
      ADD CONSTRAINT delivery_note_items_storage_area_check
      CHECK (storage_area IS NULL OR storage_area IN
        ('cold_room', 'dry_store', 'fts_section', 'mezzanine', 'boardroom'));
  END IF;
END $$;

-- Partial index: the FEFO question is only ever asked of dated rows.
CREATE INDEX IF NOT EXISTS idx_delivery_note_items_expiry
  ON delivery_note_items (expiry_date)
  WHERE expiry_date IS NOT NULL;

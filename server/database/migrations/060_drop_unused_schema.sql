-- ─────────────────────────────────────────────────────────────
-- 060_drop_unused_schema.sql
--
-- Tables, views, a type and columns that no code reads or writes.
--
-- Each one was checked against the server, the client, the scripts and
-- the tests (October 2026 database audit). None appears in any query or
-- any field the client shows. Kept on purpose although unused today:
-- volunteers.consent_given and volunteers.retention_delete_after (for a
-- POPIA retention job) and pending_donations.commit_incomplete_at (the
-- Reconciliation tab shows it).
--
-- Not reversible: the columns' contents go with them. In the dev
-- database the only filled ones were picking_slip_items.dispatched_quantity,
-- purchase_orders.status_changed_by, storage_locations.capacity_note,
-- supplier_products.added_at, stock_count_lines.client_uuid,
-- stock_counts.submitted_at, quickbooks_sync_queue.next_attempt_at and
-- donations.quickbooks_sync_status (always 'unsynced').
--
-- No CASCADE anywhere: if anything still depends on one of these in some
-- warehouse database, the migration stops there and changes nothing.
-- ─────────────────────────────────────────────────────────────

-- Views nothing queries.
DROP VIEW IF EXISTS vw_ecd_collection_history;
DROP VIEW IF EXISTS vw_low_stock;

-- operational_goals: its feature was removed. schema_migration_provenance:
-- notes from manual alignments before the migration runner existed.
DROP TABLE IF EXISTS operational_goals;
DROP TABLE IF EXISTS schema_migration_provenance;

-- The donation_category enum: donations.donation_category is a text
-- column, and no column uses the type. Left alone if one ever does.
DO $$
BEGIN
  IF to_regtype('public.donation_category') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_attribute a
        WHERE a.atttypid = 'public.donation_category'::regtype
          AND a.attnum > 0 AND NOT a.attisdropped
     ) THEN
    DROP TYPE public.donation_category;
  END IF;
END
$$;

-- Donor address and identity fields the intake form never saved. The
-- Section 18A form keeps what the donor enters in section_18a_donor_form.
-- The QuickBooks columns were never written: syncing uses
-- quickbooks_sync_queue and quickbooks_object_map.
ALTER TABLE donations
  DROP COLUMN IF EXISTS donor_cellphone,
  DROP COLUMN IF EXISTS donor_address_line1,
  DROP COLUMN IF EXISTS donor_address_line2,
  DROP COLUMN IF EXISTS donor_city_suburb,
  DROP COLUMN IF EXISTS donor_province,
  DROP COLUMN IF EXISTS donor_postal_code,
  DROP COLUMN IF EXISTS donor_country,
  DROP COLUMN IF EXISTS donor_identification_type,
  DROP COLUMN IF EXISTS donor_identification_number,
  DROP COLUMN IF EXISTS donor_identification_country_of_issue,
  DROP COLUMN IF EXISTS quickbooks_sync_status,
  DROP COLUMN IF EXISTS quickbooks_sync_reference_id,
  DROP COLUMN IF EXISTS quickbooks_sync_error,
  DROP COLUMN IF EXISTS quickbooks_synced_at,
  DROP COLUMN IF EXISTS quickbooks_sync_attempted_at,
  DROP COLUMN IF EXISTS section_18a_deemed_value_zar;

ALTER TABLE pending_donations
  DROP COLUMN IF EXISTS donor_cellphone,
  DROP COLUMN IF EXISTS donor_address_line1,
  DROP COLUMN IF EXISTS donor_address_line2,
  DROP COLUMN IF EXISTS donor_city_suburb,
  DROP COLUMN IF EXISTS donor_province,
  DROP COLUMN IF EXISTS donor_postal_code,
  DROP COLUMN IF EXISTS donor_country,
  DROP COLUMN IF EXISTS donor_identification_type,
  DROP COLUMN IF EXISTS donor_identification_number,
  DROP COLUMN IF EXISTS donor_identification_country_of_issue;

ALTER TABLE donors
  DROP COLUMN IF EXISTS tax_reference,
  DROP COLUMN IF EXISTS consent_given;

-- A cohort-override flow on delivery receipts that was never built. Its
-- check (an override needs a reason and an approver) goes with it;
-- override_reason itself stays, it is used.
ALTER TABLE delivery_receipts DROP CONSTRAINT IF EXISTS dr_override_requires_reason;
ALTER TABLE delivery_receipts
  DROP COLUMN IF EXISTS collector_contact,
  DROP COLUMN IF EXISTS is_cohort_override,
  DROP COLUMN IF EXISTS override_approved_by,
  DROP COLUMN IF EXISTS auto_flagged_at;

ALTER TABLE donation_allocations
  DROP COLUMN IF EXISTS allocation_status,
  DROP COLUMN IF EXISTS stock_movement_id;

ALTER TABLE donation_items             DROP COLUMN IF EXISTS source_reference;
ALTER TABLE picking_slip_items         DROP COLUMN IF EXISTS dispatched_quantity;
ALTER TABLE purchase_orders            DROP COLUMN IF EXISTS status_changed_by;
ALTER TABLE quickbooks_sync_queue      DROP COLUMN IF EXISTS next_attempt_at;
ALTER TABLE recipe_own_order_centres   DROP COLUMN IF EXISTS added_at;
ALTER TABLE stock_counts               DROP COLUMN IF EXISTS submitted_at;
ALTER TABLE storage_locations          DROP COLUMN IF EXISTS capacity_note;
ALTER TABLE supplier_products          DROP COLUMN IF EXISTS added_at;
ALTER TABLE stock_count_lines
  DROP COLUMN IF EXISTS client_uuid,
  DROP COLUMN IF EXISTS adjustment_movement_id;

-- The free-text location from before migration 050 added the address,
-- suburb and pin. Empty, and nothing reads it.
ALTER TABLE ecd_centres                DROP COLUMN IF EXISTS location;

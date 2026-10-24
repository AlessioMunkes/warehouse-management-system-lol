-- ─────────────────────────────────────────────────────────────
-- 059_tidy_indexes.sql
--
-- Duplicate indexes out, one missing index in.
--
-- Over time the same columns were indexed two or three times under
-- different names (idx_pks_status and idx_pslip_status, for example).
-- A copy speeds nothing up and makes every write maintain it. Each
-- index dropped here has a twin on exactly the same columns that stays:
-- where one of the pair backs a primary key or unique constraint, that
-- one is kept; otherwise the one queries were already using is kept.
--
--   dropped                               kept
--   idx_attendance_booking_id             uq_attendance_booking (unique)
--   idx_certificate_settings_id           certificate_settings_pkey
--   idx_dl_decanting                      idx_dl_record
--   idx_dr_week, idx_dr_week_of           idx_decanting_records_week_of
--   idx_dispatch_events_slip              dispatch_events_picking_slip_id_key (unique)
--   idx_donation_email_logs_created_desc  idx_donation_email_logs_created
--   idx_di_donation                       idx_donation_items_donation
--   idx_di_product,
--   idx_donation_items_product            idx_donation_items_product_id
--   idx_donations_s18a_status             idx_donations_section_18a_status
--   idx_donations_programme               idx_donations_programme_id
--   idx_pke_slip                          idx_pevent_slip
--   idx_pksi_slip                         idx_psi_slip
--   idx_pksi_product                      idx_psi_product
--   idx_pks_dispatch_date, idx_pslip_date idx_picking_slips_dispatch_date
--   idx_pks_status                        idx_pslip_status
--   idx_pks_assigned_to                   idx_pslip_assigned
--   idx_reporting_factors_lookup          reporting_factors_factor_key_effective_from_key (unique)
--   idx_reporting_queries_outcome         idx_reporting_queries_outcome_date
--   idx_stock_count_lines_count_product   scl_one_line_per_product (unique)
--   idx_stock_counts_date                 idx_sc_date
--   idx_sm_created                        idx_sm_created_at
--   idx_sm_reference                      idx_sm_ref
--   idx_users_username                    users_username_key (unique)
--
-- Added: dispatch_event_lines.picking_slip_item_id, a foreign key on a
-- table of about 24,000 rows that had no index, so deleting or
-- checking a picking slip line scanned the whole table.
-- ─────────────────────────────────────────────────────────────
-- A copy is dropped only where its twin exists, so a database that
-- drifted and has just one of the pair keeps it.
DO $$
DECLARE
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['idx_attendance_booking_id', 'uq_attendance_booking'],
    ['idx_certificate_settings_id', 'certificate_settings_pkey'],
    ['idx_dl_decanting', 'idx_dl_record'],
    ['idx_dr_week', 'idx_decanting_records_week_of'],
    ['idx_dr_week_of', 'idx_decanting_records_week_of'],
    ['idx_dispatch_events_slip', 'dispatch_events_picking_slip_id_key'],
    ['idx_donation_email_logs_created_desc', 'idx_donation_email_logs_created'],
    ['idx_di_donation', 'idx_donation_items_donation'],
    ['idx_di_product', 'idx_donation_items_product_id'],
    ['idx_donation_items_product', 'idx_donation_items_product_id'],
    ['idx_donations_s18a_status', 'idx_donations_section_18a_status'],
    ['idx_donations_programme', 'idx_donations_programme_id'],
    ['idx_pke_slip', 'idx_pevent_slip'],
    ['idx_pksi_slip', 'idx_psi_slip'],
    ['idx_pksi_product', 'idx_psi_product'],
    ['idx_pks_dispatch_date', 'idx_picking_slips_dispatch_date'],
    ['idx_pslip_date', 'idx_picking_slips_dispatch_date'],
    ['idx_pks_status', 'idx_pslip_status'],
    ['idx_pks_assigned_to', 'idx_pslip_assigned'],
    ['idx_reporting_factors_lookup', 'reporting_factors_factor_key_effective_from_key'],
    ['idx_reporting_queries_outcome', 'idx_reporting_queries_outcome_date'],
    ['idx_stock_count_lines_count_product', 'scl_one_line_per_product'],
    ['idx_stock_counts_date', 'idx_sc_date'],
    ['idx_sm_created', 'idx_sm_created_at'],
    ['idx_sm_reference', 'idx_sm_ref'],
    ['idx_users_username', 'users_username_key']
  ] LOOP
    IF to_regclass('public.' || pair[2]) IS NOT NULL THEN
      EXECUTE format('DROP INDEX IF EXISTS public.%I', pair[1]);
    END IF;
  END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS idx_dispatch_event_lines_slip_item
  ON dispatch_event_lines (picking_slip_item_id);

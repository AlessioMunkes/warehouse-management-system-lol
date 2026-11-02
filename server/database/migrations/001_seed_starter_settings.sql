-- ─────────────────────────────────────────────────────────────
-- 001_seed_starter_settings.sql
--
-- The configuration every warehouse starts with: impact reporting
-- factors (kg to meals, ...), the three programmes, storage locations,
-- where each donation category is routed, picking settings (cohort
-- anchor, default bag sizes) and the Section 18A threshold.
--
-- schema.sql builds the empty tables; this fills these six. It holds
-- no people, stock, donations or contact details.
--
-- Safe to run on a database that already has these rows: every insert
-- skips a row that is already there (ON CONFLICT DO NOTHING), and the
-- counters are only moved up to the highest id present.
-- ─────────────────────────────────────────────────────────────

INSERT INTO public."reporting_factors" ("id", "factor_key", "value", "unit", "source_note", "effective_from", "created_at")
SELECT "id", "factor_key", "value", "unit", "source_note", "effective_from", "created_at" FROM jsonb_populate_recordset(NULL::public."reporting_factors", $json$[{"id":1,"factor_key":"kg_to_meals","value":"2.5","unit":"meals per kg","source_note":"PLACEHOLDER — confirm with Ladles of Love before publishing any figure.","effective_from":"2025-12-31T22:00:00.000Z","created_at":"2026-08-22T19:21:05.188Z"},{"id":2,"factor_key":"kg_to_adults_served","value":"1.5","unit":"adults per kg","source_note":"Placeholder — replace with a real figure from the organisation.","effective_from":"2026-09-14T22:00:00.000Z","created_at":"2026-09-15T22:04:44.327Z"},{"id":3,"factor_key":"kg_to_dignity_kitchen_served","value":"2.5","unit":"people per kg","source_note":"Placeholder seed value — replace via Adjust factors once the org has a real figure.","effective_from":"2026-09-21T22:00:00.000Z","created_at":"2026-09-22T21:44:30.859Z"},{"id":4,"factor_key":"kg_to_community_served","value":"2.5","unit":"people per kg","source_note":"Placeholder seed value — replace via Adjust factors once the org has a real figure.","effective_from":"2026-09-21T22:00:00.000Z","created_at":"2026-09-22T21:44:30.859Z"}]$json$)
ON CONFLICT DO NOTHING;
INSERT INTO public."programmes" ("id", "code", "name", "description", "is_active", "created_at")
SELECT "id", "code", "name", "description", "is_active", "created_at" FROM jsonb_populate_recordset(NULL::public."programmes", $json$[{"id":1,"code":"NOC","name":"Nourish Our Children","description":"Fortnightly food parcels to registered ECD centres.","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":2,"code":"FTS","name":"Feed the Soil","description":"Fresh produce programme supplying ECDs and community kitchens.","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":3,"code":"LOVE_ACTIVISM","name":"Love Activism","description":"Dignity kitchens, soup kitchens and community relief drives.","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"}]$json$)
ON CONFLICT DO NOTHING;
INSERT INTO public."storage_locations" ("id", "name", "area", "is_active", "created_at")
SELECT "id", "name", "area", "is_active", "created_at" FROM jsonb_populate_recordset(NULL::public."storage_locations", $json$[{"id":1,"name":"Dry Store","area":"dry_store","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":2,"name":"Cold Room","area":"cold_room","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":3,"name":"Decanting Bay","area":"dry_store","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":4,"name":"Dispatch Staging","area":"dry_store","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"}]$json$)
ON CONFLICT DO NOTHING;
INSERT INTO public."donation_category_routing" ("category", "routing_outcome", "storage_area", "description", "is_active", "updated_by", "updated_at")
SELECT "category", "routing_outcome", "storage_area", "description", "is_active", "updated_by", "updated_at" FROM jsonb_populate_recordset(NULL::public."donation_category_routing", $json$[{"category":"recipe_food","routing_outcome":"ecd_fefo_stock","storage_area":null,"description":"Routed to core ECD stock allocation under recipe inventory.","is_active":true,"updated_by":null,"updated_at":"2026-08-24T19:39:33.639Z"},{"category":"add_on_food","routing_outcome":"proportional_ecd_distribution","storage_area":null,"description":"Routed to proportional ECD distribution alongside core recipe allocations.","is_active":true,"updated_by":null,"updated_at":"2026-08-24T19:39:33.639Z"},{"category":"non_recipe_food","routing_outcome":"soup_kitchen_stock","storage_area":"Soup Kitchen Prep","description":"Bulk or non-standard edible stock routed directly to soup kitchen inventory.","is_active":true,"updated_by":null,"updated_at":"2026-08-24T19:39:33.639Z"},{"category":"non_food","routing_outcome":"external_distribution_flag_wm","storage_area":"Mezzanine or Boardroom storage","description":"Non-food item routed to external distribution channel and flagged for Warehouse Manager review.","is_active":true,"updated_by":null,"updated_at":"2026-10-05T08:41:52.921Z"}]$json$)
ON CONFLICT DO NOTHING;
INSERT INTO public."picking_settings" ("key", "value", "updated_at")
SELECT "key", "value", "updated_at" FROM jsonb_populate_recordset(NULL::public."picking_settings", $json$[{"key":"cohort_anchor_monday","value":"2026-08-17","updated_at":"2026-08-19T13:28:02.358Z"},{"key":"default_bag_sizes_kg","value":"[2,1,0.5,0.25]","updated_at":"2026-08-19T13:28:02.358Z"}]$json$)
ON CONFLICT DO NOTHING;
INSERT INTO public."donation_settings" ("id", "section18a_threshold_value", "updated_at")
SELECT "id", "section18a_threshold_value", "updated_at" FROM jsonb_populate_recordset(NULL::public."donation_settings", $json$[{"id":1,"section18a_threshold_value":"1000.00","updated_at":"2026-08-19T13:28:02.358Z"}]$json$)
ON CONFLICT DO NOTHING;
DO $$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT c.relname AS table_name, a.attname AS column_name,
           pg_get_serial_sequence(format('public.%I', c.relname), a.attname) AS seq
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('reporting_factors', 'programmes', 'storage_locations', 'donation_category_routing', 'picking_settings', 'donation_settings')
  LOOP
    IF s.seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, GREATEST(1, COALESCE((SELECT max(%I) FROM public.%I), 0)), (SELECT count(*) > 0 FROM public.%I))',
                     s.seq, s.column_name, s.table_name, s.table_name);
    END IF;
  END LOOP;
END
$$;

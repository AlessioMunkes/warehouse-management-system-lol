-- -------------------------------------------------------------
-- new-database.sql — a new, empty Batches warehouse database
--
-- Written by server/scripts/export-new-database.mjs on 2026-10-25,
-- from a database on PostgreSQL 17.6, with 53 migrations applied
-- (the last: 2026_08_13_donations). Do not edit by hand: change the
-- database through a migration, then run `npm run export-database` again.
--
-- HOW TO RUN IT
--   Supabase: open the new project, SQL Editor, New query, paste this
--   whole file, set the first admin below (optional), press Run.
--   psql:     psql "<connection string>" --single-transaction -f docs/new-database.sql
--   The app:  npm run migrate -- init <code>   (from the server folder)
--
-- It builds every table, type, key, index and sequence the app uses,
-- turns on row-level security and closes Supabase's Data API (the app
-- connects to Postgres directly), adds the starter configuration every
-- warehouse shares, and records the migrations it already contains, so
-- `npm run migrate -- up` carries on from here.
--
-- It stops without changing anything if the database already has tables:
-- it is for a new, empty database only.
--
-- It holds no data from any warehouse: no people, stock, donations,
-- dispatches, centres, connections or contact details.
-- -------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public') THEN
    RAISE EXCEPTION 'This database already has tables in public. new-database.sql is for a new, empty database only. Nothing was changed.';
  END IF;
END
$$;

-- -- Extensions ---------------------------------------------
-- In the "extensions" schema, where Supabase keeps them.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -- Types --------------------------------------------------
CREATE TYPE public."beneficiary_type" AS ENUM ('ecd', 'dignity_kitchen', 'soup_kitchen', 'community');
CREATE TYPE public."cohort_group" AS ENUM ('week1', 'week2', 'tuesday', 'thursday');
CREATE TYPE public."collection_outcome" AS ENUM ('collected', 'partial', 'not_collected');
CREATE TYPE public."picking_item_status" AS ENUM ('pending', 'confirmed', 'flagged');
CREATE TYPE public."product_code_type" AS ENUM ('fixed', 'seasonal');
CREATE TYPE public."request_outcome" AS ENUM ('pending', 'approved', 'fulfilled', 'partially_fulfilled', 'declined', 'referred');
CREATE TYPE public."stock_count_status" AS ENUM ('in_progress', 'submitted', 'approved', 'cancelled');
CREATE TYPE public."storage_area" AS ENUM ('cold_room', 'dry_store', 'fts_section', 'mezzanine', 'boardroom', 'Soup Kitchen Prep', 'Mezzanine or Boardroom storage');
CREATE TYPE public."sync_status" AS ENUM ('pending', 'in_flight', 'succeeded', 'failed', 'abandoned');
CREATE TYPE public."weekday" AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday');

-- -- Sequences ----------------------------------------------
CREATE SEQUENCE public."assistant_queries_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."barcode_scan_events_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."collection_kit_records_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."collection_kits_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."community_request_items_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."community_requests_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."decanting_lines_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."decanting_records_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."delivery_note_items_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."delivery_notes_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."delivery_receipts_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."dispatch_event_lines_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."dispatch_events_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."donation_email_logs_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."donation_items_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."donations_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."donors_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."ecd_centres_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."ecd_collection_reminders_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."ecd_order_lines_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."expiry_warning_dismissals_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."finance_report_access_links_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."finance_report_email_logs_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."notifications_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."operating_closures_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."outbound_messages_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."password_resets_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."pending_donation_items_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."pending_donations_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."photos_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."picking_events_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."picking_slip_items_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."picking_slips_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."product_barcodes_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."products_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."programmes_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."purchase_order_items_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."purchase_order_number_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."purchase_orders_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."push_subscriptions_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."quickbooks_sync_queue_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."recipe_lines_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."recipes_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."reporting_factors_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."reporting_queries_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."saved_reports_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."section18a_certificates_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."stock_count_lines_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."stock_counts_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."stock_movements_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."storage_locations_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."supplier_prospects_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."suppliers_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."user_invites_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."users_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."volunteers_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."warehouse_area_counts_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."warehouse_areas_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE public."warehouse_manager_flags_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

-- -- Tables -------------------------------------------------
CREATE TABLE public."app_settings" (
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."assistant_queries" (
  "id" integer DEFAULT nextval('assistant_queries_id_seq'::regclass) NOT NULL,
  "user_id" integer,
  "user_role" text,
  "screen" text,
  "question" text NOT NULL,
  "outcome" text NOT NULL,
  "topic_id" text,
  "target_screen" text,
  "error_message" text,
  "latency_ms" integer,
  "provider" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."attendance" (
  "attendance_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "checked_in" boolean DEFAULT false NOT NULL,
  "check_in_time" timestamp with time zone,
  "source" character varying(50),
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "action" text NOT NULL,
  "actor_id" integer,
  "reason" text,
  "approved_by" integer,
  "before_data" jsonb,
  "after_data" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."barcode_scan_events" (
  "id" integer DEFAULT nextval('barcode_scan_events_id_seq'::regclass) NOT NULL,
  "scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "screen" character varying(20) NOT NULL,
  "outcome" character varying(20) NOT NULL,
  "product_id" integer,
  "reference_id" integer,
  "user_id" integer
);

CREATE TABLE public."certificate_settings" (
  "id" integer DEFAULT 1 NOT NULL,
  "organisation_name" text DEFAULT ''::text NOT NULL,
  "pbo_number" text DEFAULT ''::text NOT NULL,
  "section18a_reference" text DEFAULT ''::text NOT NULL,
  "physical_address" text DEFAULT ''::text NOT NULL,
  "postal_address" text DEFAULT ''::text NOT NULL,
  "contact_email" text DEFAULT ''::text NOT NULL,
  "contact_phone" text DEFAULT ''::text NOT NULL,
  "sender_display_name" text DEFAULT ''::text NOT NULL,
  "reply_to_email" text DEFAULT ''::text NOT NULL,
  "subject_template" text DEFAULT ''::text NOT NULL,
  "footer_text" text DEFAULT ''::text NOT NULL,
  "signature_name" text DEFAULT ''::text NOT NULL,
  "signature_title" text DEFAULT ''::text NOT NULL,
  "default_acknowledgement_message" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "logo_url" text DEFAULT ''::text NOT NULL,
  "npo_number" text DEFAULT ''::text NOT NULL,
  "website" text DEFAULT ''::text NOT NULL,
  "certificate_prefix" text DEFAULT '18A'::text NOT NULL
);

CREATE TABLE public."collection_kit_records" (
  "id" integer DEFAULT nextval('collection_kit_records_id_seq'::regclass) NOT NULL,
  "kit_id" integer NOT NULL,
  "kg_compost" numeric(10,3) NOT NULL,
  "logged_at" date DEFAULT CURRENT_DATE NOT NULL,
  "status" character varying(20) DEFAULT 'logged'::character varying NOT NULL,
  "dispatched_at" timestamp with time zone,
  "notes" text,
  "logged_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "dispatched_to" character varying(150)
);

CREATE TABLE public."collection_kits" (
  "id" integer DEFAULT nextval('collection_kits_id_seq'::regclass) NOT NULL,
  "owner_name" character varying(150) NOT NULL,
  "suburb" character varying(150),
  "assigned_at" date DEFAULT CURRENT_DATE NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."community_request_items" (
  "id" integer DEFAULT nextval('community_request_items_id_seq'::regclass) NOT NULL,
  "request_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "unit" character varying(20) NOT NULL,
  "quantity_approved" numeric NOT NULL,
  "quantity_released" numeric DEFAULT 0 NOT NULL,
  "short_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."community_requests" (
  "id" integer DEFAULT nextval('community_requests_id_seq'::regclass) NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "caller_name" character varying(200),
  "caller_contact" character varying(100),
  "items_requested" text NOT NULL,
  "quantity_note" character varying(255),
  "outcome" request_outcome DEFAULT 'pending'::request_outcome NOT NULL,
  "outcome_note" text,
  "handled_by" integer,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_by" integer,
  "approved_at" timestamp with time zone,
  "assigned_to" integer,
  "items_short_at" timestamp with time zone,
  "logged_by" integer
);

CREATE TABLE public."decanting_lines" (
  "id" integer DEFAULT nextval('decanting_lines_id_seq'::regclass) NOT NULL,
  "decanting_id" integer NOT NULL,
  "product_id" integer,
  "required_kg" numeric(10,3) NOT NULL,
  "actual_bulk_kg" numeric(10,3),
  "packed_kg" numeric(10,3) NOT NULL,
  "total_bags" integer NOT NULL,
  "sizes_kg" jsonb NOT NULL,
  "bags" jsonb NOT NULL,
  "margin_error" numeric(6,4) NOT NULL,
  "within_margin" boolean NOT NULL,
  "wastage_kg" numeric(10,3) DEFAULT 0 NOT NULL,
  "surplus_kg" numeric(10,3) DEFAULT 0 NOT NULL,
  "shortfall_kg" numeric(10,3) DEFAULT 0 NOT NULL,
  "notes" text,
  "partial_bag_actual_kg" numeric(10,3)
);

CREATE TABLE public."decanting_records" (
  "id" integer DEFAULT nextval('decanting_records_id_seq'::regclass) NOT NULL,
  "week_of" date NOT NULL,
  "notes" text,
  "recorded_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."delivery_note_items" (
  "id" integer DEFAULT nextval('delivery_note_items_id_seq'::regclass) NOT NULL,
  "delivery_note_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "purchase_order_item_id" integer,
  "expected_quantity" numeric(12,3) DEFAULT 0 NOT NULL,
  "expected_weight_kg" numeric(12,3),
  "received_quantity" numeric(12,3) NOT NULL,
  "received_weight_kg" numeric(12,3),
  "unit" character varying(20) DEFAULT 'kg'::character varying NOT NULL,
  "discrepancy_quantity" numeric(12,3) GENERATED ALWAYS AS ((received_quantity - expected_quantity)) STORED,
  "discrepancy_weight_kg" numeric(12,3) GENERATED ALWAYS AS ((received_weight_kg - expected_weight_kg)) STORED,
  "discrepancy_reason" text,
  "discrepancy_resolved" boolean DEFAULT false NOT NULL,
  "location_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "storage_area" character varying(50),
  "expiry_date" date
);

CREATE TABLE public."delivery_notes" (
  "id" integer DEFAULT nextval('delivery_notes_id_seq'::regclass) NOT NULL,
  "supplier_id" integer NOT NULL,
  "received_by" integer,
  "purchase_order_id" integer NOT NULL,
  "delivery_date" date NOT NULL,
  "status" character varying(20) DEFAULT 'recorded'::character varying NOT NULL,
  "signature" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "driver_name" character varying(200),
  "idempotency_key" text
);

CREATE TABLE public."delivery_receipts" (
  "id" integer DEFAULT nextval('delivery_receipts_id_seq'::regclass) NOT NULL,
  "picking_slip_id" integer NOT NULL,
  "ecd_id" integer,
  "dispatch_date" date NOT NULL,
  "cohort" cohort_group NOT NULL,
  "outcome" collection_outcome DEFAULT 'not_collected'::collection_outcome NOT NULL,
  "collected_by_name" character varying(200),
  "signature" text,
  "confirmed_by" integer,
  "confirmed_at" timestamp with time zone,
  "override_reason" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."dispatch_event_lines" (
  "id" integer DEFAULT nextval('dispatch_event_lines_id_seq'::regclass) NOT NULL,
  "dispatch_event_id" integer NOT NULL,
  "picking_slip_item_id" integer,
  "product_id" integer NOT NULL,
  "packed_quantity" numeric(12,3) NOT NULL,
  "loaded_quantity" numeric(12,3) NOT NULL,
  "unit" character varying(20) NOT NULL,
  "variance_reason" text
);

CREATE TABLE public."dispatch_events" (
  "id" integer DEFAULT nextval('dispatch_events_id_seq'::regclass) NOT NULL,
  "picking_slip_id" integer NOT NULL,
  "status" character varying(20) DEFAULT 'awaiting'::character varying NOT NULL,
  "collected_at" timestamp with time zone,
  "flagged_at" timestamp with time zone,
  "dispatched_by" integer,
  "driver_name" character varying(120),
  "vehicle_reg" character varying(20),
  "signature" text,
  "override_by" integer,
  "override_reason" text,
  "idempotency_key" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."donation_allocations" (
  "id" integer GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  "donation_item_id" integer NOT NULL,
  "beneficiary_type" character varying(40) DEFAULT 'ecd'::character varying NOT NULL,
  "ecd_centre_id" integer,
  "child_count" integer NOT NULL,
  "allocated_quantity" numeric NOT NULL,
  "unit" character varying NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."donation_category_routing" (
  "category" character varying(20) NOT NULL,
  "routing_outcome" character varying(40) NOT NULL,
  "storage_area" storage_area,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "updated_by" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."donation_email_logs" (
  "id" bigint DEFAULT nextval('donation_email_logs_id_seq'::regclass) NOT NULL,
  "donation_id" integer NOT NULL,
  "certificate_id" bigint,
  "email_type" text NOT NULL,
  "recipient" text NOT NULL,
  "subject" text NOT NULL,
  "status" text NOT NULL,
  "provider_message_id" text,
  "error_message" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "donor_id" bigint,
  "recipient_email" text,
  "recipient_name" text,
  "gmail_message_id" text,
  "gmail_thread_id" text,
  "sent_by_user_id" integer
);

CREATE TABLE public."donation_items" (
  "id" integer DEFAULT nextval('donation_items_id_seq'::regclass) NOT NULL,
  "donation_id" integer NOT NULL,
  "product_id" integer,
  "description" character varying(255),
  "quantity" numeric(12,3) NOT NULL,
  "unit" character varying(20) DEFAULT 'kg'::character varying NOT NULL,
  "estimated_value_zar" numeric(12,2),
  "storage_location_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "routing_status" character varying(30) DEFAULT 'pending'::character varying NOT NULL,
  "resolved_by" integer,
  "resolved_at" timestamp with time zone,
  "routed_category" character varying(20),
  "routing_outcome" character varying(40),
  "routing_source" character varying(30) DEFAULT 'unclassified'::character varying NOT NULL,
  "line_no" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."donation_routing_defaults" (
  "product_id" integer NOT NULL,
  "donation_category" character varying(20),
  "set_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."donation_settings" (
  "id" integer DEFAULT 1 NOT NULL,
  "section18a_threshold_value" numeric DEFAULT 1000.00 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."donations" (
  "id" integer DEFAULT nextval('donations_id_seq'::regclass) NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "programme_id" integer,
  "estimated_value_zar" numeric(12,2) NOT NULL,
  "donor_name" character varying(200),
  "donor_contact" character varying(200),
  "donor_consent_given" boolean DEFAULT false NOT NULL,
  "section_18a_qualifying" boolean DEFAULT false NOT NULL,
  "section_18a_certificate_ref" character varying(100),
  "section_18a_issued_at" timestamp with time zone,
  "received_by" integer,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "donor_tax_reference" character varying(50),
  "idempotency_key" character varying(64),
  "section_18a_status" character varying(30) DEFAULT 'not_evaluated'::character varying NOT NULL,
  "donor_id" integer,
  "donation_category" character varying(100) NOT NULL,
  "status" character varying(40) DEFAULT 'draft'::character varying NOT NULL,
  "created_by" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "donor_registration_type" character varying(40),
  "section18a_requested" boolean DEFAULT false NOT NULL,
  "donor_first_name" character varying(200),
  "donor_last_name" character varying(200),
  "section_18a_form_token_hash" text,
  "section_18a_form_token_expires_at" timestamp with time zone,
  "section_18a_form_submitted_at" timestamp with time zone,
  "section_18a_donor_form" jsonb
);

CREATE TABLE public."donors" (
  "id" integer DEFAULT nextval('donors_id_seq'::regclass) NOT NULL,
  "name" character varying(200) NOT NULL,
  "contact" character varying(200),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."ecd_centres" (
  "id" integer DEFAULT nextval('ecd_centres_id_seq'::regclass) NOT NULL,
  "name" character varying(200) NOT NULL,
  "contact_name" character varying(200),
  "child_count" integer,
  "cohort" cohort_group NOT NULL,
  "last_collected_date" date,
  "is_active" boolean DEFAULT true NOT NULL,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "contact_phone" character varying(30),
  "collection_day" weekday,
  "mobile_number" character varying(30),
  "contact_email" text,
  "address" text,
  "suburb" text,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6),
  "location_source" text,
  "location_note" text,
  "location_updated_at" timestamp with time zone,
  "location_updated_by" integer
);

CREATE TABLE public."ecd_collection_reminders" (
  "id" integer DEFAULT nextval('ecd_collection_reminders_id_seq'::regclass) NOT NULL,
  "ecd_id" integer NOT NULL,
  "collection_date" date NOT NULL,
  "channel" character varying(30) NOT NULL,
  "status" character varying(30) DEFAULT 'pending'::character varying NOT NULL,
  "sent_at" timestamp with time zone,
  "provider_message_id" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."ecd_order_lines" (
  "id" integer DEFAULT nextval('ecd_order_lines_id_seq'::regclass) NOT NULL,
  "ecd_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "quantity" numeric(10,3) NOT NULL,
  "unit" character varying(20) NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."event_spaces" (
  "space_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "space_name" character varying(200) NOT NULL,
  "description" text,
  "location" character varying(255),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."event_timeslots" (
  "timeslot_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "space_id" uuid NOT NULL,
  "start_time" timestamp with time zone NOT NULL,
  "end_time" timestamp with time zone NOT NULL,
  "capacity" integer NOT NULL,
  "status" character varying(20) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."expiry_warning_dismissals" (
  "id" integer DEFAULT nextval('expiry_warning_dismissals_id_seq'::regclass) NOT NULL,
  "delivery_note_item_id" integer NOT NULL,
  "reason" text NOT NULL,
  "dismissed_by" integer NOT NULL,
  "dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "restored_by" integer,
  "restored_at" timestamp with time zone
);

CREATE TABLE public."finance_report_access_links" (
  "id" integer DEFAULT nextval('finance_report_access_links_id_seq'::regclass) NOT NULL,
  "token_hash" text NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" integer,
  "expires_at" timestamp with time zone NOT NULL,
  "last_opened_at" timestamp with time zone,
  "open_count" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public."finance_report_email_logs" (
  "id" integer DEFAULT nextval('finance_report_email_logs_id_seq'::regclass) NOT NULL,
  "recipient_email" text NOT NULL,
  "status" text NOT NULL,
  "finance_link_id" integer,
  "provider_message_id" text,
  "error_message" text,
  "sent_by_user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone
);

CREATE TABLE public."finance_report_email_settings" (
  "id" integer DEFAULT 1 NOT NULL,
  "recipient_email" text,
  "updated_by" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."gmail_connections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "gmail_email" character varying(255),
  "token_type" character varying(32) NOT NULL,
  "scope" text NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text NOT NULL,
  "access_token_expires_at" timestamp with time zone,
  "refresh_token_expires_at" timestamp with time zone,
  "connected_by_user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "display_name" character varying(255)
);

CREATE TABLE public."idempotency_keys" (
  "key" text NOT NULL,
  "scope" text NOT NULL,
  "user_id" integer,
  "status_code" smallint,
  "response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."love_activism_events" (
  "event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_name" character varying(200) NOT NULL,
  "description" text,
  "event_date" date NOT NULL,
  "status" character varying(20) NOT NULL,
  "created_by" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "venue_name" character varying(200),
  "address" character varying(500)
);

CREATE TABLE public."notification_reads" (
  "notification_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."notifications" (
  "id" integer DEFAULT nextval('notifications_id_seq'::regclass) NOT NULL,
  "type" character varying(50) NOT NULL,
  "title" character varying(200) NOT NULL,
  "body" text,
  "entity_type" character varying(50),
  "entity_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "target_roles" text[]
);

CREATE TABLE public."operating_closures" (
  "id" integer DEFAULT nextval('operating_closures_id_seq'::regclass) NOT NULL,
  "closed_on" date NOT NULL,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."outbound_messages" (
  "id" bigint DEFAULT nextval('outbound_messages_id_seq'::regclass) NOT NULL,
  "channel" text DEFAULT 'email'::text NOT NULL,
  "type" text NOT NULL,
  "recipient" text,
  "subject" text,
  "status" text NOT NULL,
  "error" text,
  "related_type" text,
  "related_id" text,
  "sent_by" integer,
  "attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."password_resets" (
  "id" integer DEFAULT nextval('password_resets_id_seq'::regclass) NOT NULL,
  "user_id" integer NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "superseded_at" timestamp with time zone,
  "requested_ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "email_status" text,
  "email_error" text,
  "email_attempted_at" timestamp with time zone
);

CREATE TABLE public."pending_donation_items" (
  "id" integer DEFAULT nextval('pending_donation_items_id_seq'::regclass) NOT NULL,
  "pending_donation_id" integer NOT NULL,
  "line_no" integer NOT NULL,
  "description" text NOT NULL,
  "product_id" integer,
  "quantity" numeric(12,3) NOT NULL,
  "unit" character varying(30) NOT NULL,
  "estimated_value_zar" numeric(12,2),
  "requested_category" character varying(30),
  "resolved_category" character varying(30),
  "routing_status" character varying(30),
  "storage_area_hint" character varying(50),
  "source" character varying(30),
  "status" character varying(30) DEFAULT 'awaiting_resolution'::character varying NOT NULL,
  "flag_id" integer,
  "rejection_reason" text,
  "resolved_by" integer,
  "rejected_at" timestamp with time zone,
  "committed_donation_item_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."pending_donations" (
  "id" integer DEFAULT nextval('pending_donations_id_seq'::regclass) NOT NULL,
  "status" character varying(30) DEFAULT 'draft'::character varying NOT NULL,
  "created_by" integer,
  "donor_name" character varying(200),
  "donor_contact" character varying(200),
  "donor_tax_reference" character varying(50),
  "donor_consent_given" boolean,
  "estimated_value_zar" numeric(12,2),
  "donation_category" character varying(30),
  "programme_id" integer,
  "notes" text,
  "section_18a_status" character varying(40),
  "section_18a_qualifying" boolean,
  "draft_snapshot" jsonb NOT NULL,
  "idempotency_key" character varying(64),
  "committed_donation_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "committed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "commit_failed_at" timestamp with time zone,
  "commit_incomplete_at" timestamp with time zone,
  "donor_registration_type" character varying(40),
  "donor_first_name" character varying(200),
  "donor_last_name" character varying(200),
  "section18a_requested" boolean DEFAULT false NOT NULL
);

CREATE TABLE public."photos" (
  "id" bigint DEFAULT nextval('photos_id_seq'::regclass) NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "data" bytea NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."picking_events" (
  "id" integer DEFAULT nextval('picking_events_id_seq'::regclass) NOT NULL,
  "picking_slip_id" integer NOT NULL,
  "event_type" character varying(30) NOT NULL,
  "actor_id" integer,
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."picking_settings" (
  "key" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."picking_slip_items" (
  "id" integer DEFAULT nextval('picking_slip_items_id_seq'::regclass) NOT NULL,
  "picking_slip_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "required_quantity" numeric(10,3) NOT NULL,
  "unit" character varying(20) NOT NULL,
  "packed_quantity" numeric(10,3),
  "status" picking_item_status DEFAULT 'pending'::picking_item_status NOT NULL,
  "flag_reason" text,
  "confirmed_by" integer,
  "confirmed_at" timestamp with time zone,
  "dispatched_at" timestamp with time zone,
  "packer_note" text
);

CREATE TABLE public."picking_slips" (
  "id" integer DEFAULT nextval('picking_slips_id_seq'::regclass) NOT NULL,
  "ecd_id" integer,
  "dispatch_date" date NOT NULL,
  "cohort" cohort_group NOT NULL,
  "pallet_ref" character varying(50),
  "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  "assigned_to" integer,
  "generated_by" integer,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "completed_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "public_token" uuid DEFAULT gen_random_uuid() NOT NULL,
  "collection_status" collection_outcome,
  "assigned_volunteer_id" bigint,
  "beneficiary_kind" beneficiary_type DEFAULT 'ecd'::beneficiary_type NOT NULL,
  "beneficiary_name" character varying(200),
  "dispatched_at" timestamp with time zone,
  "assigned_to_2" integer
);

CREATE TABLE public."product_barcodes" (
  "id" integer DEFAULT nextval('product_barcodes_id_seq'::regclass) NOT NULL,
  "product_id" integer NOT NULL,
  "code" character varying(64) NOT NULL,
  "units_per_scan" numeric(12,3) DEFAULT 1 NOT NULL,
  "supplier_id" integer,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "food_name" text,
  "food_brand" text,
  "food_quantity" text,
  "food_weight_kg" numeric(10,3),
  "food_categories" text[],
  "food_checked_at" timestamp with time zone
);

CREATE TABLE public."products" (
  "id" integer DEFAULT nextval('products_id_seq'::regclass) NOT NULL,
  "name" character varying(200) NOT NULL,
  "stock_keeping_unit" character varying(50) NOT NULL,
  "weight_kg" numeric(10,3),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_decantable" boolean DEFAULT false NOT NULL,
  "programme_id" integer,
  "default_location_id" integer,
  "code_type" product_code_type DEFAULT 'fixed'::product_code_type NOT NULL,
  "category" character varying(60),
  "is_perishable" boolean DEFAULT false NOT NULL,
  "default_unit" character varying(20) DEFAULT 'kg'::character varying NOT NULL,
  "storage_type" character varying(10) DEFAULT 'dry'::character varying,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "unit_cost" numeric(12,2),
  "quantity_per_meal" numeric
);

CREATE TABLE public."programmes" (
  "id" integer DEFAULT nextval('programmes_id_seq'::regclass) NOT NULL,
  "code" character varying(30) NOT NULL,
  "name" character varying(120) NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."purchase_order_items" (
  "id" integer DEFAULT nextval('purchase_order_items_id_seq'::regclass) NOT NULL,
  "purchase_order_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "expected_quantity" numeric NOT NULL,
  "expected_weight_kg" numeric(10,3),
  "unit_price" numeric(10,2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."purchase_orders" (
  "id" integer DEFAULT nextval('purchase_orders_id_seq'::regclass) NOT NULL,
  "supplier_id" integer NOT NULL,
  "created_by" integer,
  "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  "expected_delivery_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status_reason" text,
  "status_changed_at" timestamp with time zone,
  "po_number" character varying(20) DEFAULT ((('PO-'::text || to_char((now() AT TIME ZONE 'Africa/Johannesburg'::text), 'YYYY'::text)) || '-'::text) || lpad((nextval('purchase_order_number_seq'::regclass))::text, 4, '0'::text)) NOT NULL,
  "notes" text,
  "finance_email_status" text,
  "finance_email_error" text,
  "finance_email_attempted_at" timestamp with time zone,
  "follow_up_of" integer
);

CREATE TABLE public."push_subscriptions" (
  "id" integer DEFAULT nextval('push_subscriptions_id_seq'::regclass) NOT NULL,
  "user_id" integer NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_success_at" timestamp with time zone
);

CREATE TABLE public."quickbooks_connections" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "realm_id" character varying(64) NOT NULL,
  "token_type" character varying(32) NOT NULL,
  "scope" text NOT NULL,
  "access_token_encrypted" text NOT NULL,
  "refresh_token_encrypted" text NOT NULL,
  "access_token_expires_at" timestamp with time zone,
  "refresh_token_expires_at" timestamp with time zone,
  "connected_by_user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."quickbooks_object_map" (
  "entity_type" character varying(60) NOT NULL,
  "entity_id" integer NOT NULL,
  "qbo_object_type" character varying(60) NOT NULL,
  "qbo_id" character varying(100) NOT NULL,
  "sync_token" character varying(50),
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."quickbooks_sync_queue" (
  "id" bigint DEFAULT nextval('quickbooks_sync_queue_id_seq'::regclass) NOT NULL,
  "entity_type" character varying(60) NOT NULL,
  "entity_id" integer NOT NULL,
  "operation" character varying(30) NOT NULL,
  "payload" jsonb,
  "status" sync_status DEFAULT 'pending'::sync_status NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "idempotency_key" character varying(120) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."recipe_lines" (
  "id" integer DEFAULT nextval('recipe_lines_id_seq'::regclass) NOT NULL,
  "recipe_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "quantity_per_child" numeric NOT NULL,
  "unit" character varying NOT NULL
);

CREATE TABLE public."recipe_own_order_centres" (
  "ecd_id" integer NOT NULL,
  "added_by" integer
);

CREATE TABLE public."recipes" (
  "id" integer DEFAULT nextval('recipes_id_seq'::regclass) NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "season_start_month" smallint,
  "season_start_day" smallint,
  "starts_on" date,
  "ends_on" date,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."reporting_factors" (
  "id" integer DEFAULT nextval('reporting_factors_id_seq'::regclass) NOT NULL,
  "factor_key" character varying(50) NOT NULL,
  "value" numeric NOT NULL,
  "unit" character varying(50) NOT NULL,
  "source_note" text,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."reporting_queries" (
  "id" bigint DEFAULT nextval('reporting_queries_id_seq'::regclass) NOT NULL,
  "user_id" integer,
  "question" text NOT NULL,
  "outcome" character varying(20) NOT NULL,
  "metric" character varying(50),
  "spec" jsonb,
  "error_message" text,
  "latency_ms" integer,
  "provider" character varying(60),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."reporting_targets" (
  "user_id" integer NOT NULL,
  "metric_id" character varying(64) NOT NULL,
  "value" numeric NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."saved_reports" (
  "id" integer DEFAULT nextval('saved_reports_id_seq'::regclass) NOT NULL,
  "user_id" integer NOT NULL,
  "title" character varying(120) NOT NULL,
  "kind" character varying(20) NOT NULL,
  "spec" jsonb NOT NULL,
  "preset" character varying(20) DEFAULT 'last_3m'::character varying NOT NULL,
  "pinned" boolean DEFAULT false NOT NULL,
  "schedule" character varying(20) DEFAULT 'none'::character varying NOT NULL,
  "last_sent_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."schema_migrations" (
  "id" character varying(100) NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notes" text
);

CREATE TABLE public."section18a_certificates" (
  "id" bigint DEFAULT nextval('section18a_certificates_id_seq'::regclass) NOT NULL,
  "donation_id" integer NOT NULL,
  "certificate_number" text NOT NULL,
  "issue_date" date NOT NULL,
  "issued_by" integer,
  "settings_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "donor_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "donation_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pdf_content" bytea NOT NULL,
  "pdf_filename" text NOT NULL,
  "pdf_content_type" text DEFAULT 'application/pdf'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."section18a_settings" (
  "id" integer DEFAULT 1 NOT NULL,
  "organisation_name" text DEFAULT ''::text NOT NULL,
  "organisation_address" text DEFAULT ''::text NOT NULL,
  "contact_name" text DEFAULT ''::text NOT NULL,
  "contact_email" text DEFAULT ''::text NOT NULL,
  "contact_phone" text DEFAULT ''::text NOT NULL,
  "pba_declaration" text DEFAULT ''::text NOT NULL,
  "certificate_prefix" text DEFAULT 'S18A'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."stock_count_lines" (
  "id" integer DEFAULT nextval('stock_count_lines_id_seq'::regclass) NOT NULL,
  "stock_count_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "location_id" integer,
  "system_quantity" numeric(12,3) NOT NULL,
  "counted_quantity" numeric(12,3) NOT NULL,
  "variance" numeric(12,3) GENERATED ALWAYS AS ((counted_quantity - system_quantity)) STORED,
  "unit" character varying(20) DEFAULT 'kg'::character varying NOT NULL,
  "reason_code" character varying(50),
  "notes" text,
  "counted_by" integer,
  "counted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."stock_counts" (
  "id" integer DEFAULT nextval('stock_counts_id_seq'::regclass) NOT NULL,
  "count_date" date NOT NULL,
  "status" stock_count_status DEFAULT 'in_progress'::stock_count_status NOT NULL,
  "started_by" integer,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_by" integer,
  "approved_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."stock_levels" (
  "product_id" integer NOT NULL,
  "quantity_on_hand" numeric(12,3) DEFAULT 0 NOT NULL,
  "unit" character varying(20) NOT NULL,
  "reorder_threshold" numeric(12,3) DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."stock_movements" (
  "id" integer DEFAULT nextval('stock_movements_id_seq'::regclass) NOT NULL,
  "product_id" integer NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "unit" character varying(20),
  "movement_type" character varying(20) NOT NULL,
  "reference_type" character varying(30),
  "reference_id" integer,
  "reason" text,
  "performed_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "programme_id" integer,
  "location_id" integer,
  "approved_by" integer
);

CREATE TABLE public."storage_locations" (
  "id" integer DEFAULT nextval('storage_locations_id_seq'::regclass) NOT NULL,
  "name" character varying(100) NOT NULL,
  "area" storage_area NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."supplier_products" (
  "supplier_id" integer NOT NULL,
  "product_id" integer NOT NULL
);

CREATE TABLE public."supplier_prospects" (
  "id" integer DEFAULT nextval('supplier_prospects_id_seq'::regclass) NOT NULL,
  "name" character varying(200) NOT NULL,
  "what_they_supply" text,
  "lead_source" character varying(200),
  "contact_name" character varying(200),
  "contact_email" character varying(255),
  "contact_phone" character varying(50),
  "notes" text,
  "status" character varying(20) DEFAULT 'open'::character varying NOT NULL,
  "converted_supplier_id" integer,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."suppliers" (
  "id" integer DEFAULT nextval('suppliers_id_seq'::regclass) NOT NULL,
  "name" character varying(200) NOT NULL,
  "contact_email" character varying(255),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "contact_phone" character varying(50),
  "address" text,
  "agreement_ref" character varying(100),
  "contact_name" character varying(200),
  "payment_terms" character varying(100),
  "expected_lead_time_days" integer,
  "category" character varying(60),
  "notes" text,
  "created_by" integer,
  "deactivated_at" timestamp with time zone,
  "deactivated_by" integer,
  "archived_at" timestamp with time zone,
  "archived_by" integer
);

CREATE TABLE public."user_invites" (
  "id" integer DEFAULT nextval('user_invites_id_seq'::regclass) NOT NULL,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "invited_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resend_count" integer DEFAULT 0 NOT NULL,
  "email_status" text,
  "email_error" text,
  "email_attempted_at" timestamp with time zone
);

CREATE TABLE public."users" (
  "id" integer DEFAULT nextval('users_id_seq'::regclass) NOT NULL,
  "username" character varying(50) NOT NULL,
  "first_name" character varying(100) NOT NULL,
  "last_name" character varying(100) NOT NULL,
  "password_hash" character varying(255) NOT NULL,
  "role" character varying(30) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "email" text,
  "language" text DEFAULT 'en'::text NOT NULL,
  "session_version" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public."vms_sync" (
  "sync_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" character varying(20) NOT NULL,
  "entity_id" uuid NOT NULL,
  "external_id" character varying(255),
  "sync_status" character varying(20) NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."volunteer_bookings" (
  "booking_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "timeslot_id" uuid NOT NULL,
  "external_booking_id" character varying(255),
  "external_volunteer_id" character varying(255),
  "volunteer_first_name" character varying(100) NOT NULL,
  "volunteer_last_name" character varying(100),
  "booking_source" character varying(20) NOT NULL,
  "booking_status" character varying(20) NOT NULL,
  "booked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "volunteer_email" character varying(255),
  "volunteer_phone" character varying(50)
);

CREATE TABLE public."volunteers" (
  "id" bigint DEFAULT nextval('volunteers_id_seq'::regclass) NOT NULL,
  "full_name" text NOT NULL,
  "signed_in_at" timestamp with time zone DEFAULT now() NOT NULL,
  "signed_out_at" timestamp with time zone,
  "source" text DEFAULT 'guest_login'::text NOT NULL,
  "consent_given" boolean DEFAULT false NOT NULL,
  "retention_delete_after" date
);

CREATE TABLE public."warehouse_area_counts" (
  "id" integer DEFAULT nextval('warehouse_area_counts_id_seq'::regclass) NOT NULL,
  "area_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "quantity" numeric NOT NULL,
  "unit" character varying(20) NOT NULL,
  "on_hand_at_count" numeric NOT NULL,
  "counted_by" integer,
  "counted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."warehouse_areas" (
  "id" integer DEFAULT nextval('warehouse_areas_id_seq'::regclass) NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "grid_x" smallint NOT NULL,
  "grid_y" smallint NOT NULL,
  "grid_w" smallint NOT NULL,
  "grid_h" smallint NOT NULL,
  "levels" smallint DEFAULT 1 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "capacity_kg" numeric,
  "pallet_spaces" integer,
  "preferred_product_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
  "preferred_categories" text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE public."warehouse_manager_flags" (
  "id" integer DEFAULT nextval('warehouse_manager_flags_id_seq'::regclass) NOT NULL,
  "product_id" integer NOT NULL,
  "quantity_kg" numeric(10,2) NOT NULL,
  "reason" text NOT NULL,
  "target_location" character varying(100),
  "created_by" integer,
  "status" character varying(50) DEFAULT 'pending'::character varying,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "pending_donation_id" integer,
  "pending_donation_item_id" integer
);

-- -- Keys and checks ----------------------------------------
ALTER TABLE public."app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY (key);
ALTER TABLE public."assistant_queries" ADD CONSTRAINT "assistant_queries_pkey" PRIMARY KEY (id);
ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_pkey" PRIMARY KEY (attendance_id);
ALTER TABLE public."audit_log" ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."barcode_scan_events" ADD CONSTRAINT "barcode_scan_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."certificate_settings" ADD CONSTRAINT "certificate_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."collection_kit_records" ADD CONSTRAINT "collection_kit_records_pkey" PRIMARY KEY (id);
ALTER TABLE public."collection_kits" ADD CONSTRAINT "collection_kits_pkey" PRIMARY KEY (id);
ALTER TABLE public."community_request_items" ADD CONSTRAINT "community_request_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."community_requests" ADD CONSTRAINT "community_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."decanting_lines" ADD CONSTRAINT "decanting_lines_pkey" PRIMARY KEY (id);
ALTER TABLE public."decanting_records" ADD CONSTRAINT "decanting_records_pkey" PRIMARY KEY (id);
ALTER TABLE public."delivery_note_items" ADD CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."delivery_notes" ADD CONSTRAINT "delivery_notes_pkey" PRIMARY KEY (id);
ALTER TABLE public."delivery_receipts" ADD CONSTRAINT "delivery_receipts_pkey" PRIMARY KEY (id);
ALTER TABLE public."dispatch_event_lines" ADD CONSTRAINT "dispatch_event_lines_pkey" PRIMARY KEY (id);
ALTER TABLE public."dispatch_events" ADD CONSTRAINT "dispatch_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."donation_allocations" ADD CONSTRAINT "donation_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE public."donation_category_routing" ADD CONSTRAINT "donation_category_routing_pkey" PRIMARY KEY (category);
ALTER TABLE public."donation_email_logs" ADD CONSTRAINT "donation_email_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."donation_routing_defaults" ADD CONSTRAINT "donation_routing_defaults_pkey" PRIMARY KEY (product_id);
ALTER TABLE public."donation_settings" ADD CONSTRAINT "donation_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."donations" ADD CONSTRAINT "donations_pkey" PRIMARY KEY (id);
ALTER TABLE public."donors" ADD CONSTRAINT "donors_pkey" PRIMARY KEY (id);
ALTER TABLE public."ecd_centres" ADD CONSTRAINT "ecd_centres_pkey" PRIMARY KEY (id);
ALTER TABLE public."ecd_collection_reminders" ADD CONSTRAINT "ecd_collection_reminders_pkey" PRIMARY KEY (id);
ALTER TABLE public."ecd_order_lines" ADD CONSTRAINT "ecd_order_lines_pkey" PRIMARY KEY (id);
ALTER TABLE public."event_spaces" ADD CONSTRAINT "event_spaces_pkey" PRIMARY KEY (space_id);
ALTER TABLE public."event_timeslots" ADD CONSTRAINT "event_timeslots_pkey" PRIMARY KEY (timeslot_id);
ALTER TABLE public."expiry_warning_dismissals" ADD CONSTRAINT "expiry_warning_dismissals_pkey" PRIMARY KEY (id);
ALTER TABLE public."finance_report_access_links" ADD CONSTRAINT "finance_report_access_links_pkey" PRIMARY KEY (id);
ALTER TABLE public."finance_report_email_logs" ADD CONSTRAINT "finance_report_email_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."finance_report_email_settings" ADD CONSTRAINT "finance_report_email_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."gmail_connections" ADD CONSTRAINT "gmail_connections_pkey" PRIMARY KEY (id);
ALTER TABLE public."idempotency_keys" ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY (key);
ALTER TABLE public."love_activism_events" ADD CONSTRAINT "love_activism_events_pkey" PRIMARY KEY (event_id);
ALTER TABLE public."notification_reads" ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY (notification_id, user_id);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."operating_closures" ADD CONSTRAINT "operating_closures_pkey" PRIMARY KEY (id);
ALTER TABLE public."outbound_messages" ADD CONSTRAINT "outbound_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."password_resets" ADD CONSTRAINT "password_resets_pkey" PRIMARY KEY (id);
ALTER TABLE public."pending_donation_items" ADD CONSTRAINT "pending_donation_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."pending_donations" ADD CONSTRAINT "pending_donations_pkey" PRIMARY KEY (id);
ALTER TABLE public."photos" ADD CONSTRAINT "photos_pkey" PRIMARY KEY (id);
ALTER TABLE public."picking_events" ADD CONSTRAINT "picking_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."picking_settings" ADD CONSTRAINT "picking_settings_pkey" PRIMARY KEY (key);
ALTER TABLE public."picking_slip_items" ADD CONSTRAINT "picking_slip_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_pkey" PRIMARY KEY (id);
ALTER TABLE public."product_barcodes" ADD CONSTRAINT "product_barcodes_pkey" PRIMARY KEY (id);
ALTER TABLE public."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);
ALTER TABLE public."programmes" ADD CONSTRAINT "programmes_pkey" PRIMARY KEY (id);
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY (id);
ALTER TABLE public."push_subscriptions" ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE public."quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_pkey" PRIMARY KEY (id);
ALTER TABLE public."quickbooks_object_map" ADD CONSTRAINT "quickbooks_object_map_pkey" PRIMARY KEY (entity_type, entity_id);
ALTER TABLE public."quickbooks_sync_queue" ADD CONSTRAINT "quickbooks_sync_queue_pkey" PRIMARY KEY (id);
ALTER TABLE public."recipe_lines" ADD CONSTRAINT "recipe_lines_pkey" PRIMARY KEY (id);
ALTER TABLE public."recipe_own_order_centres" ADD CONSTRAINT "recipe_own_order_centres_pkey" PRIMARY KEY (ecd_id);
ALTER TABLE public."recipes" ADD CONSTRAINT "recipes_pkey" PRIMARY KEY (id);
ALTER TABLE public."reporting_factors" ADD CONSTRAINT "reporting_factors_pkey" PRIMARY KEY (id);
ALTER TABLE public."reporting_queries" ADD CONSTRAINT "reporting_queries_pkey" PRIMARY KEY (id);
ALTER TABLE public."reporting_targets" ADD CONSTRAINT "reporting_targets_pkey" PRIMARY KEY (user_id, metric_id);
ALTER TABLE public."saved_reports" ADD CONSTRAINT "saved_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."schema_migrations" ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (id);
ALTER TABLE public."section18a_certificates" ADD CONSTRAINT "section18a_certificates_pkey" PRIMARY KEY (id);
ALTER TABLE public."section18a_settings" ADD CONSTRAINT "section18a_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."stock_count_lines" ADD CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY (id);
ALTER TABLE public."stock_counts" ADD CONSTRAINT "stock_counts_pkey" PRIMARY KEY (id);
ALTER TABLE public."stock_levels" ADD CONSTRAINT "stock_levels_pkey" PRIMARY KEY (product_id);
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY (id);
ALTER TABLE public."storage_locations" ADD CONSTRAINT "storage_locations_pkey" PRIMARY KEY (id);
ALTER TABLE public."supplier_products" ADD CONSTRAINT "supplier_products_pkey" PRIMARY KEY (supplier_id, product_id);
ALTER TABLE public."supplier_prospects" ADD CONSTRAINT "supplier_prospects_pkey" PRIMARY KEY (id);
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_invites" ADD CONSTRAINT "user_invites_pkey" PRIMARY KEY (id);
ALTER TABLE public."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE public."vms_sync" ADD CONSTRAINT "vms_sync_pkey" PRIMARY KEY (sync_id);
ALTER TABLE public."volunteer_bookings" ADD CONSTRAINT "volunteer_bookings_pkey" PRIMARY KEY (booking_id);
ALTER TABLE public."volunteers" ADD CONSTRAINT "volunteers_pkey" PRIMARY KEY (id);
ALTER TABLE public."warehouse_area_counts" ADD CONSTRAINT "warehouse_area_counts_pkey" PRIMARY KEY (id);
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_pkey" PRIMARY KEY (id);
ALTER TABLE public."warehouse_manager_flags" ADD CONSTRAINT "warehouse_manager_flags_pkey" PRIMARY KEY (id);
ALTER TABLE public."attendance" ADD CONSTRAINT "uq_attendance_booking" UNIQUE (booking_id);
ALTER TABLE public."community_request_items" ADD CONSTRAINT "community_request_items_request_product_key" UNIQUE (request_id, product_id);
ALTER TABLE public."delivery_receipts" ADD CONSTRAINT "delivery_receipts_picking_slip_id_key" UNIQUE (picking_slip_id);
ALTER TABLE public."dispatch_events" ADD CONSTRAINT "dispatch_events_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."dispatch_events" ADD CONSTRAINT "dispatch_events_picking_slip_id_key" UNIQUE (picking_slip_id);
ALTER TABLE public."ecd_collection_reminders" ADD CONSTRAINT "ecd_collection_reminders_ecd_id_collection_date_channel_key" UNIQUE (ecd_id, collection_date, channel);
ALTER TABLE public."event_spaces" ADD CONSTRAINT "uq_event_spaces_space_name" UNIQUE (space_name);
ALTER TABLE public."event_timeslots" ADD CONSTRAINT "uq_event_timeslots_unique_slot" UNIQUE (event_id, space_id, start_time, end_time);
ALTER TABLE public."finance_report_access_links" ADD CONSTRAINT "finance_report_access_links_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."operating_closures" ADD CONSTRAINT "operating_closures_closed_on_key" UNIQUE (closed_on);
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_ecd_id_dispatch_date_key" UNIQUE (ecd_id, dispatch_date);
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_public_token_key" UNIQUE (public_token);
ALTER TABLE public."product_barcodes" ADD CONSTRAINT "product_barcodes_code_key" UNIQUE (code);
ALTER TABLE public."products" ADD CONSTRAINT "products_name_key" UNIQUE (name);
ALTER TABLE public."products" ADD CONSTRAINT "products_stock_keeping_unit_key" UNIQUE (stock_keeping_unit);
ALTER TABLE public."programmes" ADD CONSTRAINT "programmes_code_key" UNIQUE (code);
ALTER TABLE public."push_subscriptions" ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE (endpoint);
ALTER TABLE public."quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_realm_id_key" UNIQUE (realm_id);
ALTER TABLE public."quickbooks_object_map" ADD CONSTRAINT "qbo_map_unique_remote" UNIQUE (qbo_object_type, qbo_id);
ALTER TABLE public."quickbooks_sync_queue" ADD CONSTRAINT "quickbooks_sync_queue_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."recipe_lines" ADD CONSTRAINT "recipe_lines_one_per_product" UNIQUE (recipe_id, product_id);
ALTER TABLE public."reporting_factors" ADD CONSTRAINT "reporting_factors_factor_key_effective_from_key" UNIQUE (factor_key, effective_from);
ALTER TABLE public."section18a_certificates" ADD CONSTRAINT "section18a_certificates_certificate_number_key" UNIQUE (certificate_number);
ALTER TABLE public."stock_count_lines" ADD CONSTRAINT "scl_one_line_per_product" UNIQUE (stock_count_id, product_id);
ALTER TABLE public."storage_locations" ADD CONSTRAINT "storage_locations_name_key" UNIQUE (name);
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_name_key" UNIQUE (name);
ALTER TABLE public."users" ADD CONSTRAINT "users_username_key" UNIQUE (username);
ALTER TABLE public."vms_sync" ADD CONSTRAINT "uq_vms_sync_entity" UNIQUE (entity_type, entity_id);
ALTER TABLE public."volunteer_bookings" ADD CONSTRAINT "uq_volunteer_bookings_external_booking_id" UNIQUE (external_booking_id);
ALTER TABLE public."attendance" ADD CONSTRAINT "chk_attendance_check_in_consistency" CHECK ((((checked_in = false) AND (check_in_time IS NULL)) OR ((checked_in = true) AND (check_in_time IS NOT NULL))));
ALTER TABLE public."barcode_scan_events" ADD CONSTRAINT "barcode_scan_events_outcome_check" CHECK (((outcome)::text = ANY ((ARRAY['counted'::character varying, 'not_on_list'::character varying, 'already_done'::character varying, 'unknown'::character varying, 'linked'::character varying, 'misread'::character varying])::text[])));
ALTER TABLE public."barcode_scan_events" ADD CONSTRAINT "barcode_scan_events_screen_check" CHECK (((screen)::text = ANY ((ARRAY['receiving'::character varying, 'donation'::character varying, 'packing'::character varying, 'stock_count'::character varying])::text[])));
ALTER TABLE public."certificate_settings" ADD CONSTRAINT "certificate_settings_id_check" CHECK ((id = 1));
ALTER TABLE public."collection_kit_records" ADD CONSTRAINT "collection_kit_records_kg_compost_check" CHECK ((kg_compost >= (0)::numeric));
ALTER TABLE public."collection_kit_records" ADD CONSTRAINT "collection_kit_records_status_check" CHECK (((status)::text = ANY ((ARRAY['logged'::character varying, 'dispatched'::character varying])::text[])));
ALTER TABLE public."community_request_items" ADD CONSTRAINT "community_request_items_quantity_approved_check" CHECK ((quantity_approved > (0)::numeric));
ALTER TABLE public."community_request_items" ADD CONSTRAINT "community_request_items_quantity_released_check" CHECK ((quantity_released >= (0)::numeric));
ALTER TABLE public."community_request_items" ADD CONSTRAINT "community_request_items_released_le_approved" CHECK ((quantity_released <= quantity_approved));
ALTER TABLE public."decanting_lines" ADD CONSTRAINT "decanting_lines_partial_bag_actual_kg_check" CHECK (((partial_bag_actual_kg IS NULL) OR ((partial_bag_actual_kg > (0)::numeric) AND (partial_bag_actual_kg < 0.5))));
ALTER TABLE public."delivery_note_items" ADD CONSTRAINT "delivery_note_items_received_quantity_check" CHECK ((received_quantity >= (0)::numeric));
ALTER TABLE public."delivery_note_items" ADD CONSTRAINT "delivery_note_items_storage_area_check" CHECK (((storage_area IS NULL) OR ((storage_area)::text = ANY ((ARRAY['cold_room'::character varying, 'dry_store'::character varying, 'fts_section'::character varying, 'mezzanine'::character varying, 'boardroom'::character varying])::text[]))));
ALTER TABLE public."delivery_notes" ADD CONSTRAINT "delivery_notes_status_check" CHECK (((status)::text = ANY ((ARRAY['recorded'::character varying, 'flagged'::character varying, 'closed'::character varying])::text[])));
ALTER TABLE public."delivery_receipts" ADD CONSTRAINT "dr_collected_requires_confirmation" CHECK (((outcome = 'not_collected'::collection_outcome) OR ((confirmed_by IS NOT NULL) AND (confirmed_at IS NOT NULL))));
ALTER TABLE public."dispatch_event_lines" ADD CONSTRAINT "dispatch_event_lines_loaded_quantity_check" CHECK ((loaded_quantity >= (0)::numeric));
ALTER TABLE public."dispatch_events" ADD CONSTRAINT "dispatch_events_status_check" CHECK (((status)::text = ANY ((ARRAY['awaiting'::character varying, 'collected'::character varying, 'late_collected'::character varying, 'not_collected'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE public."donation_allocations" ADD CONSTRAINT "donation_allocations_allocated_quantity_check" CHECK ((allocated_quantity >= (0)::numeric));
ALTER TABLE public."donation_allocations" ADD CONSTRAINT "donation_allocations_beneficiary_type_valid" CHECK (((beneficiary_type)::text = ANY ((ARRAY['ecd'::character varying, 'soup_kitchen'::character varying, 'dignity_kitchen'::character varying, 'other'::character varying])::text[])));
ALTER TABLE public."donation_category_routing" ADD CONSTRAINT "donation_category_routing_category_check" CHECK (((category)::text = ANY ((ARRAY['recipe_food'::character varying, 'add_on_food'::character varying, 'non_recipe_food'::character varying, 'non_food'::character varying])::text[])));
ALTER TABLE public."donation_email_logs" ADD CONSTRAINT "donation_email_logs_email_type_check" CHECK ((email_type = ANY (ARRAY['THANK_YOU'::text, 'SECTION_18A'::text])));
ALTER TABLE public."donation_email_logs" ADD CONSTRAINT "donation_email_logs_status_check" CHECK ((status = ANY (ARRAY['SENT'::text, 'FAILED'::text])));
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_identifiable" CHECK (((product_id IS NOT NULL) OR (description IS NOT NULL)));
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_line_no_positive" CHECK ((line_no > 0));
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_quantity_check" CHECK ((quantity > (0)::numeric));
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_routing_source_valid" CHECK (((routing_source)::text = ANY ((ARRAY['manual_override'::character varying, 'product_default'::character varying, 'manual_category'::character varying, 'unclassified'::character varying])::text[])));
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_routing_status_check" CHECK (((routing_status)::text = ANY ((ARRAY['pending'::character varying, 'allocated'::character varying, 'unmatched'::character varying, 'not_stock_bearing'::character varying, 'awaiting_programme_stock'::character varying])::text[])));
ALTER TABLE public."donation_routing_defaults" ADD CONSTRAINT "donation_routing_defaults_donation_category_check" CHECK (((donation_category)::text = ANY ((ARRAY['recipe_food'::character varying, 'add_on_food'::character varying, 'non_recipe_food'::character varying, 'non_food'::character varying])::text[])));
ALTER TABLE public."donation_settings" ADD CONSTRAINT "donation_settings_id_check" CHECK ((id = 1));
ALTER TABLE public."donations" ADD CONSTRAINT "donations_donation_category_valid" CHECK (((donation_category)::text = ANY ((ARRAY['recipe_food'::character varying, 'add_on_food'::character varying, 'non_recipe_food'::character varying, 'non_food'::character varying])::text[])));
ALTER TABLE public."donations" ADD CONSTRAINT "donations_donor_registration_type_valid" CHECK (((donor_registration_type)::text = ANY ((ARRAY['individual'::character varying, 'company'::character varying, 'company_public'::character varying, 'cc'::character varying, 'npc'::character varying, 'trust'::character varying, 'estate'::character varying, 'association'::character varying])::text[])));
ALTER TABLE public."donations" ADD CONSTRAINT "donations_estimated_value_zar_check" CHECK ((estimated_value_zar >= (0)::numeric));
ALTER TABLE public."donations" ADD CONSTRAINT "donations_s18a_consistency" CHECK (((section_18a_certificate_ref IS NULL) OR (section_18a_qualifying = true)));
ALTER TABLE public."donations" ADD CONSTRAINT "donations_section_18a_status_check" CHECK (((section_18a_status)::text = ANY ((ARRAY['not_evaluated'::character varying, 'not_qualifying'::character varying, 'qualifying_pending_donor'::character varying, 'queued'::character varying, 'issued'::character varying, 'failed'::character varying])::text[])));
ALTER TABLE public."donations" ADD CONSTRAINT "donations_status_valid" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'under_review'::character varying, 'ready_for_commit'::character varying, 'committed'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE public."ecd_centres" ADD CONSTRAINT "ecd_centres_child_count_check" CHECK ((child_count >= 0));
ALTER TABLE public."ecd_centres" ADD CONSTRAINT "ecd_centres_location_source_check" CHECK (((location_source IS NULL) OR (location_source = ANY (ARRAY['manual'::text, 'geocoded'::text, 'imported'::text]))));
ALTER TABLE public."ecd_centres" ADD CONSTRAINT "ecd_centres_pin_check" CHECK ((((latitude IS NULL) AND (longitude IS NULL)) OR (((latitude >= ('-35'::integer)::numeric) AND (latitude <= ('-22'::integer)::numeric)) AND ((longitude >= (16)::numeric) AND (longitude <= (33)::numeric)))));
ALTER TABLE public."ecd_collection_reminders" ADD CONSTRAINT "ecd_collection_reminders_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sending'::character varying, 'sent'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE public."ecd_order_lines" ADD CONSTRAINT "ecd_order_lines_quantity_check" CHECK ((quantity > (0)::numeric));
ALTER TABLE public."ecd_order_lines" ADD CONSTRAINT "ecd_order_lines_unit_check" CHECK (((unit)::text = ANY ((ARRAY['kg'::character varying, 'g'::character varying, 'l'::character varying, 'ml'::character varying, 'each'::character varying, 'bag'::character varying, 'box'::character varying, 'crate'::character varying, 'punnet'::character varying])::text[]))) NOT VALID;
ALTER TABLE public."event_timeslots" ADD CONSTRAINT "chk_event_timeslots_capacity" CHECK ((capacity > 0));
ALTER TABLE public."event_timeslots" ADD CONSTRAINT "chk_event_timeslots_end_after_start" CHECK ((end_time > start_time));
ALTER TABLE public."event_timeslots" ADD CONSTRAINT "chk_event_timeslots_status" CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying, 'CANCELLED'::character varying])::text[])));
ALTER TABLE public."expiry_warning_dismissals" ADD CONSTRAINT "expiry_dismissal_restore_pair" CHECK (((restored_by IS NULL) = (restored_at IS NULL)));
ALTER TABLE public."expiry_warning_dismissals" ADD CONSTRAINT "expiry_warning_dismissals_reason_check" CHECK ((length(btrim(reason)) > 0));
ALTER TABLE public."finance_report_email_logs" ADD CONSTRAINT "finance_report_email_logs_status_check" CHECK ((status = ANY (ARRAY['SENT'::text, 'FAILED'::text])));
ALTER TABLE public."finance_report_email_settings" ADD CONSTRAINT "finance_report_email_settings_id_check" CHECK ((id = 1));
ALTER TABLE public."idempotency_keys" ADD CONSTRAINT "idempotency_keys_key_check" CHECK (((char_length(key) >= 8) AND (char_length(key) <= 100)));
ALTER TABLE public."love_activism_events" ADD CONSTRAINT "chk_love_activism_events_status" CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'SCHEDULED'::character varying, 'PUBLISHED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])));
ALTER TABLE public."operating_closures" ADD CONSTRAINT "operating_closures_kind_check" CHECK ((kind = ANY (ARRAY['public_holiday'::text, 'closure'::text])));
ALTER TABLE public."operating_closures" ADD CONSTRAINT "operating_closures_label_check" CHECK (((char_length(label) >= 1) AND (char_length(label) <= 120)));
ALTER TABLE public."outbound_messages" ADD CONSTRAINT "outbound_messages_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'stubbed'::text, 'failed'::text])));
ALTER TABLE public."pending_donation_items" ADD CONSTRAINT "pending_donation_items_source_check" CHECK (((source)::text = ANY ((ARRAY['product_default'::character varying, 'manual_category'::character varying, 'unclassified'::character varying, 'pending_manual_review'::character varying])::text[])));
ALTER TABLE public."pending_donation_items" ADD CONSTRAINT "pending_donation_items_status_check" CHECK (((status)::text = ANY ((ARRAY['awaiting_resolution'::character varying, 'resolved'::character varying, 'committed'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE public."pending_donations" ADD CONSTRAINT "pending_donations_donor_registration_type_valid" CHECK (((donor_registration_type)::text = ANY ((ARRAY['individual'::character varying, 'company'::character varying, 'company_public'::character varying, 'cc'::character varying, 'npc'::character varying, 'trust'::character varying, 'estate'::character varying, 'association'::character varying])::text[])));
ALTER TABLE public."pending_donations" ADD CONSTRAINT "pending_donations_status_check" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'awaiting_resolution'::character varying, 'committing'::character varying, 'committed'::character varying, 'cancelled'::character varying, 'commit_failed'::character varying, 'commit_incomplete'::character varying])::text[])));
ALTER TABLE public."photos" ADD CONSTRAINT "photos_byte_size_check" CHECK (((byte_size >= 1) AND (byte_size <= 409600)));
ALTER TABLE public."photos" ADD CONSTRAINT "photos_content_type_check" CHECK ((content_type = ANY (ARRAY['image/jpeg'::text, 'image/webp'::text, 'image/png'::text])));
ALTER TABLE public."photos" ADD CONSTRAINT "photos_entity_type_check" CHECK ((entity_type = ANY (ARRAY['picking_slip_item'::text, 'purchase_order'::text])));
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'complete'::character varying, 'dispatched'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE public."picking_slips" ADD CONSTRAINT "ps_beneficiary_consistency" CHECK ((((beneficiary_kind = 'ecd'::beneficiary_type) AND (ecd_id IS NOT NULL) AND (beneficiary_name IS NULL)) OR ((beneficiary_kind <> 'ecd'::beneficiary_type) AND (ecd_id IS NULL) AND (beneficiary_name IS NOT NULL))));
ALTER TABLE public."product_barcodes" ADD CONSTRAINT "product_barcodes_units_per_scan_check" CHECK ((units_per_scan > (0)::numeric));
ALTER TABLE public."products" ADD CONSTRAINT "products_archived_implies_inactive" CHECK (((archived_at IS NULL) OR (is_active = false)));
ALTER TABLE public."products" ADD CONSTRAINT "products_storage_type_check" CHECK (((storage_type)::text = ANY ((ARRAY['dry'::character varying, 'cold'::character varying])::text[])));
ALTER TABLE public."products" ADD CONSTRAINT "products_unit_cost_non_negative" CHECK (((unit_cost IS NULL) OR (unit_cost >= (0)::numeric)));
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "poi_unit_price_non_negative" CHECK (((unit_price IS NULL) OR (unit_price >= (0)::numeric)));
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "poi_weight_non_negative" CHECK (((expected_weight_kg IS NULL) OR (expected_weight_kg >= (0)::numeric)));
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_expected_quantity_check" CHECK ((expected_quantity > (0)::numeric));
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_expected_quantity_places" CHECK ((expected_quantity = round(expected_quantity, 3)));
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_finance_email_status_check" CHECK ((finance_email_status = ANY (ARRAY['sent'::text, 'failed'::text])));
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_returned_needs_reason" CHECK ((((status)::text <> 'returned'::text) OR (status_reason IS NOT NULL)));
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'in_transit'::character varying, 'partially_received'::character varying, 'completed'::character varying, 'returned'::character varying, 'follow_up_required'::character varying])::text[])));
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_status_reason_required" CHECK ((((status)::text <> ALL ((ARRAY['returned'::character varying, 'follow_up_required'::character varying])::text[])) OR ((status_reason IS NOT NULL) AND (btrim(status_reason) <> ''::text)))) NOT VALID;
ALTER TABLE public."recipe_lines" ADD CONSTRAINT "recipe_lines_quantity_per_child_check" CHECK ((quantity_per_child > (0)::numeric));
ALTER TABLE public."recipes" ADD CONSTRAINT "recipes_kind_check" CHECK ((kind = ANY (ARRAY['summer'::text, 'winter'::text, 'override'::text])));
ALTER TABLE public."recipes" ADD CONSTRAINT "recipes_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)));
ALTER TABLE public."recipes" ADD CONSTRAINT "recipes_season_start_day_check" CHECK (((season_start_day >= 1) AND (season_start_day <= 31)));
ALTER TABLE public."recipes" ADD CONSTRAINT "recipes_season_start_month_check" CHECK (((season_start_month >= 1) AND (season_start_month <= 12)));
ALTER TABLE public."recipes" ADD CONSTRAINT "recipes_shape_check" CHECK ((((kind = 'override'::text) AND (starts_on IS NOT NULL) AND (ends_on IS NOT NULL) AND (ends_on >= starts_on) AND (season_start_month IS NULL) AND (season_start_day IS NULL)) OR ((kind <> 'override'::text) AND (starts_on IS NULL) AND (ends_on IS NULL) AND (season_start_month IS NOT NULL) AND (season_start_day IS NOT NULL))));
ALTER TABLE public."reporting_factors" ADD CONSTRAINT "reporting_factors_value_check" CHECK ((value > (0)::numeric));
ALTER TABLE public."reporting_queries" ADD CONSTRAINT "reporting_queries_outcome_check" CHECK (((outcome)::text = ANY ((ARRAY['ok'::character varying, 'clarify'::character varying, 'unresolved'::character varying, 'error'::character varying])::text[])));
ALTER TABLE public."reporting_targets" ADD CONSTRAINT "reporting_targets_value_check" CHECK ((value >= (0)::numeric));
ALTER TABLE public."saved_reports" ADD CONSTRAINT "saved_reports_kind_check" CHECK (((kind)::text = ANY ((ARRAY['report'::character varying, 'custom'::character varying, 'comparison'::character varying])::text[])));
ALTER TABLE public."saved_reports" ADD CONSTRAINT "saved_reports_schedule_check" CHECK (((schedule)::text = ANY ((ARRAY['none'::character varying, 'weekly'::character varying, 'monthly'::character varying])::text[])));
ALTER TABLE public."section18a_settings" ADD CONSTRAINT "section18a_settings_id_check" CHECK ((id = 1));
ALTER TABLE public."stock_count_lines" ADD CONSTRAINT "stock_count_lines_counted_quantity_check" CHECK ((counted_quantity >= (0)::numeric));
ALTER TABLE public."stock_levels" ADD CONSTRAINT "stock_levels_unit_check" CHECK (((unit)::text = ANY ((ARRAY['kg'::character varying, 'g'::character varying, 'l'::character varying, 'ml'::character varying, 'each'::character varying, 'bag'::character varying, 'box'::character varying, 'crate'::character varying, 'punnet'::character varying])::text[]))) NOT VALID;
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_movement_type_check" CHECK (((movement_type)::text = ANY ((ARRAY['adjustment'::character varying, 'decanted'::character varying, 'dispatched'::character varying, 'donated'::character varying, 'picked'::character varying, 'received'::character varying, 'wastage'::character varying])::text[])));
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_unit_check" CHECK (((unit IS NULL) OR ((unit)::text = ANY ((ARRAY['kg'::character varying, 'g'::character varying, 'l'::character varying, 'ml'::character varying, 'each'::character varying, 'bag'::character varying, 'box'::character varying, 'crate'::character varying, 'punnet'::character varying])::text[])))) NOT VALID;
ALTER TABLE public."supplier_prospects" ADD CONSTRAINT "supplier_prospects_conversion_consistency" CHECK (((((status)::text = 'converted'::text) AND (converted_supplier_id IS NOT NULL)) OR (((status)::text <> 'converted'::text) AND (converted_supplier_id IS NULL))));
ALTER TABLE public."supplier_prospects" ADD CONSTRAINT "supplier_prospects_status_check" CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'contacted'::character varying, 'rejected'::character varying, 'converted'::character varying])::text[])));
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_archived_implies_inactive" CHECK (((archived_at IS NULL) OR (is_active = false)));
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_deactivation_consistency" CHECK (((is_active = true) OR (deactivated_at IS NOT NULL)));
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_lead_time_check" CHECK (((expected_lead_time_days IS NULL) OR ((expected_lead_time_days >= 0) AND (expected_lead_time_days <= 365))));
ALTER TABLE public."user_invites" ADD CONSTRAINT "user_invites_email_status_check" CHECK ((email_status = ANY (ARRAY['sent'::text, 'stubbed'::text, 'failed'::text])));
ALTER TABLE public."user_invites" ADD CONSTRAINT "user_invites_role_check" CHECK ((role = ANY (ARRAY['warehouse_worker'::text, 'manager'::text, 'admin'::text])));
ALTER TABLE public."users" ADD CONSTRAINT "users_archived_implies_inactive" CHECK (((archived_at IS NULL) OR (is_active = false)));
ALTER TABLE public."users" ADD CONSTRAINT "users_language_check" CHECK ((language = ANY (ARRAY['en'::text, 'af'::text, 'xh'::text])));
ALTER TABLE public."users" ADD CONSTRAINT "users_role_check" CHECK (((role)::text = ANY ((ARRAY['warehouse_worker'::character varying, 'manager'::character varying, 'admin'::character varying])::text[])));
ALTER TABLE public."vms_sync" ADD CONSTRAINT "chk_vms_sync_entity_type" CHECK (((entity_type)::text = ANY ((ARRAY['EVENT'::character varying, 'TIMESLOT'::character varying, 'event_booking'::character varying])::text[])));
ALTER TABLE public."vms_sync" ADD CONSTRAINT "chk_vms_sync_status" CHECK (((sync_status)::text = ANY ((ARRAY['PENDING'::character varying, 'SYNCED'::character varying, 'FAILED'::character varying])::text[])));
ALTER TABLE public."volunteer_bookings" ADD CONSTRAINT "chk_volunteer_bookings_external_ids" CHECK ((((booking_source)::text <> 'VMS'::text) OR ((external_booking_id IS NOT NULL) AND (external_volunteer_id IS NOT NULL))));
ALTER TABLE public."volunteer_bookings" ADD CONSTRAINT "chk_volunteer_bookings_source" CHECK (((booking_source)::text = ANY ((ARRAY['VMS'::character varying, 'WMS_GUEST'::character varying])::text[])));
ALTER TABLE public."volunteer_bookings" ADD CONSTRAINT "chk_volunteer_bookings_status" CHECK (((booking_status)::text = ANY ((ARRAY['CONFIRMED'::character varying, 'CANCELLED'::character varying])::text[])));
ALTER TABLE public."warehouse_area_counts" ADD CONSTRAINT "warehouse_area_counts_quantity_check" CHECK ((quantity >= (0)::numeric));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_capacity_kg_check" CHECK (((capacity_kg IS NULL) OR (capacity_kg > (0)::numeric)));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_grid_h_check" CHECK ((grid_h >= 1));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_grid_w_check" CHECK ((grid_w >= 1));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_grid_x_check" CHECK ((grid_x >= 0));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_grid_y_check" CHECK ((grid_y >= 0));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_kind_check" CHECK ((kind = ANY (ARRAY['dry'::text, 'cold'::text, 'floor'::text, 'staging'::text, 'door'::text, 'dispatch_gate'::text, 'receiving_gate'::text])));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_levels_check" CHECK (((levels >= 1) AND (levels <= 4)));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 40)));
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_pallet_spaces_check" CHECK (((pallet_spaces IS NULL) OR (pallet_spaces > 0)));

-- -- Foreign keys -------------------------------------------
ALTER TABLE public."app_settings" ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE public."assistant_queries" ADD CONSTRAINT "assistant_queries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_booking_id_fkey" FOREIGN KEY (booking_id) REFERENCES volunteer_bookings(booking_id);
ALTER TABLE public."barcode_scan_events" ADD CONSTRAINT "barcode_scan_events_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."barcode_scan_events" ADD CONSTRAINT "barcode_scan_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public."collection_kit_records" ADD CONSTRAINT "collection_kit_records_kit_id_fkey" FOREIGN KEY (kit_id) REFERENCES collection_kits(id);
ALTER TABLE public."collection_kit_records" ADD CONSTRAINT "collection_kit_records_logged_by_fkey" FOREIGN KEY (logged_by) REFERENCES users(id);
ALTER TABLE public."community_request_items" ADD CONSTRAINT "community_request_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."community_request_items" ADD CONSTRAINT "community_request_items_request_id_fkey" FOREIGN KEY (request_id) REFERENCES community_requests(id) ON DELETE CASCADE;
ALTER TABLE public."community_requests" ADD CONSTRAINT "community_requests_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."community_requests" ADD CONSTRAINT "community_requests_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."community_requests" ADD CONSTRAINT "community_requests_handled_by_fkey" FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."community_requests" ADD CONSTRAINT "community_requests_logged_by_fkey" FOREIGN KEY (logged_by) REFERENCES users(id);
ALTER TABLE public."decanting_lines" ADD CONSTRAINT "decanting_lines_decanting_id_fkey" FOREIGN KEY (decanting_id) REFERENCES decanting_records(id) ON DELETE CASCADE;
ALTER TABLE public."decanting_lines" ADD CONSTRAINT "decanting_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."decanting_records" ADD CONSTRAINT "decanting_records_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES users(id);
ALTER TABLE public."delivery_note_items" ADD CONSTRAINT "delivery_note_items_delivery_note_id_fkey" FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id) ON DELETE CASCADE;
ALTER TABLE public."delivery_note_items" ADD CONSTRAINT "delivery_note_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public."delivery_note_items" ADD CONSTRAINT "delivery_note_items_purchase_order_item_id_fkey" FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id) ON DELETE SET NULL;
ALTER TABLE public."delivery_note_items" ADD CONSTRAINT "dni_location_fk" FOREIGN KEY (location_id) REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public."delivery_notes" ADD CONSTRAINT "delivery_notes_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT;
ALTER TABLE public."delivery_notes" ADD CONSTRAINT "delivery_notes_received_by_fkey" FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."delivery_notes" ADD CONSTRAINT "delivery_notes_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;
ALTER TABLE public."delivery_receipts" ADD CONSTRAINT "delivery_receipts_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."delivery_receipts" ADD CONSTRAINT "delivery_receipts_ecd_id_fkey" FOREIGN KEY (ecd_id) REFERENCES ecd_centres(id) ON DELETE RESTRICT;
ALTER TABLE public."delivery_receipts" ADD CONSTRAINT "delivery_receipts_picking_slip_id_fkey" FOREIGN KEY (picking_slip_id) REFERENCES picking_slips(id) ON DELETE CASCADE;
ALTER TABLE public."dispatch_event_lines" ADD CONSTRAINT "dispatch_event_lines_dispatch_event_id_fkey" FOREIGN KEY (dispatch_event_id) REFERENCES dispatch_events(id) ON DELETE CASCADE;
ALTER TABLE public."dispatch_event_lines" ADD CONSTRAINT "dispatch_event_lines_picking_slip_item_id_fkey" FOREIGN KEY (picking_slip_item_id) REFERENCES picking_slip_items(id) ON DELETE SET NULL;
ALTER TABLE public."dispatch_event_lines" ADD CONSTRAINT "dispatch_event_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public."dispatch_events" ADD CONSTRAINT "dispatch_events_dispatched_by_fkey" FOREIGN KEY (dispatched_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."dispatch_events" ADD CONSTRAINT "dispatch_events_override_by_fkey" FOREIGN KEY (override_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."dispatch_events" ADD CONSTRAINT "dispatch_events_picking_slip_id_fkey" FOREIGN KEY (picking_slip_id) REFERENCES picking_slips(id) ON DELETE RESTRICT;
ALTER TABLE public."donation_allocations" ADD CONSTRAINT "donation_allocations_donation_item_id_fkey" FOREIGN KEY (donation_item_id) REFERENCES donation_items(id) ON DELETE CASCADE;
ALTER TABLE public."donation_allocations" ADD CONSTRAINT "donation_allocations_ecd_centre_id_fkey" FOREIGN KEY (ecd_centre_id) REFERENCES ecd_centres(id);
ALTER TABLE public."donation_category_routing" ADD CONSTRAINT "donation_category_routing_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE public."donation_email_logs" ADD CONSTRAINT "donation_email_logs_certificate_id_fkey" FOREIGN KEY (certificate_id) REFERENCES section18a_certificates(id);
ALTER TABLE public."donation_email_logs" ADD CONSTRAINT "donation_email_logs_donation_id_fkey" FOREIGN KEY (donation_id) REFERENCES donations(id);
ALTER TABLE public."donation_email_logs" ADD CONSTRAINT "donation_email_logs_sent_by_user_id_fkey" FOREIGN KEY (sent_by_user_id) REFERENCES users(id);
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_donation_id_fkey" FOREIGN KEY (donation_id) REFERENCES donations(id) ON DELETE CASCADE;
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id);
ALTER TABLE public."donation_items" ADD CONSTRAINT "donation_items_storage_location_id_fkey" FOREIGN KEY (storage_location_id) REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public."donation_routing_defaults" ADD CONSTRAINT "donation_routing_defaults_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."donation_routing_defaults" ADD CONSTRAINT "donation_routing_defaults_set_by_fkey" FOREIGN KEY (set_by) REFERENCES users(id);
ALTER TABLE public."donations" ADD CONSTRAINT "donations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."donations" ADD CONSTRAINT "donations_donor_id_fkey" FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE SET NULL;
ALTER TABLE public."donations" ADD CONSTRAINT "donations_programme_id_fkey" FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT;
ALTER TABLE public."donations" ADD CONSTRAINT "donations_received_by_fkey" FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."ecd_centres" ADD CONSTRAINT "ecd_centres_location_updated_by_fkey" FOREIGN KEY (location_updated_by) REFERENCES users(id);
ALTER TABLE public."ecd_collection_reminders" ADD CONSTRAINT "ecd_collection_reminders_ecd_id_fkey" FOREIGN KEY (ecd_id) REFERENCES ecd_centres(id);
ALTER TABLE public."ecd_order_lines" ADD CONSTRAINT "ecd_order_lines_ecd_id_fkey" FOREIGN KEY (ecd_id) REFERENCES ecd_centres(id) ON DELETE CASCADE;
ALTER TABLE public."ecd_order_lines" ADD CONSTRAINT "ecd_order_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."event_timeslots" ADD CONSTRAINT "event_timeslots_event_id_fkey" FOREIGN KEY (event_id) REFERENCES love_activism_events(event_id);
ALTER TABLE public."event_timeslots" ADD CONSTRAINT "event_timeslots_space_id_fkey" FOREIGN KEY (space_id) REFERENCES event_spaces(space_id);
ALTER TABLE public."expiry_warning_dismissals" ADD CONSTRAINT "expiry_warning_dismissals_delivery_note_item_id_fkey" FOREIGN KEY (delivery_note_item_id) REFERENCES delivery_note_items(id);
ALTER TABLE public."expiry_warning_dismissals" ADD CONSTRAINT "expiry_warning_dismissals_dismissed_by_fkey" FOREIGN KEY (dismissed_by) REFERENCES users(id);
ALTER TABLE public."expiry_warning_dismissals" ADD CONSTRAINT "expiry_warning_dismissals_restored_by_fkey" FOREIGN KEY (restored_by) REFERENCES users(id);
ALTER TABLE public."finance_report_access_links" ADD CONSTRAINT "finance_report_access_links_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."finance_report_access_links" ADD CONSTRAINT "finance_report_access_links_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES users(id);
ALTER TABLE public."finance_report_email_logs" ADD CONSTRAINT "finance_report_email_logs_finance_link_id_fkey" FOREIGN KEY (finance_link_id) REFERENCES finance_report_access_links(id);
ALTER TABLE public."finance_report_email_logs" ADD CONSTRAINT "finance_report_email_logs_sent_by_user_id_fkey" FOREIGN KEY (sent_by_user_id) REFERENCES users(id);
ALTER TABLE public."finance_report_email_settings" ADD CONSTRAINT "finance_report_email_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE public."gmail_connections" ADD CONSTRAINT "gmail_connections_connected_by_user_id_fkey" FOREIGN KEY (connected_by_user_id) REFERENCES users(id);
ALTER TABLE public."idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public."love_activism_events" ADD CONSTRAINT "love_activism_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."notification_reads" ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
ALTER TABLE public."notification_reads" ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."operating_closures" ADD CONSTRAINT "operating_closures_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."outbound_messages" ADD CONSTRAINT "outbound_messages_sent_by_fkey" FOREIGN KEY (sent_by) REFERENCES users(id);
ALTER TABLE public."password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public."pending_donation_items" ADD CONSTRAINT "pending_donation_items_committed_donation_item_id_fkey" FOREIGN KEY (committed_donation_item_id) REFERENCES donation_items(id);
ALTER TABLE public."pending_donation_items" ADD CONSTRAINT "pending_donation_items_flag_id_fkey" FOREIGN KEY (flag_id) REFERENCES warehouse_manager_flags(id);
ALTER TABLE public."pending_donation_items" ADD CONSTRAINT "pending_donation_items_pending_donation_id_fkey" FOREIGN KEY (pending_donation_id) REFERENCES pending_donations(id) ON DELETE CASCADE;
ALTER TABLE public."pending_donation_items" ADD CONSTRAINT "pending_donation_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."pending_donation_items" ADD CONSTRAINT "pending_donation_items_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id);
ALTER TABLE public."pending_donations" ADD CONSTRAINT "pending_donations_committed_donation_id_fkey" FOREIGN KEY (committed_donation_id) REFERENCES donations(id);
ALTER TABLE public."pending_donations" ADD CONSTRAINT "pending_donations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."pending_donations" ADD CONSTRAINT "pending_donations_programme_id_fkey" FOREIGN KEY (programme_id) REFERENCES programmes(id);
ALTER TABLE public."photos" ADD CONSTRAINT "photos_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."picking_events" ADD CONSTRAINT "picking_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE public."picking_events" ADD CONSTRAINT "picking_events_picking_slip_id_fkey" FOREIGN KEY (picking_slip_id) REFERENCES picking_slips(id) ON DELETE CASCADE;
ALTER TABLE public."picking_slip_items" ADD CONSTRAINT "picking_slip_items_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES users(id);
ALTER TABLE public."picking_slip_items" ADD CONSTRAINT "picking_slip_items_picking_slip_id_fkey" FOREIGN KEY (picking_slip_id) REFERENCES picking_slips(id) ON DELETE CASCADE;
ALTER TABLE public."picking_slip_items" ADD CONSTRAINT "picking_slip_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_assigned_to_2_fkey" FOREIGN KEY (assigned_to_2) REFERENCES users(id);
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES users(id);
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_assigned_volunteer_id_fkey" FOREIGN KEY (assigned_volunteer_id) REFERENCES volunteers(id) ON DELETE SET NULL;
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES users(id);
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_ecd_id_fkey" FOREIGN KEY (ecd_id) REFERENCES ecd_centres(id);
ALTER TABLE public."picking_slips" ADD CONSTRAINT "picking_slips_generated_by_fkey" FOREIGN KEY (generated_by) REFERENCES users(id);
ALTER TABLE public."product_barcodes" ADD CONSTRAINT "product_barcodes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."product_barcodes" ADD CONSTRAINT "product_barcodes_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public."products" ADD CONSTRAINT "products_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES users(id);
ALTER TABLE public."products" ADD CONSTRAINT "products_default_location_id_fkey" FOREIGN KEY (default_location_id) REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public."products" ADD CONSTRAINT "products_programme_id_fkey" FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT;
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_follow_up_of_fkey" FOREIGN KEY (follow_up_of) REFERENCES purchase_orders(id);
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;
ALTER TABLE public."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_connected_by_user_id_fkey" FOREIGN KEY (connected_by_user_id) REFERENCES users(id);
ALTER TABLE public."recipe_lines" ADD CONSTRAINT "recipe_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_id_fkey" FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE public."recipe_own_order_centres" ADD CONSTRAINT "recipe_own_order_centres_added_by_fkey" FOREIGN KEY (added_by) REFERENCES users(id);
ALTER TABLE public."recipe_own_order_centres" ADD CONSTRAINT "recipe_own_order_centres_ecd_id_fkey" FOREIGN KEY (ecd_id) REFERENCES ecd_centres(id) ON DELETE CASCADE;
ALTER TABLE public."recipes" ADD CONSTRAINT "recipes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."reporting_queries" ADD CONSTRAINT "reporting_queries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public."reporting_targets" ADD CONSTRAINT "reporting_targets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."saved_reports" ADD CONSTRAINT "saved_reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."section18a_certificates" ADD CONSTRAINT "section18a_certificates_donation_id_fkey" FOREIGN KEY (donation_id) REFERENCES donations(id);
ALTER TABLE public."section18a_certificates" ADD CONSTRAINT "section18a_certificates_issued_by_fkey" FOREIGN KEY (issued_by) REFERENCES users(id);
ALTER TABLE public."stock_count_lines" ADD CONSTRAINT "stock_count_lines_counted_by_fkey" FOREIGN KEY (counted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."stock_count_lines" ADD CONSTRAINT "stock_count_lines_location_id_fkey" FOREIGN KEY (location_id) REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public."stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE public."stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_fkey" FOREIGN KEY (stock_count_id) REFERENCES stock_counts(id) ON DELETE CASCADE;
ALTER TABLE public."stock_counts" ADD CONSTRAINT "stock_counts_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."stock_counts" ADD CONSTRAINT "stock_counts_started_by_fkey" FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."stock_levels" ADD CONSTRAINT "stock_levels_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY (location_id) REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_performed_by_fkey" FOREIGN KEY (performed_by) REFERENCES users(id);
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_programme_id_fkey" FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT;
ALTER TABLE public."supplier_products" ADD CONSTRAINT "supplier_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_prospects" ADD CONSTRAINT "supplier_prospects_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."supplier_prospects" ADD CONSTRAINT "supplier_prospects_supplier_fkey" FOREIGN KEY (converted_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES users(id);
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_deactivated_by_fkey" FOREIGN KEY (deactivated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."user_invites" ADD CONSTRAINT "user_invites_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES users(id);
ALTER TABLE public."users" ADD CONSTRAINT "users_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES users(id);
ALTER TABLE public."volunteer_bookings" ADD CONSTRAINT "volunteer_bookings_timeslot_id_fkey" FOREIGN KEY (timeslot_id) REFERENCES event_timeslots(timeslot_id);
ALTER TABLE public."warehouse_area_counts" ADD CONSTRAINT "warehouse_area_counts_area_id_fkey" FOREIGN KEY (area_id) REFERENCES warehouse_areas(id);
ALTER TABLE public."warehouse_area_counts" ADD CONSTRAINT "warehouse_area_counts_counted_by_fkey" FOREIGN KEY (counted_by) REFERENCES users(id);
ALTER TABLE public."warehouse_area_counts" ADD CONSTRAINT "warehouse_area_counts_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public."warehouse_areas" ADD CONSTRAINT "warehouse_areas_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE public."warehouse_manager_flags" ADD CONSTRAINT "warehouse_manager_flags_pending_donation_id_fkey" FOREIGN KEY (pending_donation_id) REFERENCES pending_donations(id) ON DELETE SET NULL;
ALTER TABLE public."warehouse_manager_flags" ADD CONSTRAINT "warehouse_manager_flags_pending_donation_item_id_fkey" FOREIGN KEY (pending_donation_item_id) REFERENCES pending_donation_items(id) ON DELETE SET NULL;
ALTER TABLE public."warehouse_manager_flags" ADD CONSTRAINT "warehouse_manager_flags_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- -- Indexes ------------------------------------------------
CREATE INDEX idx_assistant_queries_outcome_date ON public.assistant_queries USING btree (outcome, created_at DESC);
CREATE INDEX idx_assistant_queries_topic ON public.assistant_queries USING btree (topic_id) WHERE (topic_id IS NOT NULL);
CREATE INDEX idx_attendance_checked_in ON public.attendance USING btree (checked_in);
CREATE INDEX idx_audit_log_created_sast ON public.audit_log USING btree ((((created_at AT TIME ZONE 'Africa/Johannesburg'::text))::date));
CREATE INDEX barcode_scan_events_scanned_at_idx ON public.barcode_scan_events USING btree (scanned_at);
CREATE INDEX idx_collection_kit_records_kit ON public.collection_kit_records USING btree (kit_id);
CREATE INDEX idx_collection_kit_records_status ON public.collection_kit_records USING btree (status);
CREATE INDEX idx_community_request_items_product ON public.community_request_items USING btree (product_id);
CREATE INDEX idx_community_requests_sast ON public.community_requests USING btree ((((requested_at AT TIME ZONE 'Africa/Johannesburg'::text))::date));
CREATE INDEX idx_cr_outcome ON public.community_requests USING btree (outcome);
CREATE INDEX idx_cr_requested_at ON public.community_requests USING btree (requested_at);
CREATE INDEX idx_dl_product ON public.decanting_lines USING btree (product_id);
CREATE INDEX idx_dl_record ON public.decanting_lines USING btree (decanting_id);
CREATE INDEX idx_decanting_records_week_of ON public.decanting_records USING btree (week_of);
CREATE INDEX idx_dr_recorded_by ON public.decanting_records USING btree (recorded_by);
CREATE INDEX idx_delivery_note_items_expiry ON public.delivery_note_items USING btree (expiry_date) WHERE (expiry_date IS NOT NULL);
CREATE INDEX idx_dni_delivery_note ON public.delivery_note_items USING btree (delivery_note_id);
CREATE INDEX idx_dni_discrepancies ON public.delivery_note_items USING btree (delivery_note_id) WHERE ((discrepancy_quantity <> (0)::numeric) AND (discrepancy_resolved = false));
CREATE INDEX idx_dni_note_product ON public.delivery_note_items USING btree (delivery_note_id, product_id);
CREATE INDEX idx_dni_poi ON public.delivery_note_items USING btree (purchase_order_item_id);
CREATE INDEX idx_dni_product ON public.delivery_note_items USING btree (product_id);
CREATE INDEX idx_dni_unresolved ON public.delivery_note_items USING btree (delivery_note_id) WHERE ((discrepancy_resolved = false) AND (discrepancy_quantity <> (0)::numeric));
CREATE UNIQUE INDEX delivery_notes_idempotency_key_uniq ON public.delivery_notes USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_delivery_notes_date_supplier ON public.delivery_notes USING btree (delivery_date, supplier_id);
CREATE INDEX idx_dn_created_at ON public.delivery_notes USING btree (created_at);
CREATE INDEX idx_dn_delivery_date ON public.delivery_notes USING btree (delivery_date);
CREATE INDEX idx_dn_po ON public.delivery_notes USING btree (purchase_order_id);
CREATE INDEX idx_dn_received_by ON public.delivery_notes USING btree (received_by);
CREATE INDEX idx_dn_supplier ON public.delivery_notes USING btree (supplier_id);
CREATE INDEX idx_dr_dispatch_date ON public.delivery_receipts USING btree (dispatch_date);
CREATE INDEX idx_dr_ecd ON public.delivery_receipts USING btree (ecd_id);
CREATE INDEX idx_dr_missed ON public.delivery_receipts USING btree (ecd_id, dispatch_date DESC) WHERE (outcome = 'not_collected'::collection_outcome);
CREATE INDEX idx_dr_outcome ON public.delivery_receipts USING btree (outcome);
CREATE INDEX idx_dispatch_event_lines_slip_item ON public.dispatch_event_lines USING btree (picking_slip_item_id);
CREATE INDEX idx_dispatch_lines_event ON public.dispatch_event_lines USING btree (dispatch_event_id);
CREATE INDEX idx_dispatch_lines_product ON public.dispatch_event_lines USING btree (product_id);
CREATE INDEX idx_dispatch_events_by ON public.dispatch_events USING btree (dispatched_by);
CREATE INDEX idx_dispatch_events_slip_status ON public.dispatch_events USING btree (picking_slip_id, status);
CREATE INDEX idx_dispatch_events_status ON public.dispatch_events USING btree (status);
CREATE UNIQUE INDEX donation_allocations_item_ecd_centre_key ON public.donation_allocations USING btree (donation_item_id, ecd_centre_id) WHERE (ecd_centre_id IS NOT NULL);
CREATE INDEX idx_donation_allocations_ecd_centre_id ON public.donation_allocations USING btree (ecd_centre_id);
CREATE INDEX idx_donation_allocations_item_id ON public.donation_allocations USING btree (donation_item_id);
CREATE INDEX idx_donation_email_logs_created ON public.donation_email_logs USING btree (created_at DESC);
CREATE INDEX idx_donation_email_logs_donation ON public.donation_email_logs USING btree (donation_id);
CREATE INDEX idx_donation_email_logs_recipient_email ON public.donation_email_logs USING btree (recipient_email);
CREATE INDEX idx_donation_email_logs_type_status ON public.donation_email_logs USING btree (email_type, status);
CREATE UNIQUE INDEX donation_items_donation_line_no_key ON public.donation_items USING btree (donation_id, line_no);
CREATE INDEX idx_donation_items_donation ON public.donation_items USING btree (donation_id);
CREATE INDEX idx_donation_items_product_id ON public.donation_items USING btree (product_id);
CREATE INDEX idx_donation_items_unmatched ON public.donation_items USING btree (routing_status) WHERE ((routing_status)::text = 'unmatched'::text);
CREATE INDEX idx_donation_routing_defaults_category ON public.donation_routing_defaults USING btree (donation_category);
CREATE UNIQUE INDEX donations_idempotency_key_key ON public.donations USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_donations_donation_category ON public.donations USING btree (donation_category);
CREATE INDEX idx_donations_donor_contact ON public.donations USING btree (donor_contact);
CREATE INDEX idx_donations_donor_name ON public.donations USING btree (donor_name);
CREATE INDEX idx_donations_donor_tax_ref ON public.donations USING btree (donor_tax_reference);
CREATE INDEX idx_donations_programme_id ON public.donations USING btree (programme_id);
CREATE INDEX idx_donations_received_at ON public.donations USING btree (received_at);
CREATE INDEX idx_donations_received_sast ON public.donations USING btree ((((received_at AT TIME ZONE 'Africa/Johannesburg'::text))::date));
CREATE INDEX idx_donations_s18a ON public.donations USING btree (section_18a_qualifying) WHERE (section_18a_qualifying = true);
CREATE INDEX idx_donations_s18a_pending ON public.donations USING btree (section_18a_status) WHERE ((section_18a_status)::text = ANY ((ARRAY['qualifying_pending_donor'::character varying, 'queued'::character varying])::text[]));
CREATE INDEX idx_donations_section_18a_status ON public.donations USING btree (section_18a_status);
CREATE INDEX idx_donations_section18a_form_token_hash ON public.donations USING btree (section_18a_form_token_hash);
CREATE INDEX idx_donors_contact ON public.donors USING btree (contact);
CREATE INDEX idx_donors_name ON public.donors USING btree (name);
CREATE INDEX idx_ecd_active ON public.ecd_centres USING btree (is_active);
CREATE INDEX idx_ecd_cohort ON public.ecd_centres USING btree (cohort);
CREATE INDEX idx_ecd_collection_reminders_collection_date ON public.ecd_collection_reminders USING btree (collection_date);
CREATE INDEX idx_eol_ecd ON public.ecd_order_lines USING btree (ecd_id);
CREATE INDEX idx_eol_effective ON public.ecd_order_lines USING btree (effective_from, effective_to);
CREATE INDEX idx_eol_product ON public.ecd_order_lines USING btree (product_id);
CREATE INDEX idx_event_timeslots_event_id ON public.event_timeslots USING btree (event_id);
CREATE INDEX idx_event_timeslots_space_id ON public.event_timeslots USING btree (space_id);
CREATE INDEX idx_event_timeslots_start_time ON public.event_timeslots USING btree (start_time);
CREATE UNIQUE INDEX expiry_warning_dismissals_one_active ON public.expiry_warning_dismissals USING btree (delivery_note_item_id) WHERE (restored_at IS NULL);
CREATE INDEX idx_finance_report_access_links_active ON public.finance_report_access_links USING btree (token_hash) WHERE (revoked_at IS NULL);
CREATE INDEX idx_finance_report_email_logs_created_at ON public.finance_report_email_logs USING btree (created_at DESC);
CREATE UNIQUE INDEX idx_gmail_connections_connected_by_user_id ON public.gmail_connections USING btree (connected_by_user_id);
CREATE INDEX idx_gmail_connections_updated_at ON public.gmail_connections USING btree (updated_at);
CREATE INDEX idempotency_keys_created_at_idx ON public.idempotency_keys USING btree (created_at);
CREATE INDEX idx_love_activism_events_event_date ON public.love_activism_events USING btree (event_date);
CREATE INDEX idx_love_activism_events_status ON public.love_activism_events USING btree (status);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_target_roles ON public.notifications USING gin (target_roles);
CREATE INDEX idx_outbound_messages_attempted ON public.outbound_messages USING btree (attempted_at DESC, id DESC);
CREATE INDEX idx_outbound_messages_related ON public.outbound_messages USING btree (related_type, related_id);
CREATE INDEX idx_outbound_messages_type_attempted ON public.outbound_messages USING btree (type, attempted_at DESC, id DESC);
CREATE INDEX idx_password_resets_active ON public.password_resets USING btree (user_id, created_at DESC) WHERE ((used_at IS NULL) AND (superseded_at IS NULL));
CREATE INDEX idx_password_resets_token_hash ON public.password_resets USING btree (token_hash);
CREATE INDEX idx_pending_donation_items_flag_id ON public.pending_donation_items USING btree (flag_id);
CREATE INDEX idx_pending_donation_items_pending_donation_id ON public.pending_donation_items USING btree (pending_donation_id);
CREATE UNIQUE INDEX idx_pending_donations_idempotency_key ON public.pending_donations USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX photos_entity_idx ON public.photos USING btree (entity_type, entity_id);
CREATE INDEX idx_pevent_slip ON public.picking_events USING btree (picking_slip_id);
CREATE INDEX idx_picking_events_created_sast ON public.picking_events USING btree ((((created_at AT TIME ZONE 'Africa/Johannesburg'::text))::date));
CREATE INDEX idx_psi_packed ON public.picking_slip_items USING btree (product_id) WHERE ((packed_quantity IS NOT NULL) AND (packed_quantity > (0)::numeric));
CREATE INDEX idx_psi_product ON public.picking_slip_items USING btree (product_id);
CREATE INDEX idx_psi_slip ON public.picking_slip_items USING btree (picking_slip_id);
CREATE INDEX idx_psi_slip_status ON public.picking_slip_items USING btree (picking_slip_id, status);
CREATE INDEX idx_psi_status ON public.picking_slip_items USING btree (status);
CREATE INDEX idx_picking_slips_dispatch_date ON public.picking_slips USING btree (dispatch_date);
CREATE INDEX idx_picking_slips_status_date ON public.picking_slips USING btree (status, dispatch_date);
CREATE INDEX idx_pks_cohort ON public.picking_slips USING btree (cohort);
CREATE INDEX idx_pks_ecd ON public.picking_slips USING btree (ecd_id);
CREATE INDEX idx_ps_volunteer ON public.picking_slips USING btree (assigned_volunteer_id);
CREATE INDEX idx_pslip_assigned ON public.picking_slips USING btree (assigned_to);
CREATE INDEX idx_pslip_status ON public.picking_slips USING btree (status);
CREATE INDEX product_barcodes_product_id_idx ON public.product_barcodes USING btree (product_id);
CREATE INDEX idx_products_live ON public.products USING btree (name) WHERE (archived_at IS NULL);
CREATE INDEX idx_products_programme ON public.products USING btree (programme_id);
CREATE INDEX idx_poi_po ON public.purchase_order_items USING btree (purchase_order_id);
CREATE INDEX idx_poi_product ON public.purchase_order_items USING btree (product_id);
CREATE UNIQUE INDEX uq_poi_po_product ON public.purchase_order_items USING btree (purchase_order_id, product_id);
CREATE INDEX idx_po_created_at ON public.purchase_orders USING btree (created_at DESC);
CREATE INDEX idx_po_created_by ON public.purchase_orders USING btree (created_by);
CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);
CREATE INDEX idx_po_status_expected ON public.purchase_orders USING btree (status, expected_delivery_date);
CREATE INDEX idx_po_supplier ON public.purchase_orders USING btree (supplier_id);
CREATE INDEX purchase_orders_exception_idx ON public.purchase_orders USING btree (status, status_changed_at DESC) WHERE ((status)::text = ANY ((ARRAY['returned'::character varying, 'follow_up_required'::character varying])::text[]));
CREATE INDEX purchase_orders_follow_up_of_idx ON public.purchase_orders USING btree (follow_up_of) WHERE (follow_up_of IS NOT NULL);
CREATE UNIQUE INDEX uq_po_number ON public.purchase_orders USING btree (po_number);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions USING btree (user_id);
CREATE INDEX idx_qbo_queue_entity ON public.quickbooks_sync_queue USING btree (entity_type, entity_id);
CREATE UNIQUE INDEX recipes_one_per_season ON public.recipes USING btree (kind) WHERE (kind = ANY (ARRAY['summer'::text, 'winter'::text]));
CREATE INDEX idx_reporting_queries_outcome_date ON public.reporting_queries USING btree (outcome, created_at DESC);
CREATE INDEX idx_saved_reports_schedule ON public.saved_reports USING btree (schedule) WHERE ((schedule)::text <> 'none'::text);
CREATE INDEX idx_saved_reports_user ON public.saved_reports USING btree (user_id);
CREATE INDEX idx_section18a_certificates_donation ON public.section18a_certificates USING btree (donation_id);
CREATE INDEX idx_scl_count ON public.stock_count_lines USING btree (stock_count_id);
CREATE INDEX idx_scl_product ON public.stock_count_lines USING btree (product_id);
CREATE INDEX idx_scl_variance ON public.stock_count_lines USING btree (stock_count_id) WHERE (variance <> (0)::numeric);
CREATE INDEX idx_sc_date ON public.stock_counts USING btree (count_date);
CREATE INDEX idx_sc_status ON public.stock_counts USING btree (status);
CREATE INDEX idx_sm_created_at ON public.stock_movements USING btree (created_at);
CREATE INDEX idx_sm_location ON public.stock_movements USING btree (location_id);
CREATE INDEX idx_sm_product ON public.stock_movements USING btree (product_id);
CREATE INDEX idx_sm_programme ON public.stock_movements USING btree (programme_id);
CREATE INDEX idx_sm_ref ON public.stock_movements USING btree (reference_type, reference_id);
CREATE INDEX idx_stock_movements_created_sast ON public.stock_movements USING btree ((((created_at AT TIME ZONE 'Africa/Johannesburg'::text))::date));
CREATE INDEX idx_stock_movements_type ON public.stock_movements USING btree (movement_type);
CREATE INDEX supplier_products_product_idx ON public.supplier_products USING btree (product_id);
CREATE UNIQUE INDEX supplier_prospects_converted_uk ON public.supplier_prospects USING btree (converted_supplier_id) WHERE (converted_supplier_id IS NOT NULL);
CREATE INDEX supplier_prospects_status_idx ON public.supplier_prospects USING btree (status, created_at DESC);
CREATE INDEX idx_suppliers_live ON public.suppliers USING btree (name) WHERE (archived_at IS NULL);
CREATE INDEX suppliers_active_name_idx ON public.suppliers USING btree (is_active, name);
CREATE INDEX idx_user_invites_pending ON public.user_invites USING btree (created_at DESC) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));
CREATE INDEX idx_user_invites_token_hash ON public.user_invites USING btree (token_hash);
CREATE UNIQUE INDEX idx_users_email_unique ON public.users USING btree (lower(email)) WHERE (email IS NOT NULL);
CREATE INDEX idx_users_live ON public.users USING btree (username) WHERE (archived_at IS NULL);
CREATE INDEX idx_users_role ON public.users USING btree (role);
CREATE INDEX idx_vms_sync_external_id ON public.vms_sync USING btree (external_id);
CREATE INDEX idx_vms_sync_sync_status ON public.vms_sync USING btree (sync_status);
CREATE INDEX idx_volunteer_bookings_booking_status ON public.volunteer_bookings USING btree (booking_status);
CREATE INDEX idx_volunteer_bookings_external_volunteer_id ON public.volunteer_bookings USING btree (external_volunteer_id);
CREATE INDEX idx_volunteer_bookings_timeslot_id ON public.volunteer_bookings USING btree (timeslot_id);
CREATE INDEX idx_volunteers_signed_in_at ON public.volunteers USING btree (signed_in_at DESC);
CREATE INDEX idx_volunteers_signed_in_sast ON public.volunteers USING btree ((((signed_in_at AT TIME ZONE 'Africa/Johannesburg'::text))::date)) WHERE (signed_out_at IS NOT NULL);
CREATE INDEX warehouse_area_counts_latest ON public.warehouse_area_counts USING btree (area_id, product_id, counted_at DESC, id DESC);
CREATE UNIQUE INDEX warehouse_areas_active_name ON public.warehouse_areas USING btree (lower(btrim(name))) WHERE is_active;
CREATE INDEX idx_warehouse_manager_flags_pending_donation ON public.warehouse_manager_flags USING btree (pending_donation_id, status);
CREATE INDEX idx_warehouse_manager_flags_pending_item ON public.warehouse_manager_flags USING btree (pending_donation_item_id);
CREATE INDEX idx_warehouse_manager_flags_status ON public.warehouse_manager_flags USING btree (status);

-- -- Sequence owners ----------------------------------------
ALTER SEQUENCE public."assistant_queries_id_seq" OWNED BY public."assistant_queries"."id";
ALTER SEQUENCE public."barcode_scan_events_id_seq" OWNED BY public."barcode_scan_events"."id";
ALTER SEQUENCE public."collection_kit_records_id_seq" OWNED BY public."collection_kit_records"."id";
ALTER SEQUENCE public."collection_kits_id_seq" OWNED BY public."collection_kits"."id";
ALTER SEQUENCE public."community_request_items_id_seq" OWNED BY public."community_request_items"."id";
ALTER SEQUENCE public."community_requests_id_seq" OWNED BY public."community_requests"."id";
ALTER SEQUENCE public."decanting_lines_id_seq" OWNED BY public."decanting_lines"."id";
ALTER SEQUENCE public."decanting_records_id_seq" OWNED BY public."decanting_records"."id";
ALTER SEQUENCE public."delivery_note_items_id_seq" OWNED BY public."delivery_note_items"."id";
ALTER SEQUENCE public."delivery_notes_id_seq" OWNED BY public."delivery_notes"."id";
ALTER SEQUENCE public."delivery_receipts_id_seq" OWNED BY public."delivery_receipts"."id";
ALTER SEQUENCE public."dispatch_event_lines_id_seq" OWNED BY public."dispatch_event_lines"."id";
ALTER SEQUENCE public."dispatch_events_id_seq" OWNED BY public."dispatch_events"."id";
ALTER SEQUENCE public."donation_email_logs_id_seq" OWNED BY public."donation_email_logs"."id";
ALTER SEQUENCE public."donation_items_id_seq" OWNED BY public."donation_items"."id";
ALTER SEQUENCE public."donations_id_seq" OWNED BY public."donations"."id";
ALTER SEQUENCE public."donors_id_seq" OWNED BY public."donors"."id";
ALTER SEQUENCE public."ecd_centres_id_seq" OWNED BY public."ecd_centres"."id";
ALTER SEQUENCE public."ecd_collection_reminders_id_seq" OWNED BY public."ecd_collection_reminders"."id";
ALTER SEQUENCE public."ecd_order_lines_id_seq" OWNED BY public."ecd_order_lines"."id";
ALTER SEQUENCE public."expiry_warning_dismissals_id_seq" OWNED BY public."expiry_warning_dismissals"."id";
ALTER SEQUENCE public."finance_report_access_links_id_seq" OWNED BY public."finance_report_access_links"."id";
ALTER SEQUENCE public."finance_report_email_logs_id_seq" OWNED BY public."finance_report_email_logs"."id";
ALTER SEQUENCE public."notifications_id_seq" OWNED BY public."notifications"."id";
ALTER SEQUENCE public."operating_closures_id_seq" OWNED BY public."operating_closures"."id";
ALTER SEQUENCE public."outbound_messages_id_seq" OWNED BY public."outbound_messages"."id";
ALTER SEQUENCE public."password_resets_id_seq" OWNED BY public."password_resets"."id";
ALTER SEQUENCE public."pending_donation_items_id_seq" OWNED BY public."pending_donation_items"."id";
ALTER SEQUENCE public."pending_donations_id_seq" OWNED BY public."pending_donations"."id";
ALTER SEQUENCE public."photos_id_seq" OWNED BY public."photos"."id";
ALTER SEQUENCE public."picking_events_id_seq" OWNED BY public."picking_events"."id";
ALTER SEQUENCE public."picking_slip_items_id_seq" OWNED BY public."picking_slip_items"."id";
ALTER SEQUENCE public."picking_slips_id_seq" OWNED BY public."picking_slips"."id";
ALTER SEQUENCE public."product_barcodes_id_seq" OWNED BY public."product_barcodes"."id";
ALTER SEQUENCE public."products_id_seq" OWNED BY public."products"."id";
ALTER SEQUENCE public."programmes_id_seq" OWNED BY public."programmes"."id";
ALTER SEQUENCE public."purchase_order_items_id_seq" OWNED BY public."purchase_order_items"."id";
ALTER SEQUENCE public."purchase_orders_id_seq" OWNED BY public."purchase_orders"."id";
ALTER SEQUENCE public."push_subscriptions_id_seq" OWNED BY public."push_subscriptions"."id";
ALTER SEQUENCE public."quickbooks_sync_queue_id_seq" OWNED BY public."quickbooks_sync_queue"."id";
ALTER SEQUENCE public."recipe_lines_id_seq" OWNED BY public."recipe_lines"."id";
ALTER SEQUENCE public."recipes_id_seq" OWNED BY public."recipes"."id";
ALTER SEQUENCE public."reporting_factors_id_seq" OWNED BY public."reporting_factors"."id";
ALTER SEQUENCE public."reporting_queries_id_seq" OWNED BY public."reporting_queries"."id";
ALTER SEQUENCE public."saved_reports_id_seq" OWNED BY public."saved_reports"."id";
ALTER SEQUENCE public."section18a_certificates_id_seq" OWNED BY public."section18a_certificates"."id";
ALTER SEQUENCE public."stock_count_lines_id_seq" OWNED BY public."stock_count_lines"."id";
ALTER SEQUENCE public."stock_counts_id_seq" OWNED BY public."stock_counts"."id";
ALTER SEQUENCE public."stock_movements_id_seq" OWNED BY public."stock_movements"."id";
ALTER SEQUENCE public."storage_locations_id_seq" OWNED BY public."storage_locations"."id";
ALTER SEQUENCE public."supplier_prospects_id_seq" OWNED BY public."supplier_prospects"."id";
ALTER SEQUENCE public."suppliers_id_seq" OWNED BY public."suppliers"."id";
ALTER SEQUENCE public."user_invites_id_seq" OWNED BY public."user_invites"."id";
ALTER SEQUENCE public."users_id_seq" OWNED BY public."users"."id";
ALTER SEQUENCE public."volunteers_id_seq" OWNED BY public."volunteers"."id";
ALTER SEQUENCE public."warehouse_area_counts_id_seq" OWNED BY public."warehouse_area_counts"."id";
ALTER SEQUENCE public."warehouse_areas_id_seq" OWNED BY public."warehouse_areas"."id";
ALTER SEQUENCE public."warehouse_manager_flags_id_seq" OWNED BY public."warehouse_manager_flags"."id";

-- -- Row-level security -------------------------------------
ALTER TABLE public."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."assistant_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."barcode_scan_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."certificate_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collection_kit_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collection_kits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_request_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."decanting_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."decanting_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delivery_note_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delivery_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delivery_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dispatch_event_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dispatch_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donation_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donation_category_routing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donation_email_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donation_routing_defaults" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ecd_centres" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ecd_collection_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ecd_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."event_spaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."event_timeslots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."expiry_warning_dismissals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."finance_report_access_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."finance_report_email_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."finance_report_email_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gmail_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."love_activism_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notification_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."operating_closures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."outbound_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."password_resets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pending_donation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pending_donations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."picking_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."picking_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."picking_slip_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."picking_slips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_barcodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."programmes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."purchase_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quickbooks_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quickbooks_object_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quickbooks_sync_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recipe_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recipe_own_order_centres" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reporting_factors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reporting_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reporting_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."saved_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."schema_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."section18a_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."section18a_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_count_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."storage_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_prospects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vms_sync" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."volunteer_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."volunteers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."warehouse_area_counts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."warehouse_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."warehouse_manager_flags" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('service_role')) = 1 THEN EXECUTE 'CREATE POLICY "dispatch_event_lines_service" ON public."dispatch_event_lines" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('service_role')) = 1 THEN EXECUTE 'CREATE POLICY "dispatch_events_service" ON public."dispatch_events" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)'; END IF; END $$;

-- -- Closing the Data API -----------------------------------
-- From migration 057_lock_down_data_api.sql: the API roles lose every
-- right in public. Skipped where those roles do not exist.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p')
       AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END
$$;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', current_user, api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', current_user, api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', current_user, api_role);
    END IF;
  END LOOP;
END
$$;

-- -- Starter configuration ----------------------------------
INSERT INTO public."reporting_factors" ("id", "factor_key", "value", "unit", "source_note", "effective_from", "created_at")
SELECT "id", "factor_key", "value", "unit", "source_note", "effective_from", "created_at" FROM jsonb_populate_recordset(NULL::public."reporting_factors", $json$[{"id":1,"factor_key":"kg_to_meals","value":"2.5","unit":"meals per kg","source_note":"PLACEHOLDER — confirm with Ladles of Love before publishing any figure.","effective_from":"2025-12-31T22:00:00.000Z","created_at":"2026-08-22T19:21:05.188Z"},{"id":2,"factor_key":"kg_to_adults_served","value":"1.5","unit":"adults per kg","source_note":"Placeholder — replace with a real figure from the organisation.","effective_from":"2026-09-14T22:00:00.000Z","created_at":"2026-09-15T22:04:44.327Z"},{"id":3,"factor_key":"kg_to_dignity_kitchen_served","value":"2.5","unit":"people per kg","source_note":"Placeholder seed value — replace via Adjust factors once the org has a real figure.","effective_from":"2026-09-21T22:00:00.000Z","created_at":"2026-09-22T21:44:30.859Z"},{"id":4,"factor_key":"kg_to_community_served","value":"2.5","unit":"people per kg","source_note":"Placeholder seed value — replace via Adjust factors once the org has a real figure.","effective_from":"2026-09-21T22:00:00.000Z","created_at":"2026-09-22T21:44:30.859Z"}]$json$);
INSERT INTO public."programmes" ("id", "code", "name", "description", "is_active", "created_at")
SELECT "id", "code", "name", "description", "is_active", "created_at" FROM jsonb_populate_recordset(NULL::public."programmes", $json$[{"id":1,"code":"NOC","name":"Nourish Our Children","description":"Fortnightly food parcels to registered ECD centres.","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":2,"code":"FTS","name":"Feed the Soil","description":"Fresh produce programme supplying ECDs and community kitchens.","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":3,"code":"LOVE_ACTIVISM","name":"Love Activism","description":"Dignity kitchens, soup kitchens and community relief drives.","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"}]$json$);
INSERT INTO public."storage_locations" ("id", "name", "area", "is_active", "created_at")
SELECT "id", "name", "area", "is_active", "created_at" FROM jsonb_populate_recordset(NULL::public."storage_locations", $json$[{"id":1,"name":"Dry Store","area":"dry_store","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":2,"name":"Cold Room","area":"cold_room","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":3,"name":"Decanting Bay","area":"dry_store","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"},{"id":4,"name":"Dispatch Staging","area":"dry_store","is_active":true,"created_at":"2026-08-19T13:28:02.358Z"}]$json$);
INSERT INTO public."donation_category_routing" ("category", "routing_outcome", "storage_area", "description", "is_active", "updated_by", "updated_at")
SELECT "category", "routing_outcome", "storage_area", "description", "is_active", "updated_by", "updated_at" FROM jsonb_populate_recordset(NULL::public."donation_category_routing", $json$[{"category":"recipe_food","routing_outcome":"ecd_fefo_stock","storage_area":null,"description":"Routed to core ECD stock allocation under recipe inventory.","is_active":true,"updated_by":null,"updated_at":"2026-08-24T19:39:33.639Z"},{"category":"add_on_food","routing_outcome":"proportional_ecd_distribution","storage_area":null,"description":"Routed to proportional ECD distribution alongside core recipe allocations.","is_active":true,"updated_by":null,"updated_at":"2026-08-24T19:39:33.639Z"},{"category":"non_recipe_food","routing_outcome":"soup_kitchen_stock","storage_area":"Soup Kitchen Prep","description":"Bulk or non-standard edible stock routed directly to soup kitchen inventory.","is_active":true,"updated_by":null,"updated_at":"2026-08-24T19:39:33.639Z"},{"category":"non_food","routing_outcome":"external_distribution_flag_wm","storage_area":"Mezzanine or Boardroom storage","description":"Non-food item routed to external distribution channel and flagged for Warehouse Manager review.","is_active":true,"updated_by":null,"updated_at":"2026-10-05T08:41:52.921Z"}]$json$);
INSERT INTO public."picking_settings" ("key", "value", "updated_at")
SELECT "key", "value", "updated_at" FROM jsonb_populate_recordset(NULL::public."picking_settings", $json$[{"key":"cohort_anchor_monday","value":"2026-08-17","updated_at":"2026-08-19T13:28:02.358Z"},{"key":"default_bag_sizes_kg","value":"[2,1,0.5,0.25]","updated_at":"2026-08-19T13:28:02.358Z"}]$json$);
INSERT INTO public."donation_settings" ("id", "section18a_threshold_value", "updated_at")
SELECT "id", "section18a_threshold_value", "updated_at" FROM jsonb_populate_recordset(NULL::public."donation_settings", $json$[{"id":1,"section18a_threshold_value":"1000.00","updated_at":"2026-08-19T13:28:02.358Z"}]$json$);
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

-- -- Migrations this file already contains ------------------
-- So `npm run migrate -- up` only applies migrations added after it.
INSERT INTO public.schema_migrations (id, notes) VALUES
  ('001_reporting_factors', 'In new-database.sql'),
  ('002_purchase_order_creation', 'In new-database.sql'),
  ('002_reporting_queries', 'In new-database.sql'),
  ('003_reporting_indexes', 'In new-database.sql'),
  ('015_create_volunteer_management_tables', 'In new-database.sql'),
  ('016_expand_vms_sync_entity_type', 'In new-database.sql'),
  ('019_create_section18a_certificate_engine', 'In new-database.sql'),
  ('020_add_gmail_display_name', 'In new-database.sql'),
  ('021_create_certificate_settings_table', 'In new-database.sql'),
  ('022_extend_donation_email_logs', 'In new-database.sql'),
  ('022_section18a_donor_form_flow', 'In new-database.sql'),
  ('023_add_notification_target_roles', 'In new-database.sql'),
  ('023_create_user_invites', 'In new-database.sql'),
  ('024_add_user_invite_email_status', 'In new-database.sql'),
  ('024_create_finance_report_access_links', 'In new-database.sql'),
  ('025_add_mobile_number_to_ecd_centres', 'In new-database.sql'),
  ('026_create_ecd_collection_reminders', 'In new-database.sql'),
  ('027_add_contact_email_to_ecd_centres', 'In new-database.sql'),
  ('028_add_finance_email_status_to_purchase_orders', 'In new-database.sql'),
  ('029_create_saved_reports', 'In new-database.sql'),
  ('030_create_push_subscriptions', 'In new-database.sql'),
  ('031_create_password_resets', 'In new-database.sql'),
  ('032_create_outbound_messages', 'In new-database.sql'),
  ('033_create_app_settings', 'In new-database.sql'),
  ('034_create_operating_closures', 'In new-database.sql'),
  ('035_add_approved_to_request_outcome', 'In new-database.sql'),
  ('036_create_community_request_items', 'In new-database.sql'),
  ('037_add_activity_log_date_indexes', 'In new-database.sql'),
  ('038_create_recipes', 'In new-database.sql'),
  ('039_create_supplier_products', 'In new-database.sql'),
  ('040_create_idempotency_keys', 'In new-database.sql'),
  ('041_create_photos', 'In new-database.sql'),
  ('042_add_user_language', 'In new-database.sql'),
  ('043_add_purchase_order_follow_up', 'In new-database.sql'),
  ('044_add_product_decantable', 'In new-database.sql'),
  ('045_purchase_order_part_quantities', 'In new-database.sql'),
  ('046_community_request_logged_by', 'In new-database.sql'),
  ('047_create_expiry_warning_dismissals', 'In new-database.sql'),
  ('048_create_warehouse_map', 'In new-database.sql'),
  ('049_warehouse_area_capacity', 'In new-database.sql'),
  ('050_add_ecd_centre_location', 'In new-database.sql'),
  ('051_warehouse_gates', 'In new-database.sql'),
  ('052_create_product_barcodes', 'In new-database.sql'),
  ('053_create_barcode_scan_events', 'In new-database.sql'),
  ('054_finance_link_expiry', 'In new-database.sql'),
  ('055_user_session_version', 'In new-database.sql'),
  ('056_product_barcode_food_facts', 'In new-database.sql'),
  ('057_lock_down_data_api', 'In new-database.sql'),
  ('058_runtime_schema_to_migration', 'In new-database.sql'),
  ('059_tidy_indexes', 'In new-database.sql'),
  ('060_drop_unused_schema', 'In new-database.sql'),
  ('2026_08_02_schema_gap_migration', 'In new-database.sql'),
  ('2026_08_13_donations', 'In new-database.sql');

-- -- First admin (optional) ---------------------------------
-- Someone has to be able to sign in. Fill in the four values and run the
-- file as it is; with the password left as 'CHANGE-ME', no admin is made
-- and you can make one later with
--   npm run warehouse-admin -- create-admin <code> --username <u> --first <name> --last <name>
-- The password is stored hashed (bcrypt), never as typed. Change it
-- after the first sign-in: Profile, Change password.
DO $$
DECLARE
  admin_username   text := 'admin';
  admin_first_name text := 'First';
  admin_last_name  text := 'Admin';
  admin_password   text := 'CHANGE-ME';   -- 8 to 72 characters
BEGIN
  IF admin_password = 'CHANGE-ME' THEN
    RAISE NOTICE 'No first admin made: the password was left as CHANGE-ME.';
    RETURN;
  END IF;
  IF length(admin_password) < 8 OR octet_length(admin_password) > 72 THEN
    RAISE EXCEPTION 'The first admin password must be 8 to 72 characters. Nothing was changed.';
  END IF;
  INSERT INTO public.users (username, first_name, last_name, password_hash, role)
  VALUES (admin_username, admin_first_name, admin_last_name,
          extensions.crypt(admin_password, extensions.gen_salt('bf', 10)), 'admin');
END
$$;

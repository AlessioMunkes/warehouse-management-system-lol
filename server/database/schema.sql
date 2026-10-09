-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  username character varying NOT NULL UNIQUE,
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  password_hash character varying NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['warehouse_worker'::character varying, 'manager'::character varying, 'admin'::character varying]::text[])),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  archived_at timestamp with time zone,
  archived_by integer,
  email text,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id)
);
CREATE TABLE public.suppliers (
  id integer NOT NULL DEFAULT nextval('suppliers_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  contact_email character varying,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  contact_phone character varying,
  address text,
  agreement_ref character varying,
  contact_name character varying,
  payment_terms character varying,
  expected_lead_time_days integer CHECK (expected_lead_time_days IS NULL OR expected_lead_time_days >= 0 AND expected_lead_time_days <= 365),
  category character varying,
  notes text,
  created_by integer,
  deactivated_at timestamp with time zone,
  deactivated_by integer,
  archived_at timestamp with time zone,
  archived_by integer,
  CONSTRAINT suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT suppliers_deactivated_by_fkey FOREIGN KEY (deactivated_by) REFERENCES public.users(id),
  CONSTRAINT suppliers_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id)
);
CREATE TABLE public.products (
  id integer NOT NULL DEFAULT nextval('products_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  stock_keeping_unit character varying NOT NULL UNIQUE,
  weight_kg numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_decantable boolean NOT NULL DEFAULT false,
  programme_id integer,
  default_location_id integer,
  code_type USER-DEFINED NOT NULL DEFAULT 'fixed'::product_code_type,
  category character varying,
  is_perishable boolean NOT NULL DEFAULT false,
  default_unit character varying NOT NULL DEFAULT 'kg'::character varying,
  storage_type character varying DEFAULT 'dry'::character varying CHECK (storage_type::text = ANY (ARRAY['dry'::character varying, 'cold'::character varying]::text[])),
  archived_at timestamp with time zone,
  archived_by integer,
  unit_cost numeric CHECK (unit_cost IS NULL OR unit_cost >= 0::numeric),
  quantity_per_meal numeric,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_programme_id_fkey FOREIGN KEY (programme_id) REFERENCES public.programmes(id),
  CONSTRAINT products_default_location_id_fkey FOREIGN KEY (default_location_id) REFERENCES public.storage_locations(id),
  CONSTRAINT products_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id)
);
CREATE TABLE public.purchase_orders (
  id integer NOT NULL DEFAULT nextval('purchase_orders_id_seq'::regclass),
  supplier_id integer NOT NULL,
  created_by integer,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'in_transit'::character varying, 'partially_received'::character varying, 'completed'::character varying, 'returned'::character varying, 'follow_up_required'::character varying]::text[])),
  expected_delivery_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status_reason text,
  status_changed_at timestamp with time zone,
  status_changed_by integer,
  po_number character varying NOT NULL DEFAULT ((('PO-'::text || to_char((now() AT TIME ZONE 'Africa/Johannesburg'::text), 'YYYY'::text)) || '-'::text) || lpad((nextval('purchase_order_number_seq'::regclass))::text, 4, '0'::text)),
  notes text,
  finance_email_status text CHECK (finance_email_status = ANY (ARRAY['sent'::text, 'failed'::text])),
  finance_email_error text,
  finance_email_attempted_at timestamp with time zone,
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT purchase_orders_status_changed_by_fkey FOREIGN KEY (status_changed_by) REFERENCES public.users(id)
);
CREATE TABLE public.purchase_order_items (
  id integer NOT NULL DEFAULT nextval('purchase_order_items_id_seq'::regclass),
  purchase_order_id integer NOT NULL,
  product_id integer NOT NULL,
  expected_quantity integer NOT NULL CHECK (expected_quantity > 0),
  expected_weight_kg numeric CHECK (expected_weight_kg IS NULL OR expected_weight_kg >= 0::numeric),
  unit_price numeric CHECK (unit_price IS NULL OR unit_price >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id),
  CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.delivery_notes (
  id integer NOT NULL DEFAULT nextval('delivery_notes_id_seq'::regclass),
  supplier_id integer NOT NULL,
  received_by integer,
  purchase_order_id integer NOT NULL,
  delivery_date date NOT NULL,
  status character varying NOT NULL DEFAULT 'recorded'::character varying CHECK (status::text = ANY (ARRAY['recorded'::character varying, 'flagged'::character varying, 'closed'::character varying]::text[])),
  signature text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  driver_name character varying,
  idempotency_key text,
  CONSTRAINT delivery_notes_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_notes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT delivery_notes_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id),
  CONSTRAINT delivery_notes_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id)
);
CREATE TABLE public.volunteers (
  id bigint NOT NULL DEFAULT nextval('volunteers_id_seq'::regclass),
  full_name text NOT NULL,
  signed_in_at timestamp with time zone NOT NULL DEFAULT now(),
  signed_out_at timestamp with time zone,
  source text NOT NULL DEFAULT 'guest_login'::text,
  consent_given boolean NOT NULL DEFAULT false,
  retention_delete_after date,
  CONSTRAINT volunteers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.decanting_records (
  id integer NOT NULL DEFAULT nextval('decanting_records_id_seq'::regclass),
  week_of date NOT NULL,
  notes text,
  recorded_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT decanting_records_pkey PRIMARY KEY (id),
  CONSTRAINT decanting_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id)
);
CREATE TABLE public.decanting_lines (
  id integer NOT NULL DEFAULT nextval('decanting_lines_id_seq'::regclass),
  decanting_id integer NOT NULL,
  product_id integer,
  required_kg numeric NOT NULL,
  actual_bulk_kg numeric,
  packed_kg numeric NOT NULL,
  total_bags integer NOT NULL,
  sizes_kg jsonb NOT NULL,
  bags jsonb NOT NULL,
  margin_error numeric NOT NULL,
  within_margin boolean NOT NULL,
  wastage_kg numeric NOT NULL DEFAULT 0,
  surplus_kg numeric NOT NULL DEFAULT 0,
  shortfall_kg numeric NOT NULL DEFAULT 0,
  notes text,
  partial_bag_actual_kg numeric CHECK (partial_bag_actual_kg IS NULL OR partial_bag_actual_kg > 0::numeric AND partial_bag_actual_kg < 0.5),
  CONSTRAINT decanting_lines_pkey PRIMARY KEY (id),
  CONSTRAINT decanting_lines_decanting_id_fkey FOREIGN KEY (decanting_id) REFERENCES public.decanting_records(id),
  CONSTRAINT decanting_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.stock_levels (
  product_id integer NOT NULL,
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  unit character varying NOT NULL CHECK (unit::text = ANY (ARRAY['kg'::character varying, 'g'::character varying, 'l'::character varying, 'ml'::character varying, 'each'::character varying, 'bag'::character varying, 'box'::character varying, 'crate'::character varying, 'punnet'::character varying]::text[])) NOT VALI),
  reorder_threshold numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stock_levels_pkey PRIMARY KEY (product_id),
  CONSTRAINT stock_levels_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.stock_movements (
  id integer NOT NULL DEFAULT nextval('stock_movements_id_seq'::regclass),
  product_id integer NOT NULL,
  quantity numeric NOT NULL,
  unit character varying CHECK (unit IS NULL OR (unit::text = ANY (ARRAY['kg'::character varying, 'g'::character varying, 'l'::character varying, 'ml'::character varying, 'each'::character varying, 'bag'::character varying, 'box'::character varying, 'crate'::character varying, 'punnet'::character varying]::text[]))) NOT VALI),
  movement_type character varying NOT NULL CHECK (movement_type::text = ANY (ARRAY['adjustment'::character varying, 'decanted'::character varying, 'dispatched'::character varying, 'donated'::character varying, 'picked'::character varying, 'received'::character varying, 'wastage'::character varying]::text[])),
  reference_type character varying,
  reference_id integer,
  reason text,
  performed_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  programme_id integer,
  location_id integer,
  approved_by integer,
  CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT stock_movements_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id),
  CONSTRAINT stock_movements_programme_id_fkey FOREIGN KEY (programme_id) REFERENCES public.programmes(id),
  CONSTRAINT stock_movements_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id),
  CONSTRAINT stock_movements_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id)
);
CREATE TABLE public.ecd_centres (
  id integer NOT NULL DEFAULT nextval('ecd_centres_id_seq'::regclass),
  name character varying NOT NULL,
  contact_name character varying,
  child_count integer CHECK (child_count >= 0),
  cohort USER-DEFINED NOT NULL,
  last_collected_date date,
  is_active boolean NOT NULL DEFAULT true,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  contact_phone character varying,
  collection_day USER-DEFINED,
  location character varying,
  mobile_number character varying,
  contact_email text,
  CONSTRAINT ecd_centres_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ecd_order_lines (
  id integer NOT NULL DEFAULT nextval('ecd_order_lines_id_seq'::regclass),
  ecd_id integer NOT NULL,
  product_id integer NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0::numeric),
  unit character varying NOT NULL CHECK (unit::text = ANY (ARRAY['kg'::character varying, 'g'::character varying, 'l'::character varying, 'ml'::character varying, 'each'::character varying, 'bag'::character varying, 'box'::character varying, 'crate'::character varying, 'punnet'::character varying]::text[])) NOT VALI),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ecd_order_lines_pkey PRIMARY KEY (id),
  CONSTRAINT ecd_order_lines_ecd_id_fkey FOREIGN KEY (ecd_id) REFERENCES public.ecd_centres(id),
  CONSTRAINT ecd_order_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.picking_settings (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT picking_settings_pkey PRIMARY KEY (key)
);
CREATE TABLE public.picking_slips (
  id integer NOT NULL DEFAULT nextval('picking_slips_id_seq'::regclass),
  ecd_id integer,
  dispatch_date date NOT NULL,
  cohort USER-DEFINED NOT NULL,
  pallet_ref character varying,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'in_progress'::character varying, 'complete'::character varying, 'dispatched'::character varying, 'cancelled'::character varying]::text[])),
  assigned_to integer,
  generated_by integer,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  completed_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  collection_status USER-DEFINED,
  assigned_volunteer_id bigint,
  beneficiary_kind USER-DEFINED NOT NULL DEFAULT 'ecd'::beneficiary_type,
  beneficiary_name character varying,
  dispatched_at timestamp with time zone,
  assigned_to_2 integer,
  CONSTRAINT picking_slips_pkey PRIMARY KEY (id),
  CONSTRAINT picking_slips_ecd_id_fkey FOREIGN KEY (ecd_id) REFERENCES public.ecd_centres(id),
  CONSTRAINT picking_slips_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id),
  CONSTRAINT picking_slips_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.users(id),
  CONSTRAINT picking_slips_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id),
  CONSTRAINT picking_slips_assigned_volunteer_id_fkey FOREIGN KEY (assigned_volunteer_id) REFERENCES public.volunteers(id),
  CONSTRAINT picking_slips_assigned_to_2_fkey FOREIGN KEY (assigned_to_2) REFERENCES public.users(id)
);
CREATE TABLE public.picking_slip_items (
  id integer NOT NULL DEFAULT nextval('picking_slip_items_id_seq'::regclass),
  picking_slip_id integer NOT NULL,
  product_id integer NOT NULL,
  required_quantity numeric NOT NULL,
  unit character varying NOT NULL,
  packed_quantity numeric,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::picking_item_status,
  flag_reason text,
  confirmed_by integer,
  confirmed_at timestamp with time zone,
  dispatched_quantity numeric,
  dispatched_at timestamp with time zone,
  packer_note text,
  CONSTRAINT picking_slip_items_pkey PRIMARY KEY (id),
  CONSTRAINT picking_slip_items_picking_slip_id_fkey FOREIGN KEY (picking_slip_id) REFERENCES public.picking_slips(id),
  CONSTRAINT picking_slip_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT picking_slip_items_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id)
);
CREATE TABLE public.picking_events (
  id integer NOT NULL DEFAULT nextval('picking_events_id_seq'::regclass),
  picking_slip_id integer NOT NULL,
  event_type character varying NOT NULL,
  actor_id integer,
  detail jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT picking_events_pkey PRIMARY KEY (id),
  CONSTRAINT picking_events_picking_slip_id_fkey FOREIGN KEY (picking_slip_id) REFERENCES public.picking_slips(id),
  CONSTRAINT picking_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id)
);
CREATE TABLE public.schema_migrations (
  id character varying NOT NULL,
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  CONSTRAINT schema_migrations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.programmes (
  id integer NOT NULL DEFAULT nextval('programmes_id_seq'::regclass),
  code character varying NOT NULL UNIQUE,
  name character varying NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programmes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.delivery_note_items (
  id integer NOT NULL DEFAULT nextval('delivery_note_items_id_seq'::regclass),
  delivery_note_id integer NOT NULL,
  product_id integer NOT NULL,
  purchase_order_item_id integer,
  expected_quantity numeric NOT NULL DEFAULT 0,
  expected_weight_kg numeric,
  received_quantity numeric NOT NULL CHECK (received_quantity >= 0::numeric),
  received_weight_kg numeric,
  unit character varying NOT NULL DEFAULT 'kg'::character varying,
  discrepancy_quantity numeric DEFAULT (received_quantity - expected_quantity),
  discrepancy_weight_kg numeric DEFAULT (received_weight_kg - expected_weight_kg),
  discrepancy_reason text,
  discrepancy_resolved boolean NOT NULL DEFAULT false,
  location_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  storage_area character varying CHECK (storage_area IS NULL OR (storage_area::text = ANY (ARRAY['cold_room'::character varying, 'dry_store'::character varying, 'fts_section'::character varying, 'mezzanine'::character varying, 'boardroom'::character varying]::text[]))),
  expiry_date date,
  CONSTRAINT delivery_note_items_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_note_items_delivery_note_id_fkey FOREIGN KEY (delivery_note_id) REFERENCES public.delivery_notes(id),
  CONSTRAINT delivery_note_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT delivery_note_items_purchase_order_item_id_fkey FOREIGN KEY (purchase_order_item_id) REFERENCES public.purchase_order_items(id),
  CONSTRAINT dni_location_fk FOREIGN KEY (location_id) REFERENCES public.storage_locations(id)
);
CREATE TABLE public.storage_locations (
  id integer NOT NULL DEFAULT nextval('storage_locations_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  area USER-DEFINED NOT NULL,
  capacity_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT storage_locations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.donations (
  id integer NOT NULL DEFAULT nextval('donations_id_seq'::regclass),
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  programme_id integer,
  estimated_value_zar numeric NOT NULL CHECK (estimated_value_zar >= 0::numeric),
  donor_name character varying,
  donor_contact character varying,
  donor_consent_given boolean NOT NULL DEFAULT false,
  section_18a_qualifying boolean NOT NULL DEFAULT false,
  section_18a_certificate_ref character varying,
  section_18a_issued_at timestamp with time zone,
  received_by integer,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  donor_tax_reference character varying,
  idempotency_key character varying,
  section_18a_status character varying NOT NULL DEFAULT 'not_evaluated'::character varying CHECK (section_18a_status::text = ANY (ARRAY['not_evaluated'::character varying, 'not_qualifying'::character varying, 'qualifying_pending_donor'::character varying, 'queued'::character varying, 'issued'::character varying, 'failed'::character varying]::text[])),
  quickbooks_sync_status character varying NOT NULL DEFAULT 'unsynced'::character varying,
  quickbooks_sync_reference_id character varying,
  quickbooks_sync_error text,
  quickbooks_synced_at timestamp with time zone,
  quickbooks_sync_attempted_at timestamp with time zone,
  donor_id integer,
  donation_category character varying NOT NULL CHECK (donation_category::text = ANY (ARRAY['recipe_food'::character varying, 'add_on_food'::character varying, 'non_recipe_food'::character varying, 'non_food'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'draft'::character varying CHECK (status::text = ANY (ARRAY['draft'::character varying, 'under_review'::character varying, 'ready_for_commit'::character varying, 'committed'::character varying, 'cancelled'::character varying]::text[])),
  created_by integer,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  donor_registration_type character varying CHECK (donor_registration_type::text = ANY (ARRAY['individual'::character varying, 'company'::character varying, 'company_public'::character varying, 'cc'::character varying, 'npc'::character varying, 'trust'::character varying, 'estate'::character varying, 'association'::character varying]::text[])),
  section18a_requested boolean NOT NULL DEFAULT false,
  donor_first_name character varying,
  donor_last_name character varying,
  donor_cellphone character varying,
  donor_address_line1 character varying,
  donor_address_line2 character varying,
  donor_city_suburb character varying,
  donor_province character varying,
  donor_postal_code character varying,
  donor_country character varying,
  donor_identification_type character varying CHECK (donor_identification_type::text = ANY (ARRAY['south_african_id'::character varying, 'foreign_passport'::character varying]::text[])),
  donor_identification_number character varying,
  donor_identification_country_of_issue character varying,
  section_18a_deemed_value_zar numeric CHECK (section_18a_deemed_value_zar IS NULL OR section_18a_deemed_value_zar >= 0::numeric),
  section_18a_form_token_hash text,
  section_18a_form_token_expires_at timestamp with time zone,
  section_18a_form_submitted_at timestamp with time zone,
  section_18a_donor_form jsonb,
  CONSTRAINT donations_pkey PRIMARY KEY (id),
  CONSTRAINT donations_programme_id_fkey FOREIGN KEY (programme_id) REFERENCES public.programmes(id),
  CONSTRAINT donations_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id),
  CONSTRAINT donations_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.donors(id),
  CONSTRAINT donations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.donation_items (
  id integer NOT NULL DEFAULT nextval('donation_items_id_seq'::regclass),
  donation_id integer NOT NULL,
  product_id integer,
  description character varying,
  quantity numeric NOT NULL CHECK (quantity > 0::numeric),
  unit character varying NOT NULL DEFAULT 'kg'::character varying,
  estimated_value_zar numeric,
  storage_location_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  routing_status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (routing_status::text = ANY (ARRAY['pending'::character varying, 'allocated'::character varying, 'unmatched'::character varying, 'not_stock_bearing'::character varying, 'awaiting_programme_stock'::character varying]::text[])),
  resolved_by integer,
  resolved_at timestamp with time zone,
  routed_category character varying,
  routing_outcome character varying,
  routing_source character varying NOT NULL DEFAULT 'unclassified'::character varying CHECK (routing_source::text = ANY (ARRAY['manual_override'::character varying, 'product_default'::character varying, 'manual_category'::character varying, 'unclassified'::character varying]::text[])),
  line_no integer NOT NULL CHECK (line_no > 0),
  source_reference character varying,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT donation_items_pkey PRIMARY KEY (id),
  CONSTRAINT donation_items_donation_id_fkey FOREIGN KEY (donation_id) REFERENCES public.donations(id),
  CONSTRAINT donation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT donation_items_storage_location_id_fkey FOREIGN KEY (storage_location_id) REFERENCES public.storage_locations(id),
  CONSTRAINT donation_items_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id)
);
CREATE TABLE public.delivery_receipts (
  id integer NOT NULL DEFAULT nextval('delivery_receipts_id_seq'::regclass),
  picking_slip_id integer NOT NULL UNIQUE,
  ecd_id integer,
  dispatch_date date NOT NULL,
  cohort USER-DEFINED NOT NULL,
  outcome USER-DEFINED NOT NULL DEFAULT 'not_collected'::collection_outcome,
  collected_by_name character varying,
  collector_contact character varying,
  signature text,
  confirmed_by integer,
  confirmed_at timestamp with time zone,
  is_cohort_override boolean NOT NULL DEFAULT false,
  override_reason text,
  override_approved_by integer,
  auto_flagged_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT delivery_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_receipts_picking_slip_id_fkey FOREIGN KEY (picking_slip_id) REFERENCES public.picking_slips(id),
  CONSTRAINT delivery_receipts_ecd_id_fkey FOREIGN KEY (ecd_id) REFERENCES public.ecd_centres(id),
  CONSTRAINT delivery_receipts_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id),
  CONSTRAINT delivery_receipts_override_approved_by_fkey FOREIGN KEY (override_approved_by) REFERENCES public.users(id)
);
CREATE TABLE public.stock_counts (
  id integer NOT NULL DEFAULT nextval('stock_counts_id_seq'::regclass),
  count_date date NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'in_progress'::stock_count_status,
  started_by integer,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  submitted_at timestamp with time zone,
  approved_by integer,
  approved_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stock_counts_pkey PRIMARY KEY (id),
  CONSTRAINT stock_counts_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.users(id),
  CONSTRAINT stock_counts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id)
);
CREATE TABLE public.stock_count_lines (
  id integer NOT NULL DEFAULT nextval('stock_count_lines_id_seq'::regclass),
  stock_count_id integer NOT NULL,
  product_id integer NOT NULL,
  location_id integer,
  system_quantity numeric NOT NULL,
  counted_quantity numeric NOT NULL CHECK (counted_quantity >= 0::numeric),
  variance numeric DEFAULT (counted_quantity - system_quantity),
  unit character varying NOT NULL DEFAULT 'kg'::character varying,
  reason_code character varying,
  notes text,
  counted_by integer,
  counted_at timestamp with time zone NOT NULL DEFAULT now(),
  client_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  adjustment_movement_id integer,
  CONSTRAINT stock_count_lines_pkey PRIMARY KEY (id),
  CONSTRAINT stock_count_lines_stock_count_id_fkey FOREIGN KEY (stock_count_id) REFERENCES public.stock_counts(id),
  CONSTRAINT stock_count_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT stock_count_lines_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id),
  CONSTRAINT stock_count_lines_counted_by_fkey FOREIGN KEY (counted_by) REFERENCES public.users(id),
  CONSTRAINT stock_count_lines_adjustment_movement_id_fkey FOREIGN KEY (adjustment_movement_id) REFERENCES public.stock_movements(id)
);
CREATE TABLE public.community_requests (
  id integer NOT NULL DEFAULT nextval('community_requests_id_seq'::regclass),
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  caller_name character varying,
  caller_contact character varying,
  items_requested text NOT NULL,
  quantity_note character varying,
  outcome USER-DEFINED NOT NULL DEFAULT 'pending'::request_outcome,
  outcome_note text,
  handled_by integer,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT community_requests_pkey PRIMARY KEY (id),
  CONSTRAINT community_requests_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.users(id)
);
CREATE TABLE public.quickbooks_object_map (
  entity_type character varying NOT NULL,
  entity_id integer NOT NULL,
  qbo_object_type character varying NOT NULL,
  qbo_id character varying NOT NULL,
  sync_token character varying,
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quickbooks_object_map_pkey PRIMARY KEY (entity_type, entity_id)
);
CREATE TABLE public.quickbooks_sync_queue (
  id bigint NOT NULL DEFAULT nextval('quickbooks_sync_queue_id_seq'::regclass),
  entity_type character varying NOT NULL,
  entity_id integer NOT NULL,
  operation character varying NOT NULL,
  payload jsonb,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::sync_status,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  idempotency_key character varying NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quickbooks_sync_queue_pkey PRIMARY KEY (id)
);
CREATE TABLE public.dispatch_events (
  id integer NOT NULL DEFAULT nextval('dispatch_events_id_seq'::regclass),
  picking_slip_id integer NOT NULL UNIQUE,
  status character varying NOT NULL DEFAULT 'awaiting'::character varying CHECK (status::text = ANY (ARRAY['awaiting'::character varying, 'collected'::character varying, 'late_collected'::character varying, 'not_collected'::character varying, 'cancelled'::character varying]::text[])),
  collected_at timestamp with time zone,
  flagged_at timestamp with time zone,
  dispatched_by integer,
  driver_name character varying,
  vehicle_reg character varying,
  signature text,
  override_by integer,
  override_reason text,
  idempotency_key uuid UNIQUE,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_events_pkey PRIMARY KEY (id),
  CONSTRAINT dispatch_events_picking_slip_id_fkey FOREIGN KEY (picking_slip_id) REFERENCES public.picking_slips(id),
  CONSTRAINT dispatch_events_dispatched_by_fkey FOREIGN KEY (dispatched_by) REFERENCES public.users(id),
  CONSTRAINT dispatch_events_override_by_fkey FOREIGN KEY (override_by) REFERENCES public.users(id)
);
CREATE TABLE public.dispatch_event_lines (
  id integer NOT NULL DEFAULT nextval('dispatch_event_lines_id_seq'::regclass),
  dispatch_event_id integer NOT NULL,
  picking_slip_item_id integer,
  product_id integer NOT NULL,
  packed_quantity numeric NOT NULL,
  loaded_quantity numeric NOT NULL CHECK (loaded_quantity >= 0::numeric),
  unit character varying NOT NULL,
  variance_reason text,
  CONSTRAINT dispatch_event_lines_pkey PRIMARY KEY (id),
  CONSTRAINT dispatch_event_lines_dispatch_event_id_fkey FOREIGN KEY (dispatch_event_id) REFERENCES public.dispatch_events(id),
  CONSTRAINT dispatch_event_lines_picking_slip_item_id_fkey FOREIGN KEY (picking_slip_item_id) REFERENCES public.picking_slip_items(id),
  CONSTRAINT dispatch_event_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.donation_allocations (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  donation_item_id integer NOT NULL,
  beneficiary_type character varying NOT NULL DEFAULT 'ecd'::character varying CHECK (beneficiary_type::text = ANY (ARRAY['ecd'::character varying, 'soup_kitchen'::character varying, 'dignity_kitchen'::character varying, 'other'::character varying]::text[])),
  ecd_centre_id integer,
  child_count integer NOT NULL,
  allocated_quantity numeric NOT NULL CHECK (allocated_quantity >= 0::numeric),
  unit character varying NOT NULL,
  allocation_status character varying NOT NULL DEFAULT 'planned'::character varying CHECK (allocation_status::text = ANY (ARRAY['planned'::character varying, 'recorded'::character varying, 'cancelled'::character varying]::text[])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  stock_movement_id integer,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT donation_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT donation_allocations_donation_item_id_fkey FOREIGN KEY (donation_item_id) REFERENCES public.donation_items(id),
  CONSTRAINT donation_allocations_ecd_centre_id_fkey FOREIGN KEY (ecd_centre_id) REFERENCES public.ecd_centres(id),
  CONSTRAINT donation_allocations_stock_movement_id_fkey FOREIGN KEY (stock_movement_id) REFERENCES public.stock_movements(id)
);
CREATE TABLE public.donation_settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  section18a_threshold_value numeric NOT NULL DEFAULT 1000.00,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT donation_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reporting_factors (
  id integer NOT NULL DEFAULT nextval('reporting_factors_id_seq'::regclass),
  factor_key character varying NOT NULL,
  value numeric NOT NULL CHECK (value > 0::numeric),
  unit character varying NOT NULL,
  source_note text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reporting_factors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reporting_queries (
  id bigint NOT NULL DEFAULT nextval('reporting_queries_id_seq'::regclass),
  user_id integer,
  question text NOT NULL,
  outcome character varying NOT NULL CHECK (outcome::text = ANY (ARRAY['ok'::character varying, 'clarify'::character varying, 'unresolved'::character varying, 'error'::character varying]::text[])),
  metric character varying,
  spec jsonb,
  error_message text,
  latency_ms integer,
  provider character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reporting_queries_pkey PRIMARY KEY (id),
  CONSTRAINT reporting_queries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.supplier_prospects (
  id integer NOT NULL DEFAULT nextval('supplier_prospects_id_seq'::regclass),
  name character varying NOT NULL,
  what_they_supply text,
  lead_source character varying,
  contact_name character varying,
  contact_email character varying,
  contact_phone character varying,
  notes text,
  status character varying NOT NULL DEFAULT 'open'::character varying CHECK (status::text = ANY (ARRAY['open'::character varying, 'contacted'::character varying, 'rejected'::character varying, 'converted'::character varying]::text[])),
  converted_supplier_id integer,
  created_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT supplier_prospects_pkey PRIMARY KEY (id),
  CONSTRAINT supplier_prospects_supplier_fkey FOREIGN KEY (converted_supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT supplier_prospects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.donation_category_routing (
  category character varying NOT NULL CHECK (category::text = ANY (ARRAY['recipe_food'::character varying, 'add_on_food'::character varying, 'non_recipe_food'::character varying, 'non_food'::character varying]::text[])),
  routing_outcome character varying NOT NULL,
  storage_area USER-DEFINED,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  updated_by integer,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT donation_category_routing_pkey PRIMARY KEY (category),
  CONSTRAINT donation_category_routing_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.donation_routing_defaults (
  product_id integer NOT NULL,
  donation_category character varying CHECK (donation_category::text = ANY (ARRAY['recipe_food'::character varying, 'add_on_food'::character varying, 'non_recipe_food'::character varying, 'non_food'::character varying]::text[])),
  set_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT donation_routing_defaults_pkey PRIMARY KEY (product_id),
  CONSTRAINT donation_routing_defaults_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT donation_routing_defaults_set_by_fkey FOREIGN KEY (set_by) REFERENCES public.users(id)
);
CREATE TABLE public.warehouse_manager_flags (
  id integer NOT NULL DEFAULT nextval('warehouse_manager_flags_id_seq'::regclass),
  product_id integer NOT NULL,
  quantity_kg numeric NOT NULL,
  reason text NOT NULL,
  target_location character varying,
  created_by integer,
  status character varying DEFAULT 'pending'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pending_donation_id integer,
  pending_donation_item_id integer,
  CONSTRAINT warehouse_manager_flags_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_manager_flags_pending_donation_id_fkey FOREIGN KEY (pending_donation_id) REFERENCES public.pending_donations(id),
  CONSTRAINT warehouse_manager_flags_pending_donation_item_id_fkey FOREIGN KEY (pending_donation_item_id) REFERENCES public.pending_donation_items(id),
  CONSTRAINT warehouse_manager_flags_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.pending_donations (
  id integer NOT NULL DEFAULT nextval('pending_donations_id_seq'::regclass),
  status character varying NOT NULL DEFAULT 'draft'::character varying CHECK (status::text = ANY (ARRAY['draft'::character varying, 'awaiting_resolution'::character varying, 'committing'::character varying, 'committed'::character varying, 'cancelled'::character varying, 'commit_failed'::character varying, 'commit_incomplete'::character varying]::text[])),
  created_by integer,
  donor_name character varying,
  donor_contact character varying,
  donor_tax_reference character varying,
  donor_consent_given boolean,
  estimated_value_zar numeric,
  donation_category character varying,
  programme_id integer,
  notes text,
  section_18a_status character varying,
  section_18a_qualifying boolean,
  draft_snapshot jsonb NOT NULL,
  idempotency_key character varying,
  committed_donation_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  committed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  commit_failed_at timestamp with time zone,
  commit_incomplete_at timestamp with time zone,
  donor_registration_type character varying CHECK (donor_registration_type::text = ANY (ARRAY['individual'::character varying, 'company'::character varying, 'company_public'::character varying, 'cc'::character varying, 'npc'::character varying, 'trust'::character varying, 'estate'::character varying, 'association'::character varying]::text[])),
  donor_first_name character varying,
  donor_last_name character varying,
  donor_cellphone character varying,
  donor_address_line1 character varying,
  donor_address_line2 character varying,
  donor_city_suburb character varying,
  donor_province character varying,
  donor_postal_code character varying,
  donor_country character varying,
  section18a_requested boolean NOT NULL DEFAULT false,
  donor_identification_type character varying CHECK (donor_identification_type::text = ANY (ARRAY['south_african_id'::character varying, 'foreign_passport'::character varying]::text[])),
  donor_identification_country_of_issue character varying,
  donor_identification_number character varying,
  CONSTRAINT pending_donations_pkey PRIMARY KEY (id),
  CONSTRAINT pending_donations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT pending_donations_programme_id_fkey FOREIGN KEY (programme_id) REFERENCES public.programmes(id),
  CONSTRAINT pending_donations_committed_donation_id_fkey FOREIGN KEY (committed_donation_id) REFERENCES public.donations(id)
);
CREATE TABLE public.pending_donation_items (
  id integer NOT NULL DEFAULT nextval('pending_donation_items_id_seq'::regclass),
  pending_donation_id integer NOT NULL,
  line_no integer NOT NULL,
  description text NOT NULL,
  product_id integer,
  quantity numeric NOT NULL,
  unit character varying NOT NULL,
  estimated_value_zar numeric,
  requested_category character varying,
  resolved_category character varying,
  routing_status character varying,
  storage_area_hint character varying,
  source character varying CHECK (source::text = ANY (ARRAY['product_default'::character varying, 'manual_category'::character varying, 'unclassified'::character varying, 'pending_manual_review'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'awaiting_resolution'::character varying CHECK (status::text = ANY (ARRAY['awaiting_resolution'::character varying, 'resolved'::character varying, 'committed'::character varying, 'rejected'::character varying, 'cancelled'::character varying]::text[])),
  flag_id integer,
  rejection_reason text,
  resolved_by integer,
  rejected_at timestamp with time zone,
  committed_donation_item_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pending_donation_items_pkey PRIMARY KEY (id),
  CONSTRAINT pending_donation_items_pending_donation_id_fkey FOREIGN KEY (pending_donation_id) REFERENCES public.pending_donations(id),
  CONSTRAINT pending_donation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT pending_donation_items_flag_id_fkey FOREIGN KEY (flag_id) REFERENCES public.warehouse_manager_flags(id),
  CONSTRAINT pending_donation_items_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id),
  CONSTRAINT pending_donation_items_committed_donation_item_id_fkey FOREIGN KEY (committed_donation_item_id) REFERENCES public.donation_items(id)
);
CREATE TABLE public.gmail_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gmail_email character varying,
  token_type character varying NOT NULL,
  scope text NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  access_token_expires_at timestamp with time zone,
  refresh_token_expires_at timestamp with time zone,
  connected_by_user_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  display_name character varying,
  CONSTRAINT gmail_connections_pkey PRIMARY KEY (id),
  CONSTRAINT gmail_connections_connected_by_user_id_fkey FOREIGN KEY (connected_by_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.quickbooks_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  realm_id character varying NOT NULL UNIQUE,
  token_type character varying NOT NULL,
  scope text NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  access_token_expires_at timestamp with time zone,
  refresh_token_expires_at timestamp with time zone,
  connected_by_user_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quickbooks_connections_pkey PRIMARY KEY (id),
  CONSTRAINT quickbooks_connections_connected_by_user_id_fkey FOREIGN KEY (connected_by_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.donors (
  id integer NOT NULL DEFAULT nextval('donors_id_seq'::regclass),
  name character varying NOT NULL,
  contact character varying,
  tax_reference character varying,
  consent_given boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT donors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.schema_migration_provenance (
  migration_id text NOT NULL,
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  CONSTRAINT schema_migration_provenance_pkey PRIMARY KEY (migration_id)
);
CREATE TABLE public.notifications (
  id integer NOT NULL DEFAULT nextval('notifications_id_seq'::regclass),
  type character varying NOT NULL,
  title character varying NOT NULL,
  body text,
  entity_type character varying,
  entity_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  target_roles ARRAY,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notification_reads (
  notification_id integer NOT NULL,
  user_id integer NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_reads_pkey PRIMARY KEY (notification_id, user_id),
  CONSTRAINT notification_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id),
  CONSTRAINT notification_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.love_activism_events (
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_name character varying NOT NULL,
  description text,
  event_date date NOT NULL,
  status character varying NOT NULL CHECK (status::text = ANY (ARRAY['DRAFT'::character varying, 'SCHEDULED'::character varying, 'PUBLISHED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying]::text[])),
  created_by integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  venue_name character varying,
  address character varying,
  CONSTRAINT love_activism_events_pkey PRIMARY KEY (event_id),
  CONSTRAINT love_activism_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.event_spaces (
  space_id uuid NOT NULL DEFAULT gen_random_uuid(),
  space_name character varying NOT NULL UNIQUE,
  description text,
  location character varying,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_spaces_pkey PRIMARY KEY (space_id)
);
CREATE TABLE public.event_timeslots (
  timeslot_id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  space_id uuid NOT NULL,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  status character varying NOT NULL CHECK (status::text = ANY (ARRAY['OPEN'::character varying, 'CLOSED'::character varying, 'CANCELLED'::character varying]::text[])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_timeslots_pkey PRIMARY KEY (timeslot_id),
  CONSTRAINT event_timeslots_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.love_activism_events(event_id),
  CONSTRAINT event_timeslots_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.event_spaces(space_id)
);
CREATE TABLE public.volunteer_bookings (
  booking_id uuid NOT NULL DEFAULT gen_random_uuid(),
  timeslot_id uuid NOT NULL,
  external_booking_id character varying UNIQUE,
  external_volunteer_id character varying,
  volunteer_first_name character varying NOT NULL,
  volunteer_last_name character varying,
  booking_source character varying NOT NULL CHECK (booking_source::text = ANY (ARRAY['VMS'::character varying, 'WMS_GUEST'::character varying]::text[])),
  booking_status character varying NOT NULL CHECK (booking_status::text = ANY (ARRAY['CONFIRMED'::character varying, 'CANCELLED'::character varying]::text[])),
  booked_at timestamp with time zone NOT NULL DEFAULT now(),
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  volunteer_email character varying,
  volunteer_phone character varying,
  CONSTRAINT volunteer_bookings_pkey PRIMARY KEY (booking_id),
  CONSTRAINT volunteer_bookings_timeslot_id_fkey FOREIGN KEY (timeslot_id) REFERENCES public.event_timeslots(timeslot_id)
);
CREATE TABLE public.attendance (
  attendance_id uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE,
  checked_in boolean NOT NULL DEFAULT false,
  check_in_time timestamp with time zone,
  source character varying,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attendance_pkey PRIMARY KEY (attendance_id),
  CONSTRAINT attendance_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.volunteer_bookings(booking_id)
);
CREATE TABLE public.vms_sync (
  sync_id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type character varying NOT NULL CHECK (entity_type::text = ANY (ARRAY['EVENT'::character varying, 'TIMESLOT'::character varying, 'event_booking'::character varying]::text[])),
  entity_id uuid NOT NULL,
  external_id character varying,
  sync_status character varying NOT NULL CHECK (sync_status::text = ANY (ARRAY['PENDING'::character varying, 'SYNCED'::character varying, 'FAILED'::character varying]::text[])),
  last_attempt_at timestamp with time zone,
  last_success_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vms_sync_pkey PRIMARY KEY (sync_id)
);
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_id integer,
  reason text,
  approved_by integer,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.section18a_settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  organisation_name text NOT NULL DEFAULT ''::text,
  organisation_address text NOT NULL DEFAULT ''::text,
  contact_name text NOT NULL DEFAULT ''::text,
  contact_email text NOT NULL DEFAULT ''::text,
  contact_phone text NOT NULL DEFAULT ''::text,
  pba_declaration text NOT NULL DEFAULT ''::text,
  certificate_prefix text NOT NULL DEFAULT 'S18A'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT section18a_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.section18a_certificates (
  id bigint NOT NULL DEFAULT nextval('section18a_certificates_id_seq'::regclass),
  donation_id integer NOT NULL,
  certificate_number text NOT NULL UNIQUE,
  issue_date date NOT NULL,
  issued_by integer,
  settings_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  donor_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  donation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_content bytea NOT NULL,
  pdf_filename text NOT NULL,
  pdf_content_type text NOT NULL DEFAULT 'application/pdf'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT section18a_certificates_pkey PRIMARY KEY (id),
  CONSTRAINT section18a_certificates_donation_id_fkey FOREIGN KEY (donation_id) REFERENCES public.donations(id),
  CONSTRAINT section18a_certificates_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id)
);
CREATE TABLE public.donation_email_logs (
  id bigint NOT NULL DEFAULT nextval('donation_email_logs_id_seq'::regclass),
  donation_id integer NOT NULL,
  certificate_id bigint,
  email_type text NOT NULL CHECK (email_type = ANY (ARRAY['THANK_YOU'::text, 'SECTION_18A'::text])),
  recipient text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['SENT'::text, 'FAILED'::text])),
  provider_message_id text,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  donor_id bigint,
  recipient_email text,
  recipient_name text,
  gmail_message_id text,
  gmail_thread_id text,
  sent_by_user_id integer,
  CONSTRAINT donation_email_logs_pkey PRIMARY KEY (id),
  CONSTRAINT donation_email_logs_donation_id_fkey FOREIGN KEY (donation_id) REFERENCES public.donations(id),
  CONSTRAINT donation_email_logs_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.section18a_certificates(id),
  CONSTRAINT donation_email_logs_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.certificate_settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  organisation_name text NOT NULL DEFAULT ''::text,
  pbo_number text NOT NULL DEFAULT ''::text,
  section18a_reference text NOT NULL DEFAULT ''::text,
  physical_address text NOT NULL DEFAULT ''::text,
  postal_address text NOT NULL DEFAULT ''::text,
  contact_email text NOT NULL DEFAULT ''::text,
  contact_phone text NOT NULL DEFAULT ''::text,
  sender_display_name text NOT NULL DEFAULT ''::text,
  reply_to_email text NOT NULL DEFAULT ''::text,
  subject_template text NOT NULL DEFAULT ''::text,
  footer_text text NOT NULL DEFAULT ''::text,
  signature_name text NOT NULL DEFAULT ''::text,
  signature_title text NOT NULL DEFAULT ''::text,
  default_acknowledgement_message text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  logo_url text NOT NULL DEFAULT ''::text,
  npo_number text NOT NULL DEFAULT ''::text,
  website text NOT NULL DEFAULT ''::text,
  certificate_prefix text NOT NULL DEFAULT '18A'::text,
  CONSTRAINT certificate_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.assistant_queries (
  id integer NOT NULL DEFAULT nextval('assistant_queries_id_seq'::regclass),
  user_id integer,
  user_role text,
  screen text,
  question text NOT NULL,
  outcome text NOT NULL,
  topic_id text,
  target_screen text,
  error_message text,
  latency_ms integer,
  provider text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assistant_queries_pkey PRIMARY KEY (id),
  CONSTRAINT assistant_queries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_invites (
  id integer NOT NULL DEFAULT nextval('user_invites_id_seq'::regclass),
  email text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['warehouse_worker'::text, 'manager'::text, 'admin'::text])),
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  revoked_at timestamp with time zone,
  invited_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_sent_at timestamp with time zone NOT NULL DEFAULT now(),
  resend_count integer NOT NULL DEFAULT 0,
  email_status text CHECK (email_status = ANY (ARRAY['sent'::text, 'stubbed'::text, 'failed'::text])),
  email_error text,
  email_attempted_at timestamp with time zone,
  CONSTRAINT user_invites_pkey PRIMARY KEY (id),
  CONSTRAINT user_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id)
);
CREATE TABLE public.collection_kits (
  id integer NOT NULL DEFAULT nextval('collection_kits_id_seq'::regclass),
  owner_name character varying NOT NULL,
  suburb character varying,
  assigned_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collection_kits_pkey PRIMARY KEY (id)
);
CREATE TABLE public.collection_kit_records (
  id integer NOT NULL DEFAULT nextval('collection_kit_records_id_seq'::regclass),
  kit_id integer NOT NULL,
  kg_compost numeric NOT NULL CHECK (kg_compost >= 0::numeric),
  logged_at date NOT NULL DEFAULT CURRENT_DATE,
  status character varying NOT NULL DEFAULT 'logged'::character varying CHECK (status::text = ANY (ARRAY['logged'::character varying, 'dispatched'::character varying]::text[])),
  dispatched_at timestamp with time zone,
  notes text,
  logged_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  dispatched_to character varying,
  CONSTRAINT collection_kit_records_pkey PRIMARY KEY (id),
  CONSTRAINT collection_kit_records_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES public.collection_kits(id),
  CONSTRAINT collection_kit_records_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES public.users(id)
);
CREATE TABLE public.finance_report_access_links (
  id integer NOT NULL DEFAULT nextval('finance_report_access_links_id_seq'::regclass),
  token_hash text NOT NULL UNIQUE,
  created_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  revoked_by integer,
  CONSTRAINT finance_report_access_links_pkey PRIMARY KEY (id),
  CONSTRAINT finance_report_access_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT finance_report_access_links_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id)
);
CREATE TABLE public.finance_report_email_settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  recipient_email text,
  updated_by integer,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT finance_report_email_settings_pkey PRIMARY KEY (id),
  CONSTRAINT finance_report_email_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.finance_report_email_logs (
  id integer NOT NULL DEFAULT nextval('finance_report_email_logs_id_seq'::regclass),
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['SENT'::text, 'FAILED'::text])),
  finance_link_id integer,
  provider_message_id text,
  error_message text,
  sent_by_user_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_at timestamp with time zone,
  CONSTRAINT finance_report_email_logs_pkey PRIMARY KEY (id),
  CONSTRAINT finance_report_email_logs_finance_link_id_fkey FOREIGN KEY (finance_link_id) REFERENCES public.finance_report_access_links(id),
  CONSTRAINT finance_report_email_logs_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.ecd_collection_reminders (
  id integer NOT NULL DEFAULT nextval('ecd_collection_reminders_id_seq'::regclass),
  ecd_id integer NOT NULL,
  collection_date date NOT NULL,
  channel character varying NOT NULL,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'sending'::character varying, 'sent'::character varying, 'failed'::character varying, 'cancelled'::character varying]::text[])),
  sent_at timestamp with time zone,
  provider_message_id text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ecd_collection_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT ecd_collection_reminders_ecd_id_fkey FOREIGN KEY (ecd_id) REFERENCES public.ecd_centres(id)
);
CREATE TABLE public.reporting_targets (
  user_id integer NOT NULL,
  metric_id character varying NOT NULL,
  value numeric NOT NULL CHECK (value >= 0::numeric),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reporting_targets_pkey PRIMARY KEY (user_id, metric_id),
  CONSTRAINT reporting_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.push_subscriptions (
  id integer NOT NULL DEFAULT nextval('push_subscriptions_id_seq'::regclass),
  user_id integer NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_success_at timestamp with time zone,
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- Operational Goals V1
-- Separate feature table only. Goal progress is calculated live from existing WMS source tables.
-- No snapshots, history tables, AI persistence, progress tables, or Reporting references.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS operational_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  goal_text TEXT NOT NULL CHECK (btrim(goal_text) <> ''),

  metric_id TEXT NOT NULL CHECK (btrim(metric_id) <> ''),
  metric_filters JSONB,

  goal_type TEXT NOT NULL CHECK (goal_type IN ('DIRECTIONAL', 'TARGET')),
  direction TEXT NOT NULL CHECK (direction IN ('INCREASE', 'DECREASE', 'MAINTAIN')),

  target_value NUMERIC,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  comparison_type TEXT NOT NULL CHECK (comparison_type IN ('TARGET', 'PREVIOUS_PERIOD')),

  goal_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (goal_state IN ('ACTIVE', 'ARCHIVED')),

  created_by INTEGER REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,

  CONSTRAINT operational_goals_period_check
    CHECK (period_start <= period_end),
  CONSTRAINT operational_goals_metric_filters_object_check
    CHECK (metric_filters IS NULL OR jsonb_typeof(metric_filters) = 'object'),
  CONSTRAINT operational_goals_target_value_check
    CHECK (goal_type <> 'TARGET' OR target_value IS NOT NULL),
  CONSTRAINT operational_goals_archive_state_check
    CHECK (
      (goal_state = 'ACTIVE' AND archived_at IS NULL)
      OR
      (goal_state = 'ARCHIVED' AND archived_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_operational_goals_goal_state
  ON operational_goals(goal_state);

CREATE INDEX IF NOT EXISTS idx_operational_goals_metric_id
  ON operational_goals(metric_id);

CREATE INDEX IF NOT EXISTS idx_operational_goals_created_by
  ON operational_goals(created_by);

CREATE INDEX IF NOT EXISTS idx_operational_goals_period
  ON operational_goals(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_operational_goals_active
  ON operational_goals(period_end, created_at)
  WHERE goal_state = 'ACTIVE';
CREATE TABLE public.recipes (
  id integer NOT NULL DEFAULT nextval('recipes_id_seq'::regclass),
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 80),
  kind text NOT NULL CHECK (kind = ANY (ARRAY['summer'::text, 'winter'::text, 'override'::text])),
  season_start_month smallint CHECK (season_start_month >= 1 AND season_start_month <= 12),
  season_start_day smallint CHECK (season_start_day >= 1 AND season_start_day <= 31),
  starts_on date,
  ends_on date,
  created_by integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recipes_pkey PRIMARY KEY (id),
  CONSTRAINT recipes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT recipes_shape_check CHECK ((kind = 'override'::text AND starts_on IS NOT NULL AND ends_on IS NOT NULL AND ends_on >= starts_on AND season_start_month IS NULL AND season_start_day IS NULL) OR (kind <> 'override'::text AND starts_on IS NULL AND ends_on IS NULL AND season_start_month IS NOT NULL AND season_start_day IS NOT NULL))
);
CREATE TABLE public.recipe_lines (
  id integer NOT NULL DEFAULT nextval('recipe_lines_id_seq'::regclass),
  recipe_id integer NOT NULL,
  product_id integer NOT NULL,
  quantity_per_child numeric NOT NULL CHECK (quantity_per_child > 0::numeric),
  unit character varying NOT NULL,
  CONSTRAINT recipe_lines_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_lines_one_per_product UNIQUE (recipe_id, product_id),
  CONSTRAINT recipe_lines_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE,
  CONSTRAINT recipe_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.recipe_own_order_centres (
  ecd_id integer NOT NULL,
  added_by integer,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recipe_own_order_centres_pkey PRIMARY KEY (ecd_id),
  CONSTRAINT recipe_own_order_centres_ecd_id_fkey FOREIGN KEY (ecd_id) REFERENCES public.ecd_centres(id) ON DELETE CASCADE,
  CONSTRAINT recipe_own_order_centres_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id)
);
CREATE TABLE public.supplier_products (
  supplier_id integer NOT NULL,
  product_id integer NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT supplier_products_pkey PRIMARY KEY (supplier_id, product_id),
  CONSTRAINT supplier_products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE,
  CONSTRAINT supplier_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);

-- ─────────────────────────────────────────────────────────────
-- ADDED AFTER THE EXPORT ABOVE
-- The live database also has what follows. These are the statements
-- that created them, kept here because the numbered migration files
-- they came from are no longer in the repository. Like the export,
-- this is for reference: the database already has all of it.
-- Two views in the live database, vw_low_stock and
-- vw_ecd_collection_history, are defined nowhere in this repository.
-- ─────────────────────────────────────────────────────────────

-- ── from 029_create_saved_reports ──
-- Saved Operations reports: a manager's own shortlist of reports, some
-- pinned to the top of the page, some emailed to them on a schedule.
-- `spec` is what to run (a prepared report, a custom report or a
-- comparison); `preset` is the period when opened on the page. A
-- scheduled email always covers the last full week or month.
CREATE TABLE IF NOT EXISTS saved_reports (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(120) NOT NULL,
  kind          VARCHAR(20) NOT NULL CHECK (kind IN ('report', 'custom', 'comparison')),
  spec          JSONB NOT NULL,
  preset        VARCHAR(20) NOT NULL DEFAULT 'last_3m',
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  schedule      VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (schedule IN ('none', 'weekly', 'monthly')),
  last_sent_at  TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_user ON saved_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_schedule ON saved_reports(schedule) WHERE schedule <> 'none';

-- ── from 031_create_password_resets ──
-- =============================================================
-- server/database/migrations/031_create_password_resets.sql
--
-- Self-service password reset by email, replacing LoginPage.jsx's
-- "contact your admin" modal. Modelled directly on migration 023's
-- user_invites: token hashed at rest, resolved publicly by hash
-- before any session exists.
--
-- ONE ROW PER REQUEST, not one row per user. Unlike user_invites'
-- overwrite-in-place resend, a reset has no admin-facing "resend"
-- action — a new request from the same user does not mutate an
-- existing row, it supersedes it (see superseded_at) and inserts a
-- new one, so the full request history survives for audit.
--
-- token_hash is not UNIQUE, same reasoning as
-- idx_user_invites_token_hash: a SHA-256 collision guards against
-- nothing realistic, so this is a plain lookup index.
--
-- NOT ENFORCED HERE: single-live-token-per-user. The database allows
-- more than one live (used_at IS NULL AND superseded_at IS NULL) row
-- per user_id — the service is responsible for superseding a user's
-- prior live rows before inserting a new one, and for throttling
-- repeat requests, so a raced pair of requests can't leave two live
-- tokens outstanding for the same account.
--
-- Idempotent: safe to run more than once.
-- =============================================================

CREATE TABLE IF NOT EXISTS password_resets (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  token_hash          TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  used_at             TIMESTAMPTZ,
  -- Set when a newer request for the same user makes this one no
  -- longer current. Distinct from used_at (this token was never
  -- consumed) and distinct from simply expiring by time — see
  -- passwordReset.service.js's loadValidReset, which reports it as
  -- its own reason ('superseded') rather than folding it into
  -- 'expired'.
  superseded_at       TIMESTAMPTZ,
  requested_ip        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'sent' | 'stubbed' | 'failed' | NULL (no attempt recorded —
  -- e.g. the request was throttled before an email was ever composed).
  email_status        TEXT,
  email_error         TEXT,
  email_attempted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash
  ON password_resets(token_hash);

-- Matches exactly what the service needs to ask: "does this user have
-- a live request right now" — the per-email throttle window check and
-- the supersede-before-insert step both filter on this same shape.
CREATE INDEX IF NOT EXISTS idx_password_resets_active
  ON password_resets(user_id, created_at DESC)
  WHERE used_at IS NULL AND superseded_at IS NULL;

-- ── from 032_create_outbound_messages ──
-- =============================================================
-- server/database/migrations/032_create_outbound_messages.sql
--
-- One record of every message the system sends, whatever sent it.
--
-- Before this, each sender recorded its own outcome in its own place:
-- donation_email_logs, finance_report_email_logs,
-- ecd_collection_reminders, columns on user_invites / password_resets /
-- purchase_orders — and scheduled reports nowhere. "Did that email go
-- out?" meant knowing which of five tables to look in. Every send now
-- goes through services/communications.service.js,
-- which writes one row here.
--
-- THE OLD LOGS STAY. Each sender still writes its own record as it
-- always has; this table is written alongside them, not instead of
-- them, until each move is verified. Nothing reads the old tables any
-- less than before.
--
--   channel        'email' today; the column is here so SMS or push can
--                  share the history without another table
--   type           what kind of message — the keys in
--                  features/communications/messageTypes.js
--   recipient      the address it went to
--   subject        what the recipient saw as the subject, for finding it
--   status         'sent' | 'stubbed' (EMAIL_ENABLED off) | 'failed'
--   error          the provider's reason, when it failed
--   related_type / related_id
--                  the record it was about (a purchase order, an
--                  invite, a donation), for linking back
--   sent_by        the user whose action sent it, when there was one
--   attempted_at   when the send was tried
--
-- Idempotent: safe to run more than once.
-- =============================================================

CREATE TABLE IF NOT EXISTS outbound_messages (
  id            BIGSERIAL PRIMARY KEY,
  channel       TEXT NOT NULL DEFAULT 'email',
  type          TEXT NOT NULL,
  recipient     TEXT,
  subject       TEXT,
  status        TEXT NOT NULL,
  error         TEXT,
  related_type  TEXT,
  related_id    TEXT,
  sent_by       INTEGER REFERENCES users(id),
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outbound_messages_status_check'
  ) THEN
    ALTER TABLE outbound_messages
      ADD CONSTRAINT outbound_messages_status_check
      CHECK (status IN ('sent', 'stubbed', 'failed'));
  END IF;
END $$;

-- The history screen reads newest first, optionally by type.
CREATE INDEX IF NOT EXISTS idx_outbound_messages_attempted
  ON outbound_messages (attempted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_messages_type_attempted
  ON outbound_messages (type, attempted_at DESC, id DESC);
-- "Every message about this purchase order / invite / donation".
CREATE INDEX IF NOT EXISTS idx_outbound_messages_related
  ON outbound_messages (related_type, related_id);

-- ── from 033_create_app_settings ──
-- =============================================================
-- server/database/migrations/033_create_app_settings.sql
--
-- Values an admin can change that used to be constants in the code:
-- the non-collection cut-off hour, the collection-reminder send hour,
-- the two expiry-warning windows, and how long an invite link lasts.
--
-- ONE ROW PER CHANGED VALUE. A key with no row uses the default in
-- server/src/features/settings/settingsDefinitions.js, which is the
-- value the code had before this table existed — so applying this
-- migration changes nothing until someone saves a setting, and a
-- database without it behaves exactly as before.
--
-- value is JSONB so a setting can be a number, a string or a list
-- without a column per type; settingsDefinitions.js validates it.
--
-- Idempotent: safe to run more than once.
-- =============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── from 034_create_operating_closures ──
-- ─────────────────────────────────────────────────────────────
-- 034_create_operating_closures.sql
--
-- The operating calendar's closed days: public holidays and other
-- closures (stocktake, a shutdown week). One row per date. Collection
-- reminders are not sent for a closed collection day, and the
-- non-collection sweep does not write off pallets due on one.
--
-- Which weekday each cohort collects on is not here: it is two
-- app_settings keys (calendar.tuesdayCohortWeekday,
-- calendar.thursdayCohortWeekday), defaulting to Tuesday and Thursday.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operating_closures (
  id          SERIAL PRIMARY KEY,
  closed_on   DATE NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN ('public_holiday', 'closure')),
  label       TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── from 035_add_approved_to_request_outcome ──
-- Benevolent requests: a request is approved by a manager before anyone
-- packs it. "pending" stays and is shown as "Awaiting approval";
-- "referred" stays in the enum, unused.
--
-- Its own file on purpose. The runner wraps every file in one
-- transaction, and a value added to an enum cannot be used until the
-- transaction that added it has committed. Everything that refers to
-- 'approved' is in 036.
--
-- Idempotent: safe to run more than once.
ALTER TYPE request_outcome ADD VALUE IF NOT EXISTS 'approved' AFTER 'pending';

-- ── from 036_create_community_request_items ──
-- Benevolent requests: the products a manager approves, and the
-- bookkeeping around approval and the "needs new items" flag.
--
-- community_request_items
--   One row per product on an approved request. quantity_approved is
--   what the manager set aside; quantity_released is what the worker
--   confirmed went out (0 until then; never more than approved).
--   short_at is set on a line when stock for that product dropped below
--   what pallets and other requests need: the line stops reserving
--   stock and the request is flagged. Choosing other items clears it.
--
-- community_requests
--   approved_by / approved_at   who approved it and when. The most
--                               recently approved request is flagged
--                               first when stock runs short.
--   assigned_to                 the packer a manager picked, if any.
--   items_short_at              set while any line is short. This is
--                               also what stops a second notification
--                               for the same request.
--
-- Existing rows are untouched: no backfill, no data changes.
--
-- No BEGIN/COMMIT (the runner wraps the file). Idempotent: safe to run
-- more than once.

CREATE TABLE IF NOT EXISTS community_request_items (
  id                 SERIAL PRIMARY KEY,
  request_id         INTEGER NOT NULL REFERENCES community_requests(id) ON DELETE CASCADE,
  product_id         INTEGER NOT NULL REFERENCES products(id),
  unit               VARCHAR(20) NOT NULL,
  quantity_approved  NUMERIC NOT NULL CHECK (quantity_approved > 0),
  quantity_released  NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_released >= 0),
  short_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_request_items_request_product_key UNIQUE (request_id, product_id),
  CONSTRAINT community_request_items_released_le_approved CHECK (quantity_released <= quantity_approved)
);

-- The committed-stock sum groups by product.
CREATE INDEX IF NOT EXISTS idx_community_request_items_product
  ON community_request_items (product_id);

ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS approved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;
ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS items_short_at TIMESTAMPTZ;

-- ── from 040_create_idempotency_keys ──
-- ─────────────────────────────────────────────────────────────
-- 040_create_idempotency_keys.sql
--
-- Lets the server recognise a submission it has already handled.
--
-- A phone with no signal keeps what a worker submitted and sends it
-- when the signal returns (client/src/services/outbox.js). A send can
-- be interrupted after the server acted but before the phone heard
-- back, so the same submission can arrive twice. Each one carries a
-- key the phone made up; the first time the key is seen the work is
-- done and the answer stored here, and a repeat gets that stored answer
-- instead of being done again.
--
-- Receiving, dispatch and donation intake already do this with a
-- column of their own. This table is for everything else the floor
-- submits: packing, decanting, benevolent requests, Feed the Soil.
-- See server/src/middleware/idempotency.middleware.js.
--
-- status_code and response are empty while the first attempt is still
-- running.
--
-- Additive only: one new table.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 8 AND 100),
  scope       TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  status_code SMALLINT,
  response    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Old keys are cleared by age.
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys (created_at);


-- from 041_create_photos
-- ─────────────────────────────────────────────────────────────
-- 041_create_photos.sql
--
-- A photo a worker takes on the floor: of an item they flagged while
-- packing (short, damaged, substituted), or of a delivery as it arrived.
--
-- entity_type + entity_id say what the photo is of:
--   picking_slip_item  -> picking_slip_items.id
--   purchase_order     -> purchase_orders.id
-- Not a foreign key, on purpose: one table serves both, and a photo is
-- evidence that should outlive an edited slip line.
--
-- THE PICTURE IS IN THE ROW (data). The phone shrinks it first to about
-- 1280 pixels and compresses it, so each is roughly 150 KB; the server
-- refuses anything over 400 KB. That keeps this workable inside the
-- database, but the database allowance is small: a few thousand photos.
-- When that is no longer enough, move `data` to Supabase file storage
-- and keep the rest of the row (see photo.repository.js).
--
-- Additive only: one new table.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photos (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('picking_slip_item', 'purchase_order')),
  entity_id    INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/webp', 'image/png')),
  byte_size    INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 409600),
  data         BYTEA NOT NULL,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS photos_entity_idx ON photos (entity_type, entity_id);


-- from 042_add_user_language
-- ─────────────────────────────────────────────────────────────
-- 042_add_user_language.sql
--
-- The language a person reads the floor screens in: English, Afrikaans
-- or isiXhosa. Kept on the account, not the device, because tablets are
-- shared: it follows whoever signs in.
--
-- Additive only: one new column, English for everyone until they choose.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'af', 'xh'));


-- from 043_add_purchase_order_follow_up
-- ─────────────────────────────────────────────────────────────
-- 043_add_purchase_order_follow_up.sql
--
-- A follow-up order: a second purchase order for what was short on the
-- first. follow_up_of points at the order it follows.
--
-- How an order now moves when a delivery comes in short:
--
--   approved ── short delivery ──> follow_up_required
--   follow_up_required ── a manager creates the follow-up order ──> partially_received
--   the follow-up order is fully received ──> both become completed
--
-- A follow-up can itself come in short and get a follow-up of its own;
-- completing the last one completes every order behind it.
--
-- Additive only: one new column and its index.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS follow_up_of INTEGER REFERENCES purchase_orders(id);

CREATE INDEX IF NOT EXISTS purchase_orders_follow_up_of_idx
  ON purchase_orders (follow_up_of) WHERE follow_up_of IS NOT NULL;


-- from 044_add_product_decantable
-- ─────────────────────────────────────────────────────────────
-- 044_add_product_decantable.sql
--
-- Decantable: a product kept loose, by weight or volume, that the team
-- portions out of bulk (maize meal, rice, sugar, oil).
--
-- The flag decides two things:
--   - only a decantable product is offered on the Decanting screen
--   - only a decantable product can have a part quantity anywhere:
--     on a slip, when packing, receiving, dispatching or adjusting
--     stock. Everything else (a can, a crate, a jar) is a whole number.
--
-- Starting point: whatever is measured in kilograms, grams, litres or
-- millilitres is decantable, whatever is counted is not. An admin
-- changes any of them on the Products screen.
--
-- Additive only: one new column.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_decantable BOOLEAN NOT NULL DEFAULT false;

UPDATE products
   SET is_decantable = true
 WHERE default_unit IN ('kg', 'g', 'l', 'ml')
   AND is_decantable = false;

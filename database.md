# Database Schema — Ladles of Love WMS

## Status of this document

This schema is derived from the Milestone 2 class diagram. Every change from the original
diagram is called out inline with a `-- ADJUSTED` or `-- NEW` comment and cross-referenced
to the relevant warehouse-visit section number, so anyone can trace *why* a field exists.

**This documents the intended/target schema, not necessarily the exact live database.**
Once the current build is available, reconcile this file against the actual Supabase
schema (`pg_dump --schema-only`, or `server/database/schema.sql` in the repo) and update
whichever one is wrong. Docs should track code, not the reverse.

## Conventions

- Primary keys are `UUID DEFAULT gen_random_uuid()` throughout, matching Supabase
  convention.
- **Known exception:** `suppliers`, `purchase_orders`, `purchase_order_items`, `products`,
  and `users` were originally built before the Supabase decision was made and used
  integer `SERIAL` keys. If they're still integers in the live DB, either migrate them to
  UUID for consistency or note the exception explicitly — don't silently mix the two
  conventions going forward.
- All tables get `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` unless noted.
- Soft-delete via `is_active BOOLEAN DEFAULT TRUE` is used instead of hard deletes
  wherever historical records need to survive removal (e.g. ECDs — see §6.5 below).
- Row-Level Security policies scope every table to `programme_id` except where noted as
  cross-programme (reporting, users, roles).

## Contents

1. Identity & Access
2. Core Domain
3. Procurement & Receiving
4. Donations
5. Decanting & Inventory Management
6. Picking & Dispatch
7. Guest / Volunteer Sessions
8. Finance & Reporting
9. Feed the Soil
10. Love Activism
11. Adjustments summary (traceability table)
12. Open questions

---

## 1. Identity & Access

```sql
-- ─────────────────────────────────────────────────────────────
-- ROLES
-- Four permission levels: Warehouse Packer, Dispatch Staff,
-- Warehouse Manager, Administrator.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE roles (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name         VARCHAR(50)   NOT NULL UNIQUE,
  access_level      INTEGER       NOT NULL,
  can_edit_details  BOOLEAN       NOT NULL DEFAULT FALSE,
  permissions       JSONB         NOT NULL DEFAULT '[]'
);

-- ─────────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50)   NOT NULL UNIQUE,
  first_name    VARCHAR(100)  NOT NULL,   -- used for dashboard greetings, "Love Activists" tone
  last_name     VARCHAR(100)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role_id       UUID          NOT NULL REFERENCES roles(id),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Many-to-many: a user can have access to more than one programme
CREATE TABLE user_programme_access (
  user_id       UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  programme_id  UUID  NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, programme_id)
);

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOG
-- Every manual override (PO status changes, dispatch cohort
-- overrides) must write here — this is what makes §2.2 and §4.2
-- enforceable rather than just a UI convention.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_by        UUID          REFERENCES users(id),
  table_name        VARCHAR(100)  NOT NULL,
  record_id         UUID          NOT NULL,
  change_description TEXT         NOT NULL,
  changed_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
```

## 2. Core Domain

```sql
-- ─────────────────────────────────────────────────────────────
-- PROGRAMMES
-- NOC (Nourish Our Children), Feed the Soil, Love Activism
-- ─────────────────────────────────────────────────────────────
CREATE TABLE programmes (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100)  NOT NULL UNIQUE,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE
);

-- ─────────────────────────────────────────────────────────────
-- RECIPES
-- ECD portion calculations, baked from M&E daily-food standards.
-- Migrated from ECD spreadsheets during initial data migration.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE recipes (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200)  NOT NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE recipe_ingredients (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID          NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_name VARCHAR(200) NOT NULL,
  quantity    NUMERIC(10,3) NOT NULL,
  unit        VARCHAR(20)
);

-- ─────────────────────────────────────────────────────────────
-- ECD CENTRES
-- cohort is a HARD constraint, not just a UI label — see §4.2.
-- is_active enables soft-delete so historical dispatch records
-- survive an ECD being offboarded — see §6.5.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE ecd_centers (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(200)  NOT NULL,
  cohort            VARCHAR(10)   NOT NULL CHECK (cohort IN ('tuesday', 'thursday')),
  location          VARCHAR(255),
  no_of_children    INTEGER       NOT NULL DEFAULT 0,
  no_of_staff       INTEGER       NOT NULL DEFAULT 0,
  is_approved       BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,  -- ADJUSTED §6.5: soft delete only
  recipe_id         UUID          REFERENCES recipes(id),
  programme_id      UUID          NOT NULL REFERENCES programmes(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- NEW beneficiary types — required by §3.1-3.4 (picking slips
-- exist for THREE beneficiary types, not just ECDs).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE dignity_kitchens (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200)  NOT NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE
);
-- No impact reports for dignity kitchens — enforced in application
-- logic based on beneficiary_type, not a column here (§3.3).

CREATE TABLE soup_kitchens (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200)  NOT NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE
);
-- Soup kitchens DO require impact reports, same as ECDs (§3.4).

-- ─────────────────────────────────────────────────────────────
-- STOCK ITEMS / INVENTORY
-- ─────────────────────────────────────────────────────────────
CREATE TABLE stock_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           VARCHAR(50)   NOT NULL UNIQUE,
  name          VARCHAR(200)  NOT NULL,
  weight        NUMERIC(10,3),
  item_type     VARCHAR(50),
  price         NUMERIC(10,2),
  quantity      INTEGER       NOT NULL DEFAULT 0,
  programme_id  UUID          REFERENCES programmes(id),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE storage_locations (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  area        VARCHAR(100)  NOT NULL,
  capacity    NUMERIC(10,2),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE inventory (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id       UUID          NOT NULL REFERENCES stock_items(id),
  storage_location_id UUID          REFERENCES storage_locations(id),
  quantity            INTEGER       NOT NULL DEFAULT 0,
  level_flag          VARCHAR(20)   NOT NULL DEFAULT 'ok'
                                     CHECK (level_flag IN ('ok', 'low', 'critical')),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Every quantity change (receiving, decanting, picking, dispatch,
-- donation) should insert here — this is the audit trail for stock.
CREATE TABLE stock_movements (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id UUID          NOT NULL REFERENCES stock_items(id),
  quantity      INTEGER       NOT NULL,
  removed       BOOLEAN       NOT NULL DEFAULT FALSE,
  reference_type VARCHAR(50), -- e.g. 'delivery', 'decanting', 'picking', 'donation' — keep this populated, it was previously dropped silently in one known bug
  reference_id  UUID,
  programme_id  UUID          REFERENCES programmes(id),
  movement_date DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

**Offline note:** the stock count screen (decanting team, §"Inventory Management") must
work fully offline. This isn't a schema change — `stock_movements` already supports
batched inserts — but the client needs a local queue (IndexedDB or similar) that batches
entries and syncs on reconnect. Flag this explicitly in sprint planning; it's easy to lose
as "just another form."

## 3. Procurement & Receiving

```sql
-- ─────────────────────────────────────────────────────────────
-- SUPPLIERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(), -- see Conventions: may be INT in live DB
  name          VARCHAR(200)  NOT NULL UNIQUE,
  contact_email VARCHAR(255),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE
);

-- ─────────────────────────────────────────────────────────────
-- REMOVED: drivers table.
-- ADJUSTED §1.4 — driver identity is not tracked. Suppliers
-- either bring their own delivery note or an invoice; the
-- to-be system only needs supplier ID + PO ID. Do not recreate
-- a `drivers` entity or a `driver_id` column anywhere below.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- PURCHASE ORDERS
-- ADJUSTED §2.2 — status expanded from (pending, approved,
-- completed) to the full model the warehouse visit requires.
-- Only a Warehouse Manager may change status — enforce via RLS
-- policy + write to audit_log on every status change.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE purchase_orders (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id             UUID          NOT NULL REFERENCES suppliers(id),
  created_by              UUID          REFERENCES users(id),
  status                  VARCHAR(30)   NOT NULL DEFAULT 'pending'
                                        CHECK (status IN (
                                          'pending', 'in_transit', 'partially_received',
                                          'received', 'returned', 'follow_up_required'
                                        )),
  return_reason           TEXT,         -- required when status = 'returned', enforce in service layer
  expected_delivery_date  DATE,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   UUID          NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  stock_item_id       UUID          NOT NULL REFERENCES stock_items(id),
  expected_quantity   INTEGER       NOT NULL CHECK (expected_quantity > 0),
  expected_weight_kg  NUMERIC(10,3),
  unit_price          NUMERIC(10,2)
);

-- ─────────────────────────────────────────────────────────────
-- DELIVERY NOTES
-- ADJUSTED §1.4 / §2.1 — no driver_id. System auto-generates
-- this record (and its PDF) when staff submit the proof of
-- delivery form; suppliers no longer bring their own document.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE delivery_notes (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       UUID          NOT NULL REFERENCES suppliers(id),
  purchase_order_id UUID          NOT NULL REFERENCES purchase_orders(id),
  received_by       UUID          REFERENCES users(id),
  delivery_date     DATE          NOT NULL,
  signature         TEXT,         -- base64 PNG
  status            VARCHAR(20)   NOT NULL DEFAULT 'recorded',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- NEW: DELIVERY RECEIPTS
-- ADJUSTED §2.3 — a PO can be fulfilled in multiple instalments.
-- One PO now links to MANY receipts instead of being treated as
-- a single event. This is the schema change flagged as needed
-- before Alessio builds the receiving tables further.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE delivery_receipts (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   UUID          NOT NULL REFERENCES purchase_orders(id),
  delivery_note_id    UUID          REFERENCES delivery_notes(id),
  received_quantity   INTEGER       NOT NULL,
  received_weight_kg  NUMERIC(10,3),
  receipt_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  status              VARCHAR(20)   NOT NULL DEFAULT 'recorded',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_receipts_po ON delivery_receipts(purchase_order_id);

-- ─────────────────────────────────────────────────────────────
-- QUICKBOOKS SYNC
-- PO-ID push logic depends on the outcome of the §2.4 API spike.
-- If QuickBooks doesn't support PO creation via API, add a
-- dual-ID reference table here (wms_po_id ↔ quickbooks_po_id)
-- instead of extending this table.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE quickbooks_sync (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type     VARCHAR(50)   NOT NULL,
  status        VARCHAR(20)   NOT NULL,
  last_sync_at  TIMESTAMPTZ
);
```

## 4. Donations

```sql
-- ─────────────────────────────────────────────────────────────
-- DONATION INTAKE
-- ADJUSTED §5.2/§5.3 — donation_category, estimated_value,
-- donor_name, donor_contact are all NEW. Without these captured
-- AT INTAKE, the Section 18A flag can never fire — the original
-- diagram only had these fields on the certificate, generated
-- too late in the flow. Form must complete in under 60 seconds
-- and 3 fields max for the basic case — donor fields are optional.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE donation_intake_records (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id        UUID          REFERENCES programmes(id),
  donation_category   VARCHAR(100)  NOT NULL,          -- NEW §5.3
  estimated_value     NUMERIC(10,2) NOT NULL DEFAULT 0, -- NEW §5.3 — drives Section 18A trigger
  donor_name          VARCHAR(200),                     -- NEW §5.3, optional
  donor_contact       VARCHAR(200),                     -- NEW §5.3, optional
  intake_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE donation_items (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_intake_id    UUID          NOT NULL REFERENCES donation_intake_records(id) ON DELETE CASCADE,
  item_description      VARCHAR(255)  NOT NULL,
  quantity              INTEGER       NOT NULL DEFAULT 1,
  matches_recipe        BOOLEAN       NOT NULL DEFAULT FALSE -- drives returnValidItems()/listNonRecipeItems() logic
);

-- Auto-generated when a qualifying donation_intake_record is
-- created (estimated_value over threshold AND donor_name present).
CREATE TABLE donation_certificates (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_intake_id      UUID          NOT NULL REFERENCES donation_intake_records(id),
  donation_value          NUMERIC(10,2) NOT NULL,
  issue_date              DATE          NOT NULL DEFAULT CURRENT_DATE,
  donor_details           VARCHAR(255),
  tax_certificate_number  VARCHAR(100),
  is_valid                BOOLEAN       NOT NULL DEFAULT TRUE
);

-- ─────────────────────────────────────────────────────────────
-- NEW: COMMUNITY REQUESTS
-- ADJUSTED §5.4 — inbound stock movement (people calling in
-- asking for goods) is currently unreconciled anywhere. Low
-- effort, flagged as high accountability value.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE community_requests (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_name       VARCHAR(200), -- optional
  items_requested   TEXT          NOT NULL,
  quantity          INTEGER,
  request_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
  outcome           VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                  CHECK (outcome IN ('pending', 'fulfilled', 'declined')),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

## 5. Decanting & Inventory Management

```sql
CREATE TABLE decanting_records (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id     UUID          NOT NULL REFERENCES stock_items(id),
  bulk_bag_weight   NUMERIC(10,3) NOT NULL,
  target_quantity   INTEGER       NOT NULL,
  target_weight     NUMERIC(10,3) NOT NULL,
  recorded_by       UUID          REFERENCES users(id),
  decanting_date    DATE          NOT NULL DEFAULT CURRENT_DATE
);

-- Wastage/surplus is a normal, expected outcome of decanting
-- (bags rarely weigh exactly 25kg/50kg) — not an error condition.
CREATE TABLE wastage_logs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id     UUID          NOT NULL REFERENCES stock_items(id),
  bulk_bag_weight   NUMERIC(10,3) NOT NULL,
  target_weight     NUMERIC(10,3) NOT NULL,
  wastage_date      DATE          NOT NULL DEFAULT CURRENT_DATE
);
```

## 6. Picking & Dispatch

```sql
-- ─────────────────────────────────────────────────────────────
-- PICKING SLIPS
-- MAJOR ADJUSTMENT §3.1-3.6. Original diagram hard-typed
-- PickingSlip.ecd → ECDCenter only. The warehouse creates
-- picking slips for THREE beneficiary types with different
-- rules (impact reports required for ecd/soup_kitchen, not
-- dignity_kitchen). beneficiary_type + beneficiary_id replaces
-- the single ecd_id foreign key.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE picking_slips (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_type  VARCHAR(20)   NOT NULL
                                  CHECK (beneficiary_type IN ('ecd', 'dignity_kitchen', 'soup_kitchen')), -- NEW §3.1
  beneficiary_id    UUID          NOT NULL, -- points to ecd_centers / dignity_kitchens / soup_kitchens depending on type above; validate in service layer, not FK (polymorphic)
  recipe_id         UUID          REFERENCES recipes(id), -- only relevant when beneficiary_type = 'ecd'
  pallet_no         VARCHAR(50),
  assigned_to       UUID          REFERENCES users(id), -- NEW §3.1 — manager assigns to staff member/group
  qr_slug           VARCHAR(100)  UNIQUE,                -- NEW §3.5 — guest-accessible unique URL
  status            VARCHAR(20)   NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'assigned', 'packed', 'dispatched')),
  created_by        UUID          REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_picking_slips_qr ON picking_slips(qr_slug);

CREATE TABLE picking_slip_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_slip_id   UUID          NOT NULL REFERENCES picking_slips(id) ON DELETE CASCADE,
  stock_item_id     UUID          NOT NULL REFERENCES stock_items(id),
  quantity          INTEGER       NOT NULL
);

-- Business rule (application layer, not a column):
-- impact reports apply when beneficiary_type IN ('ecd', 'soup_kitchen'),
-- never for 'dignity_kitchen' — §3.3/§3.4.

CREATE TABLE packing_records (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_slip_id   UUID          NOT NULL REFERENCES picking_slips(id),
  packed_by         UUID          REFERENCES users(id),
  guest_session_id  UUID          REFERENCES guest_sessions(id), -- NEW, nullable — see §7 below
  packed_date       DATE          NOT NULL DEFAULT CURRENT_DATE
);

-- ─────────────────────────────────────────────────────────────
-- DISPATCH
-- ADJUSTED §4.2 — cohort assignment is now a HARD constraint.
-- override_by / override_reason must be populated (and written
-- to audit_log) any time a manager dispatches an ECD outside its
-- assigned cohort day.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE dispatch_schedules (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ecd_id            UUID          NOT NULL REFERENCES ecd_centers(id),
  scheduled_date    DATE          NOT NULL,
  status            VARCHAR(20)   NOT NULL DEFAULT 'scheduled',
  parcel_count      INTEGER       NOT NULL DEFAULT 0,
  override_by       UUID          REFERENCES users(id), -- NEW §4.2, nullable
  override_reason   TEXT,                                -- NEW §4.2, required if override_by is set
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
-- Enforce in a trigger or service-layer check: scheduled_date's
-- weekday must match ecd_centers.cohort unless override_by IS NOT NULL.

-- ADJUSTED §4.1 — non-collection needs to be searchable per-ECD,
-- not just a same-day 16:00 flag.
CREATE TABLE collection_records (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ecd_id                UUID          NOT NULL REFERENCES ecd_centers(id),
  dispatch_schedule_id  UUID          NOT NULL REFERENCES dispatch_schedules(id),
  collected             BOOLEAN       NOT NULL DEFAULT FALSE,
  collected_at          TIMESTAMPTZ,
  confirmed_by          UUID          REFERENCES users(id),
  cohort                VARCHAR(10)   NOT NULL
);
CREATE INDEX idx_collection_ecd_history ON collection_records(ecd_id, collected);

-- ─────────────────────────────────────────────────────────────
-- NEW: DISPATCH NOTES (proof of dispatch)
-- ADJUSTED §4.3 — mirrors the delivery_notes pattern on the
-- receiving side: staff confirms → PDF auto-generated → appears
-- on dashboard. Not in the original business case.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE dispatch_notes (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_schedule_id  UUID          NOT NULL REFERENCES dispatch_schedules(id),
  dispatched_by         UUID          REFERENCES users(id),
  generated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  pdf_url               VARCHAR(500)
);
```

## 7. Guest / Volunteer Sessions

```sql
-- ─────────────────────────────────────────────────────────────
-- NEW: GUEST SESSIONS
-- ADJUSTED §6.2/§6.3. Scope carefully: full volunteer hour
-- tracking is explicitly OUT of scope (owned by the parallel VMS
-- team, business case §11.2). This table exists ONLY to let the
-- WMS generate its own end-of-session contribution summary for
-- a guest who signed in with just a first name. Don't grow this
-- into a full volunteer profile.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE guest_sessions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_name        VARCHAR(200)  NOT NULL,
  signed_in_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  signed_out_at     TIMESTAMPTZ,
  summary_sent      BOOLEAN       NOT NULL DEFAULT FALSE
);
-- Parcels packed during a session = COUNT(packing_records WHERE guest_session_id = ...)
-- computed on session close, not stored redundantly.
```

## 8. Finance & Reporting

```sql
CREATE TABLE invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_ref    UUID          REFERENCES dispatch_notes(id),
  generated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  status          VARCHAR(20)   NOT NULL DEFAULT 'draft'
);

CREATE TABLE reports (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type   VARCHAR(50)   NOT NULL,
  programme_id  UUID          REFERENCES programmes(id), -- nullable = cross-programme
  period_start  DATE,
  period_end    DATE,
  data          JSONB,
  narration     TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

Impact-calculator figures (kg of food waste diverted, GHG-equivalents avoided, pages of
paper eliminated, meals enabled, carbon footprint over time) are all derived from data
already captured above — no new tables needed, just aggregation queries in
`ReportingService`.

## 9. Feed the Soil

```sql
CREATE TABLE farms (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(200)  NOT NULL,
  location          VARCHAR(255),
  contact_person    VARCHAR(200),
  contact_number    VARCHAR(50),
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE fts_bins (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  in_use      BOOLEAN       NOT NULL DEFAULT FALSE,
  capacity    NUMERIC(10,2),
  status      VARCHAR(20)   NOT NULL DEFAULT 'clean'
);

CREATE TABLE exchanges (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID          NOT NULL REFERENCES farms(id),
  compost_weight_kg     NUMERIC(10,2),
  vegetable_type        VARCHAR(100),
  vegetable_weight_kg   NUMERIC(10,2),
  exchange_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
  recorded_by           UUID          REFERENCES users(id)
);
```

## 10. Love Activism

```sql
CREATE TABLE events (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(200)  NOT NULL,
  event_date          DATE          NOT NULL,
  no_of_participants  INTEGER,
  warehouse_area      VARCHAR(100)
);

CREATE TABLE bookings (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID          NOT NULL REFERENCES events(id),
  booking_time  TIMESTAMPTZ   NOT NULL,
  approved      BOOLEAN       NOT NULL DEFAULT FALSE
);
```

---

## 11. Adjustments summary (traceability)

| # | Change | Why (warehouse visit ref) |
|---|---|---|
| 1 | Removed `drivers` table and `driver_id` from `delivery_notes` | §1.4 — driver identity isn't tracked; supplier + PO ID is enough |
| 2 | Expanded `purchase_orders.status` enum + added `return_reason` | §2.2 — returned/incomplete deliveries must be recorded |
| 3 | Added `delivery_receipts` table | §2.3 — a PO can be fulfilled in multiple instalments |
| 4 | Added `donation_category`, `estimated_value`, `donor_name`, `donor_contact` to `donation_intake_records` | §5.3 — Section 18A trigger needs this data at intake, not just on the certificate |
| 5 | Added `community_requests` table | §5.4 — inbound requests are currently unreconciled |
| 6 | Replaced `picking_slips.ecd_id` with `beneficiary_type` + `beneficiary_id`; added `dignity_kitchens`, `soup_kitchens` tables | §3.1-3.4 — three beneficiary types, not just ECD |
| 7 | Added `assigned_to`, `qr_slug` to `picking_slips` | §3.1, §3.5 — manager assignment workflow + QR/guest access |
| 8 | Added `override_by`, `override_reason` to `dispatch_schedules`; cohort is a `CHECK` constraint | §4.2 — hard DB constraint, not just a UI warning |
| 9 | Added `dispatch_notes` table | §4.3 — proof of dispatch, mirrors delivery notes |
| 10 | Added `guest_sessions` table | §6.2, §6.3 — session summaries for guest volunteers, scoped narrowly (full tracking stays with VMS) |
| 11 | `ecd_centers.is_active` used for soft delete | §6.5 — historical dispatch records must survive ECD offboarding |


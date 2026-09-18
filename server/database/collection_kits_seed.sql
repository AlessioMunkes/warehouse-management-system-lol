-- ─────────────────────────────────────────────────────────────
-- server/database/collection_kits_seed.sql
--
-- Feed the Soil kit logging (collection_kits) — schema + demo data.
--
-- WHY THIS EXISTS
-- collection_kits was implemented in server/src/repositories/
-- collectionKit.repository.js and used in production, but was never
-- checked into a migration or schema.sql, and no seed data was ever
-- committed either (see database.md §3 for the full story). A fresh
-- database has no way to reproduce this feature or its demo data.
-- This is that missing piece, backfilled from what the application
-- code actually reads and writes.
--
-- SAFE TO RUN AGAINST THE LIVE DATABASE.
--   - CREATE TABLE IF NOT EXISTS: a no-op if collection_kits already
--     exists (it very likely does, live — this only makes it
--     reproducible elsewhere).
--   - The seed INSERT is guarded to run only if collection_kits is
--     currently EMPTY, so running this against a database that
--     already has real kit data adds nothing and changes nothing.
--   - logged_by is left NULL on every seed row rather than guessing a
--     real user id that may not exist in your database — the app
--     already renders a NULL logged_by as no "Logged by ..." line
--     (see collectionKitAPI.js / FeedTheSoilPage.jsx).
--   - Does not touch audit_log: these rows are seed data, not
--     app-driven changes, so there is nothing genuine to audit.
--
-- RUN IT
--   psql "$DATABASE_URL" -f server/database/collection_kits_seed.sql
-- ─────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS collection_kits (
  id                        SERIAL        PRIMARY KEY,
  kit_label                 VARCHAR(200)  NOT NULL,
  location                  VARCHAR(255),
  date_out                  DATE          NOT NULL DEFAULT CURRENT_DATE,
  kg_food_waste_collected   NUMERIC(10,3) NOT NULL CHECK (kg_food_waste_collected >= 0),
  returned_at               TIMESTAMPTZ,
  kg_compost_returned       NUMERIC(10,3) CHECK (kg_compost_returned >= 0),
  status                    VARCHAR(20)   NOT NULL DEFAULT 'out'
                                          CHECK (status IN ('out', 'returned')),
  notes                     TEXT,
  logged_by                 INTEGER       REFERENCES users(id),
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_kits_status ON collection_kits(status);

-- Demo data: a two-month spread (Aug-Sep) so both "This month" and
-- "Last month" report presets have something to show, most kits
-- returned (they count toward compost_processed only once returned),
-- a few still out (the state the list screen needs to demonstrate
-- "Mark returned" against), and one label reused across two different
-- round trips to show that the "already out" guard only blocks a
-- SECOND concurrent trip, not reuse of a label over time.
INSERT INTO collection_kits
  (kit_label, location, date_out, kg_food_waste_collected,
   returned_at, kg_compost_returned, status)
SELECT * FROM (VALUES
  ('Bucket A1', 'Cape Town Warehouse',   DATE '2026-08-03', 22.5::numeric, TIMESTAMPTZ '2026-08-10 09:30:00+02', 14.0::numeric, 'returned'),
  ('Bucket A2', 'Cape Town Warehouse',   DATE '2026-08-05', 18.0::numeric, TIMESTAMPTZ '2026-08-14 10:15:00+02', 11.5::numeric, 'returned'),
  ('Bucket B1', 'Athlone Skip',          DATE '2026-08-10', 25.0::numeric, TIMESTAMPTZ '2026-08-20 08:45:00+02', 16.0::numeric, 'returned'),
  ('Bucket A1', 'Cape Town Warehouse',   DATE '2026-08-17', 20.0::numeric, TIMESTAMPTZ '2026-08-25 11:00:00+02', 12.5::numeric, 'returned'),
  ('Bucket C1', 'Delft Farm Partner',    DATE '2026-08-20', 30.0::numeric, TIMESTAMPTZ '2026-08-29 09:00:00+02', 19.0::numeric, 'returned'),
  ('Bucket B2', 'Athlone Skip',          DATE '2026-08-25', 16.5::numeric, TIMESTAMPTZ '2026-09-02 10:30:00+02', 10.0::numeric, 'returned'),
  ('Bucket A2', 'Cape Town Warehouse',   DATE '2026-09-01', 21.0::numeric, TIMESTAMPTZ '2026-09-09 09:15:00+02', 13.5::numeric, 'returned'),
  ('Bucket C2', 'Delft Farm Partner',    DATE '2026-09-03', 27.5::numeric, TIMESTAMPTZ '2026-09-11 08:30:00+02', 17.5::numeric, 'returned'),
  ('Bucket A1', 'Cape Town Warehouse',   DATE '2026-09-08', 19.0::numeric, TIMESTAMPTZ '2026-09-15 09:45:00+02', 12.0::numeric, 'returned'),
  ('Bucket B1', 'Athlone Skip',          DATE '2026-09-10', 23.0::numeric, TIMESTAMPTZ '2026-09-17 10:00:00+02', 14.5::numeric, 'returned'),
  ('Bucket D1', 'Cape Town Warehouse',   DATE '2026-09-12', 15.0::numeric, NULL,                                 NULL,           'out'),
  ('Bucket A3', 'Delft Farm Partner',    DATE '2026-09-15', 12.0::numeric, NULL,                                 NULL,           'out'),
  ('Bucket B3', 'Athlone Skip',          DATE '2026-09-17',  9.5::numeric, NULL,                                 NULL,           'out')
) AS seed(kit_label, location, date_out, kg_food_waste_collected, returned_at, kg_compost_returned, status)
WHERE NOT EXISTS (SELECT 1 FROM collection_kits);

COMMIT;

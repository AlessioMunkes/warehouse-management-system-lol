-- ─────────────────────────────────────────────────────────────
-- server/database/collection_kits_seed.sql
--
-- Feed the Soil kit tracking — schema + demo data.
--
-- THE LIFECYCLE THIS MODELS
--   1. A collection kit (a bucket) is ASSIGNED to a community member.
--      It stays with them — it is never "checked out" and "checked
--      in" the way an earlier version of this feature modelled it.
--   2. The owner fills it with food waste and brings it in, ideally
--      weekly, where the compost is weighed. That is one row in
--      collection_kit_records, status 'logged'. A kit can be logged
--      many times over its life — each visit is its own row.
--   3. Logged compost eventually travels to a farmer. Dispatch is a
--      manual action per record, independent of any others — there is
--      no data on which farmer received how much from which record to
--      model a batch/trip concept, so this deliberately doesn't invent
--      one.
--
-- A KIT'S STATUS ('assigned' / 'logged' / 'dispatched') IS NEVER
-- STORED — it is always the status of its most recent record, or
-- 'assigned' if it has none. See collectionKit.repository.js.
--
-- THIS REPLACES AN EARLIER, INCORRECT VERSION OF THIS SCRIPT.
-- An earlier pass modelled this as kits being "checked out" with food
-- waste and "returned" with compost, which had the real-world flow
-- backwards (kits are collected FROM the community, not sent out to
-- it) and had no owner/suburb concept at all. If you already ran that
-- version, DROP the old collection_kits table (it has none of the
-- columns this one does) before running this — see the DROP below,
-- commented out by default since there is no evidence this feature
-- has any real production data yet.
--
-- SAFE TO RUN AGAINST THE LIVE DATABASE.
--   - CREATE TABLE IF NOT EXISTS: a no-op if these tables already
--     exist in this shape.
--   - The seed INSERTs are guarded to run only if collection_kits is
--     currently EMPTY, so running this against a database that
--     already has real kit data adds nothing and changes nothing.
--   - logged_by is left NULL on every seed record rather than
--     guessing a real user id that may not exist in your database.
--   - Does not touch audit_log: these rows are seed data, not
--     app-driven changes, so there is nothing genuine to audit.
--
-- RUN IT
--   psql "$DATABASE_URL" -f server/database/collection_kits_seed.sql
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- Uncomment if you already ran the earlier out/returned version of
-- this script and need to replace it with the correct shape:
-- DROP TABLE IF EXISTS collection_kits CASCADE;

CREATE TABLE IF NOT EXISTS collection_kits (
  id            SERIAL        PRIMARY KEY,
  owner_name    VARCHAR(150)  NOT NULL,
  -- Suburb only, never a full address — the data-protection line the
  -- user drew: enough to route or map by, nothing that identifies a
  -- home.
  suburb        VARCHAR(150),
  assigned_at   DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_kit_records (
  id             SERIAL        PRIMARY KEY,
  kit_id         INTEGER       NOT NULL REFERENCES collection_kits(id),
  kg_compost     NUMERIC(10,3) NOT NULL CHECK (kg_compost >= 0),
  logged_at      DATE          NOT NULL DEFAULT CURRENT_DATE,
  status         VARCHAR(20)   NOT NULL DEFAULT 'logged'
                               CHECK (status IN ('logged', 'dispatched')),
  dispatched_at  TIMESTAMPTZ,
  notes          TEXT,
  logged_by      INTEGER       REFERENCES users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_kit_records_kit    ON collection_kit_records(kit_id);
CREATE INDEX IF NOT EXISTS idx_collection_kit_records_status ON collection_kit_records(status);

-- Demo data: six owners across a few suburbs, most with two or three
-- weigh-ins over August-September so both months have something to
-- show, a mix of logged (not yet dispatched — these should surface at
-- the top of the records list) and dispatched, and one owner with a
-- kit but no records yet (status 'assigned', the newly-signed-up
-- case).
INSERT INTO collection_kits (owner_name, suburb, assigned_at)
SELECT * FROM (VALUES
  ('Jane M.',    'Delft',      DATE '2026-07-20'),
  ('Thabo N.',   'Athlone',    DATE '2026-07-22'),
  ('Nomsa K.',   'Delft',      DATE '2026-08-01'),
  ('Pieter V.',  'Mitchells Plain', DATE '2026-08-05'),
  ('Ayesha P.',  'Athlone',    DATE '2026-08-12'),
  ('Sipho D.',   'Delft',      DATE '2026-09-15')
) AS seed(owner_name, suburb, assigned_at)
WHERE NOT EXISTS (SELECT 1 FROM collection_kits);

INSERT INTO collection_kit_records (kit_id, kg_compost, logged_at, status, dispatched_at)
SELECT k.id, v.kg_compost, v.logged_at, v.status,
       CASE WHEN v.status = 'dispatched' THEN (v.logged_at + 3)::timestamptz ELSE NULL END
  FROM collection_kits k
  JOIN (VALUES
    ('Jane M.',   4.5::numeric,  DATE '2026-08-01', 'dispatched'),
    ('Jane M.',   5.0::numeric,  DATE '2026-08-08', 'dispatched'),
    ('Jane M.',   3.5::numeric,  DATE '2026-09-05', 'logged'),
    ('Thabo N.',  6.0::numeric,  DATE '2026-08-02', 'dispatched'),
    ('Thabo N.',  5.5::numeric,  DATE '2026-09-01', 'logged'),
    ('Nomsa K.',  4.0::numeric,  DATE '2026-08-10', 'dispatched'),
    ('Nomsa K.',  4.5::numeric,  DATE '2026-08-24', 'dispatched'),
    ('Nomsa K.',  3.0::numeric,  DATE '2026-09-10', 'logged'),
    ('Pieter V.', 7.0::numeric,  DATE '2026-08-15', 'dispatched'),
    ('Ayesha P.', 5.5::numeric,  DATE '2026-08-20', 'logged'),
    ('Ayesha P.', 6.5::numeric,  DATE '2026-09-12', 'logged')
  ) AS v(owner_name, kg_compost, logged_at, status)
    ON v.owner_name = k.owner_name
 WHERE NOT EXISTS (SELECT 1 FROM collection_kit_records);
-- Sipho D. is left with no records — the "assigned, nothing logged
-- yet" case the status derivation needs to demonstrate.

COMMIT;

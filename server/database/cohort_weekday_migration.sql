-- ─────────────────────────────────────────────────────────────
-- server/database/cohort_weekday_migration.sql
--
-- Cohort model migration: the app has been running a fortnightly
-- week1/week2 rotation (picking.service.js's resolveActiveCohort),
-- but the real warehouse process runs weekly, keyed to a fixed pickup
-- day per centre — confirmed against an actual picking slip
-- ("Pickup Day: Tuesday", "Week Number: Week 25"), and this was in
-- fact the ORIGINAL Milestone 2 design before the live app diverged
-- from it (database.md's stale target schema already shows
-- `cohort IN ('tuesday','thursday')`).
--
-- This migrates the existing cohort_group enum and data onto that
-- model: week1 -> tuesday, week2 -> thursday. A straight 1:1 rename,
-- not a re-sort — every centre currently in week1 becomes a Tuesday
-- pickup, every centre in week2 becomes a Thursday pickup. If that
-- split doesn't actually match which centres are meant to collect on
-- which real day, that's a data-correction pass for afterward (per
-- centre, via the Beneficiaries page), not something this migration
-- can know.
--
-- SAFE TO RUN AGAINST THE LIVE DATABASE, though not fully idempotent
-- like most scripts in this folder — see the note above the UPDATE
-- statements below.
--
-- RUN IT IN TWO STEPS, not as one paste — PostgreSQL will not let a
-- freshly-added enum value be used in the same transaction/statement
-- batch it was added in on some versions:
--   1. Run the two ALTER TYPE lines below on their own, first.
--   2. Then run everything below them.
-- ─────────────────────────────────────────────────────────────

-- ── Step 1: add the new enum values (idempotent — a no-op if these
-- already exist, which is possible since database.md's original
-- design already called for them). Run this block alone first.
ALTER TYPE cohort_group ADD VALUE IF NOT EXISTS 'tuesday';
ALTER TYPE cohort_group ADD VALUE IF NOT EXISTS 'thursday';


-- ── Step 2: migrate existing data. Run this block second, in a
-- separate execution from step 1.
--
-- NOT IDEMPOTENT IN THE USUAL SENSE — running it twice is harmless
-- (a centre already moved to 'tuesday' has no rows left matching
-- 'week1', so the second run just updates zero rows), but it is a
-- real, one-way data change the first time it runs, not a pure
-- schema no-op like the ALTER TABLE scripts elsewhere in this folder.
UPDATE ecd_centres  SET cohort = 'tuesday'  WHERE cohort = 'week1';
UPDATE ecd_centres  SET cohort = 'thursday' WHERE cohort = 'week2';
UPDATE picking_slips SET cohort = 'tuesday'  WHERE cohort = 'week1';
UPDATE picking_slips SET cohort = 'thursday' WHERE cohort = 'week2';

-- picking_settings.cohort_anchor_monday becomes unused once the app
-- code stops reading it (this migration doesn't touch that row —
-- deliberately left in place rather than deleted, in case anything
-- outside this codebase still refers to it).

-- week1/week2 stay defined on the enum type itself (PostgreSQL has no
-- easy DROP VALUE), just unused by the app from here on — harmless.

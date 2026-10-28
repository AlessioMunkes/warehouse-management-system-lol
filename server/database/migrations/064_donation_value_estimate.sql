-- ─────────────────────────────────────────────────────────────
-- 064_donation_value_estimate.sql
--
-- A donation's value: estimated by the system, verified by a manager.
--
-- The person recording a donation often does not know what it is worth.
-- They can now ask the system to estimate it from the items (catalogue
-- unit cost times quantity), and the donation keeps that the value was
-- estimated rather than typed. A manager then verifies it, or corrects
-- it, before a Section 18A certificate goes out on it; the donation keeps
-- when that was and who.
--
-- Additive: one flag on pending donations (where it is recorded) and on
-- donations (where it is committed), with the verification beside it.
-- Existing rows are typed values, so the flag defaults to false.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pending_donations
  ADD COLUMN IF NOT EXISTS value_estimated boolean NOT NULL DEFAULT false;

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS value_estimated   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS value_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS value_verified_by integer REFERENCES users(id) ON DELETE SET NULL;

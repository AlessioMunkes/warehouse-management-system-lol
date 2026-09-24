-- ─────────────────────────────────────────────────────────────
-- server/database/picking_item_notes.sql
--
-- Per-line notes on a picking slip item — the real paper slip has a
-- "Comment" column against every line (not just flagged ones), for
-- things like a substitution ("swapped for maize meal, none in
-- stock") that aren't a shortage, so flag_reason doesn't cover them.
--
-- SAFE TO RUN AGAINST THE LIVE DATABASE.
--   - ADD COLUMN IF NOT EXISTS: a no-op if this has already run.
--   - Nothing existing is touched: every current row's packer_note is
--     simply NULL until a packer writes one.
--
-- RUN IT: paste this whole file into your SQL editor and run it.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE picking_slip_items
  ADD COLUMN IF NOT EXISTS packer_note TEXT;

-- ─────────────────────────────────────────────────────────────
-- server/database/picking_dual_assignment.sql
--
-- Dual packing assignment — sponsor change request: "Allow a packing
-- task/picking slip to be assigned to two staff members where
-- required, rather than only one person."
--
-- picking_slips.assigned_to stays exactly what it was — the primary
-- packer, assigned the normal way (POST /:id/assign). assigned_to_2
-- is new: an optional second packer, added once a primary already
-- holds the slip (POST /:id/assign-second) — see
-- picking.repository.js's addSecondPacker for why it requires a
-- primary first rather than letting either slot be filled first.
--
-- SAFE TO RUN AGAINST THE LIVE DATABASE.
--   - ADD COLUMN IF NOT EXISTS: a no-op if this has already run.
--   - Nothing existing is touched: every current row's assigned_to
--     is untouched, assigned_to_2 is simply NULL until someone is
--     added as a second packer.
--
-- RUN IT: paste this whole file into your SQL editor and run it.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE picking_slips
  ADD COLUMN IF NOT EXISTS assigned_to_2 INTEGER REFERENCES users(id);

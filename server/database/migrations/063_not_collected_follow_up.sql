-- ─────────────────────────────────────────────────────────────
-- 063_not_collected_follow_up.sql
--
-- Following up a centre that did not collect.
--
-- The not-collected cut-off marks a pallet nobody came for (dispatch
-- events, status 'not_collected'), and until now that was where it
-- stopped: nothing said whether anyone had been in touch with the
-- centre. A manager now follows it up from the slip (on WhatsApp, or by
-- phone) and the pallet keeps when that was and who did it, so the Not
-- collected tab shows which centres are still waiting to hear from us.
--
-- Additive: two nullable columns.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE dispatch_events
  ADD COLUMN IF NOT EXISTS followed_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS followed_up_by integer REFERENCES users(id) ON DELETE SET NULL;

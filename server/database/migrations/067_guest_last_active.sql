-- ─────────────────────────────────────────────────────────────
-- 067_guest_last_active.sql
--
-- When a guest volunteer last did something.
--
-- A guest's session lasted twelve hours from sign-in, and a visit
-- nobody signed out of stayed open, so it counted no hours at all. The
-- sponsor asked for a guest session to end after about four hours with
-- nothing done. The server now keeps when the guest last used the app;
-- after four idle hours the visit is signed out at that moment, the
-- session ends, and the hours on the impact report are the time the
-- guest was actually here.
--
-- Additive: one nullable column. An existing visit reads as last active
-- when it signed in.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE volunteers
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

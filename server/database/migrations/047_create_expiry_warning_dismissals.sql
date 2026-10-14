-- ─────────────────────────────────────────────────────────────
-- 047_create_expiry_warning_dismissals.sql
--
-- A manager dismissing an expiry warning that the stock estimate got wrong
-- (the estimate assumes oldest-received stock goes out first). One row per
-- dismissal of a delivery line; a restore is recorded on the same row so
-- the history stays. Additive only: one new table and one index.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expiry_warning_dismissals (
  id                    SERIAL PRIMARY KEY,
  delivery_note_item_id INTEGER     NOT NULL REFERENCES delivery_note_items(id),
  reason                TEXT        NOT NULL CHECK (length(btrim(reason)) > 0),
  dismissed_by          INTEGER     NOT NULL REFERENCES users(id),
  dismissed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  restored_by           INTEGER     REFERENCES users(id),
  restored_at           TIMESTAMPTZ,
  CONSTRAINT expiry_dismissal_restore_pair
    CHECK ((restored_by IS NULL) = (restored_at IS NULL))
);

-- At most one active dismissal per delivery line.
CREATE UNIQUE INDEX IF NOT EXISTS expiry_warning_dismissals_one_active
  ON expiry_warning_dismissals (delivery_note_item_id)
  WHERE restored_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 034_create_operating_closures.sql
--
-- The operating calendar's closed days: public holidays and other
-- closures (stocktake, a shutdown week). One row per date. Collection
-- reminders are not sent for a closed collection day, and the
-- non-collection sweep does not write off pallets due on one.
--
-- Which weekday each cohort collects on is not here: it is two
-- app_settings keys (calendar.tuesdayCohortWeekday,
-- calendar.thursdayCohortWeekday), defaulting to Tuesday and Thursday.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operating_closures (
  id          SERIAL PRIMARY KEY,
  closed_on   DATE NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN ('public_holiday', 'closure')),
  label       TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

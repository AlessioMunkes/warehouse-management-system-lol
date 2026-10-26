-- ─────────────────────────────────────────────────────────────
-- 062_saved_report_narrative.sql
--
-- The written report kept with a saved report.
--
-- "Generate report" under an Operations chart has the AI write about
-- the chart: what it shows, the business view, what to follow up. Until
-- now a saved report kept only the chart's settings, so that writing was
-- lost and had to be generated again. It is now kept with the saved
-- report, with when it was written and the dates it was written about,
-- because the saved report itself runs over a moving period ("the last
-- three months") and the writing describes the period it was made for.
--
-- Additive: three nullable columns.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE saved_reports
  ADD COLUMN IF NOT EXISTS narrative       jsonb,
  ADD COLUMN IF NOT EXISTS narrative_at    timestamptz,
  ADD COLUMN IF NOT EXISTS narrative_range jsonb;

-- ─────────────────────────────────────────────────────────────
-- server/database/reporting_factors_seed.sql
--
-- Starting values for the two conversion factors added alongside
-- dignity_kitchen_served and community_served (reportCatalog.js).
-- Without a row here, both cards on the Impact Calculator show
-- "needs the <factor> factor, which has not been set up yet." instead
-- of a number — this is the same situation kg_to_meals and
-- kg_to_adults_served were in before someone first set them through
-- the "Adjust factors" dialog on the Impact Calculator page.
--
-- THE VALUES BELOW ARE PLACEHOLDER GUESSES, NOT MEASURED FACTORS.
-- 2.5 "people served per kilogram dispatched" mirrors the ballpark
-- food-redistribution organisations commonly use for kg_to_meals —
-- it exists so the two new cards show a plausible number instead of
-- an error, not because it is this org's real ratio. Replace it any
-- time through Impact Calculator -> Adjust factors -> the two new
-- fields; that inserts a new row effective from today and leaves this
-- seed row as history, exactly how a real factor revision works (see
-- reportingFactor.repository.js's own APPEND-ONLY note).
--
-- SAFE TO RUN AGAINST THE LIVE DATABASE.
-- Each INSERT is guarded to run only if that specific factor_key has
-- no row yet, so running this after a real value has already been
-- set (by this script or by the UI) adds nothing and changes nothing.
--
-- RUN IT
--   psql "$DATABASE_URL" -f server/database/reporting_factors_seed.sql
-- ─────────────────────────────────────────────────────────────

BEGIN;

INSERT INTO reporting_factors (factor_key, value, unit, source_note, effective_from)
SELECT 'kg_to_dignity_kitchen_served', 2.5, 'people per kg',
       'Placeholder seed value — replace via Adjust factors once the org has a real figure.',
       CURRENT_DATE
 WHERE NOT EXISTS (SELECT 1 FROM reporting_factors WHERE factor_key = 'kg_to_dignity_kitchen_served');

INSERT INTO reporting_factors (factor_key, value, unit, source_note, effective_from)
SELECT 'kg_to_community_served', 2.5, 'people per kg',
       'Placeholder seed value — replace via Adjust factors once the org has a real figure.',
       CURRENT_DATE
 WHERE NOT EXISTS (SELECT 1 FROM reporting_factors WHERE factor_key = 'kg_to_community_served');

COMMIT;

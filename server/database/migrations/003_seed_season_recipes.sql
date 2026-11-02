-- ─────────────────────────────────────────────────────────────
-- 003_seed_season_recipes.sql
--
-- The two season recipes every warehouse needs: Summer (from 1
-- September) and Winter (from 1 May). They start with no product lines;
-- an admin fills them in under Settings → Recipes, and until then slips
-- come from each centre's standing order.
--
-- Without these rows a new warehouse could not use Settings → Recipes
-- and scripts/loadRealData.mjs stopped with "This system has no Summer
-- recipe" (Milestone 4 test TC-19, defect D2).
--
-- Safe on a warehouse that already has them: one recipe per season is
-- enforced by recipes_one_per_season, and ON CONFLICT DO NOTHING skips
-- one that exists (its dates and lines are left as they are).
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.recipes (name, kind, season_start_month, season_start_day)
VALUES ('Summer', 'summer', 9, 1),
       ('Winter', 'winter', 5, 1)
ON CONFLICT DO NOTHING;

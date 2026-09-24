-- ─────────────────────────────────────────────────────────────
-- server/database/quantity_per_meal_columns.sql
--
-- "Meals to serve" quantity calculator on Create Slip: how much of
-- each product one meal/beneficiary needs, so a manager can type a
-- headcount and get quantities calculated instead of typing every
-- line by hand.
--
-- The seed values below are NOT an official recipe — they're the
-- per-beneficiary ratio actually observed in the real Western Cape
-- supply sheet (server/scripts/data/westernCapeSupply.json): total
-- quantity of each product across all 194 centres, divided by total
-- beneficiaries. Every product held a near-constant ratio across
-- every centre, which is what suggested this calculator in the first
-- place — but "near-constant in one region's sheet" isn't the same as
-- "the confirmed recipe," so treat these as a working default to
-- correct once a real one exists, not a final number.
--
-- SAFE TO RUN AGAINST THE LIVE DATABASE.
--   - ADD COLUMN IF NOT EXISTS: a no-op if this has already run.
--   - The UPDATE only touches products matching these exact names —
--     anything already set (by a previous run, or by hand) is
--     overwritten with the same computed value, so re-running is
--     harmless either way.
--   - A product not in this list (or not yet in the catalogue) keeps
--     quantity_per_meal NULL — the calculator simply leaves that line
--     at 0 rather than guessing.
--
-- RUN IT: paste this whole file into your SQL editor and run it.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS quantity_per_meal NUMERIC;

UPDATE products SET quantity_per_meal = 0.1660 WHERE name = 'Baked Beans';
UPDATE products SET quantity_per_meal = 0.1660 WHERE name = 'Pilchards';
UPDATE products SET quantity_per_meal = 0.0352 WHERE name = 'Butternut';
UPDATE products SET quantity_per_meal = 0.1232 WHERE name = 'Cabbage';
UPDATE products SET quantity_per_meal = 0.0300 WHERE name = 'Carrots';
UPDATE products SET quantity_per_meal = 0.0150 WHERE name = 'Leeks';
UPDATE products SET quantity_per_meal = 0.0432 WHERE name = 'Lentils';
UPDATE products SET quantity_per_meal = 0.1867 WHERE name = 'Maize Meal';
UPDATE products SET quantity_per_meal = 0.1431 WHERE name = 'Oats';
UPDATE products SET quantity_per_meal = 0.0432 WHERE name = 'Onions';
UPDATE products SET quantity_per_meal = 0.1633 WHERE name = 'Rice';
UPDATE products SET quantity_per_meal = 0.0830 WHERE name = 'Samp';
UPDATE products SET quantity_per_meal = 0.0271 WHERE name = 'Soya Mince';
UPDATE products SET quantity_per_meal = 0.0150 WHERE name = 'Spinach';
UPDATE products SET quantity_per_meal = 0.0096 WHERE name = 'Spring Onion';
UPDATE products SET quantity_per_meal = 0.0220 WHERE name = 'Tomatoes';
UPDATE products SET quantity_per_meal = 0.1488 WHERE name = 'Potatoes';
UPDATE products SET quantity_per_meal = 0.0072 WHERE name = 'Salt';
UPDATE products SET quantity_per_meal = 0.1059 WHERE name = 'Sugar';
UPDATE products SET quantity_per_meal = 0.0010 WHERE name = 'Spices (Misc)';
UPDATE products SET quantity_per_meal = 0.0149 WHERE name = 'Cooking Oil';

-- ─────────────────────────────────────────────────────────────
-- 038_create_recipes.sql
--
-- Recipes: what a picking slip is made from. A recipe says how much of
-- each product ONE CHILD gets per week; a centre's slip multiplies that
-- by its child count.
--
-- There is always one summer recipe and one winter recipe. Each carries
-- the day of the year its season starts (season_start_month / _day); a
-- date falls in whichever season started most recently. An admin can add
-- override recipes, each with a date range, and inside that range an
-- override replaces the season's recipe.
--
-- A centre listed in recipe_own_order_centres keeps its standing order
-- (ecd_order_lines) and ignores the recipe. Slip generation also falls
-- back to the standing order while a recipe has no lines, so nothing
-- changes until a recipe is filled in.
--
-- Additive only: three new tables and two seed rows.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  kind               TEXT NOT NULL CHECK (kind IN ('summer', 'winter', 'override')),
  season_start_month SMALLINT CHECK (season_start_month BETWEEN 1 AND 12),
  season_start_day   SMALLINT CHECK (season_start_day BETWEEN 1 AND 31),
  starts_on          DATE,
  ends_on            DATE,
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recipes_shape_check CHECK (
    (kind = 'override'
      AND starts_on IS NOT NULL AND ends_on IS NOT NULL AND ends_on >= starts_on
      AND season_start_month IS NULL AND season_start_day IS NULL)
    OR
    (kind <> 'override'
      AND starts_on IS NULL AND ends_on IS NULL
      AND season_start_month IS NOT NULL AND season_start_day IS NOT NULL)
  )
);

-- One summer recipe and one winter recipe, never two.
CREATE UNIQUE INDEX IF NOT EXISTS recipes_one_per_season
  ON recipes (kind) WHERE kind IN ('summer', 'winter');

CREATE TABLE IF NOT EXISTS recipe_lines (
  id                 SERIAL PRIMARY KEY,
  recipe_id          INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id         INTEGER NOT NULL REFERENCES products(id),
  quantity_per_child NUMERIC NOT NULL CHECK (quantity_per_child > 0),
  unit               VARCHAR NOT NULL,
  CONSTRAINT recipe_lines_one_per_product UNIQUE (recipe_id, product_id)
);

CREATE TABLE IF NOT EXISTS recipe_own_order_centres (
  ecd_id    INTEGER PRIMARY KEY REFERENCES ecd_centres(id) ON DELETE CASCADE,
  added_by  INTEGER REFERENCES users(id),
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Summer from 1 September, winter from 1 May, until an admin says otherwise.
INSERT INTO recipes (name, kind, season_start_month, season_start_day)
VALUES ('Summer', 'summer', 9, 1), ('Winter', 'winter', 5, 1)
ON CONFLICT DO NOTHING;

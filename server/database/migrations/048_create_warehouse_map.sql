-- ─────────────────────────────────────────────────────────────
-- 048_create_warehouse_map.sql
--
-- The warehouse map: where stock is kept, drawn on a grid.
--
-- warehouse_areas
--   One rectangle on the floor plan an admin draws: a dry store, a cold
--   room, a floor area for pallets, or a door. Positions and sizes are
--   in grid cells (constants/warehouseMap.js holds the grid's size).
--   `levels` is how tall it is drawn in the 3D view (shelves high).
--   An area taken off the plan is made inactive, not deleted, so the
--   counts recorded against it keep their history; its stock shows as
--   not placed again.
--
-- warehouse_area_counts
--   What a manager saw in an area: one row per product per count. The
--   newest row for an area and product is what the map shows. A count
--   is a record, never a stock movement: it does not change
--   stock_levels, and nothing on the floor waits for it. A difference
--   from what is on hand is shown so the manager can adjust stock.
--   on_hand_at_count is the balance when the count was saved, so the
--   difference at that moment stays on record.
--
-- Each warehouse database holds its own plan: there is no warehouse
-- column, the database is the warehouse (config/dbRouter.js).
--
-- Additive only: two new tables and their indexes.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_areas (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  kind        TEXT        NOT NULL CHECK (kind IN ('dry', 'cold', 'floor', 'door')),
  grid_x      SMALLINT    NOT NULL CHECK (grid_x >= 0),
  grid_y      SMALLINT    NOT NULL CHECK (grid_y >= 0),
  grid_w      SMALLINT    NOT NULL CHECK (grid_w >= 1),
  grid_h      SMALLINT    NOT NULL CHECK (grid_h >= 1),
  levels      SMALLINT    NOT NULL DEFAULT 1 CHECK (levels BETWEEN 1 AND 4),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_by  INTEGER     REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  INTEGER     REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two areas on the plan never share a name.
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_areas_active_name
  ON warehouse_areas (lower(btrim(name))) WHERE is_active;

CREATE TABLE IF NOT EXISTS warehouse_area_counts (
  id                SERIAL PRIMARY KEY,
  area_id           INTEGER     NOT NULL REFERENCES warehouse_areas(id),
  product_id        INTEGER     NOT NULL REFERENCES products(id),
  quantity          NUMERIC     NOT NULL CHECK (quantity >= 0),
  unit              VARCHAR(20) NOT NULL,
  on_hand_at_count  NUMERIC     NOT NULL,
  counted_by        INTEGER     REFERENCES users(id),
  counted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The newest count per area and product.
CREATE INDEX IF NOT EXISTS warehouse_area_counts_latest
  ON warehouse_area_counts (area_id, product_id, counted_at DESC, id DESC);

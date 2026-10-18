-- ─────────────────────────────────────────────────────────────
-- 041_create_photos.sql
--
-- A photo a worker takes on the floor: of an item they flagged while
-- packing (short, damaged, substituted), or of a delivery as it arrived.
--
-- entity_type + entity_id say what the photo is of:
--   picking_slip_item  -> picking_slip_items.id
--   purchase_order     -> purchase_orders.id
-- Not a foreign key, on purpose: one table serves both, and a photo is
-- evidence that should outlive an edited slip line.
--
-- THE PICTURE IS IN THE ROW (data). The phone shrinks it first to about
-- 1280 pixels and compresses it, so each is roughly 150 KB; the server
-- refuses anything over 400 KB. That keeps this workable inside the
-- database, but the database allowance is small: a few thousand photos.
-- When that is no longer enough, move `data` to Supabase file storage
-- and keep the rest of the row (see photo.repository.js).
--
-- Additive only: one new table.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photos (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('picking_slip_item', 'purchase_order')),
  entity_id    INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/webp', 'image/png')),
  byte_size    INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 409600),
  data         BYTEA NOT NULL,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS photos_entity_idx ON photos (entity_type, entity_id);

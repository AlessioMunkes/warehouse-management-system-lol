-- ─────────────────────────────────────────────────────────────
-- 053_create_barcode_scan_events.sql
--
-- What each barcode scan on the floor turned out to be, so reporting
-- can say what scanning catches ("wrong items caught by scanning").
--
--   screen        where it was scanned:
--                   receiving, donation, packing, stock_count
--   outcome       what the scan was:
--                   counted        matched a line and counted
--                   not_on_list    a real product, but not one this
--                                  order, pallet or list wants: the
--                                  wrong item, caught
--                   already_done   that line was already packed
--                   unknown        a code no product has yet
--                   linked         an unknown code linked on the spot
--                   misread        not a barcode that can be read
--   product_id    the product the code named, when it named one
--   reference_id  the order, pallet or area it was scanned against,
--                 read with `screen` (a purchase order on receiving, a
--                 picking slip on packing, a warehouse area on a count)
--
-- A record of a scan, never of stock: nothing here changes a balance,
-- and a scan made without signal is not recorded at all (the client
-- drops it rather than queueing it), so the counts are a floor, not a
-- census.
--
-- Additive only: one new table and an index.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS barcode_scan_events (
  id            SERIAL PRIMARY KEY,
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  screen        VARCHAR(20) NOT NULL
                CHECK (screen IN ('receiving', 'donation', 'packing', 'stock_count')),
  outcome       VARCHAR(20) NOT NULL
                CHECK (outcome IN ('counted', 'not_on_list', 'already_done', 'unknown', 'linked', 'misread')),
  product_id    INTEGER REFERENCES products(id),
  reference_id  INTEGER,
  user_id       INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS barcode_scan_events_scanned_at_idx ON barcode_scan_events (scanned_at);

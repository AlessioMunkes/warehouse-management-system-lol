-- Benevolent requests: the products a manager approves, and the
-- bookkeeping around approval and the "needs new items" flag.
--
-- community_request_items
--   One row per product on an approved request. quantity_approved is
--   what the manager set aside; quantity_released is what the worker
--   confirmed went out (0 until then; never more than approved).
--   short_at is set on a line when stock for that product dropped below
--   what pallets and other requests need: the line stops reserving
--   stock and the request is flagged. Choosing other items clears it.
--
-- community_requests
--   approved_by / approved_at   who approved it and when. The most
--                               recently approved request is flagged
--                               first when stock runs short.
--   assigned_to                 the packer a manager picked, if any.
--   items_short_at              set while any line is short. This is
--                               also what stops a second notification
--                               for the same request.
--
-- Existing rows are untouched: no backfill, no data changes.
--
-- No BEGIN/COMMIT (the runner wraps the file). Idempotent: safe to run
-- more than once.

CREATE TABLE IF NOT EXISTS community_request_items (
  id                 SERIAL PRIMARY KEY,
  request_id         INTEGER NOT NULL REFERENCES community_requests(id) ON DELETE CASCADE,
  product_id         INTEGER NOT NULL REFERENCES products(id),
  unit               VARCHAR(20) NOT NULL,
  quantity_approved  NUMERIC NOT NULL CHECK (quantity_approved > 0),
  quantity_released  NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_released >= 0),
  short_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_request_items_request_product_key UNIQUE (request_id, product_id),
  CONSTRAINT community_request_items_released_le_approved CHECK (quantity_released <= quantity_approved)
);

-- The committed-stock sum groups by product.
CREATE INDEX IF NOT EXISTS idx_community_request_items_product
  ON community_request_items (product_id);

ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS approved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;
ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE community_requests
  ADD COLUMN IF NOT EXISTS items_short_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- server/database/cleanup_test_supplier.sql
--
-- Removes a supplier literally named "test" that leaked into the real
-- suppliers table — shows up in every supplier picker across the app,
-- including Receiving's "Who it came from" (both Guided and Form).
--
-- Archived the same way the app's own "deactivate supplier" action
-- does (supplier.repository.js's archiveSupplier) — is_active = false,
-- deactivated_at, archived_at — rather than a hard DELETE.
-- purchase_orders.supplier_id and delivery_notes.supplier_id are both
-- ON DELETE RESTRICT, so a hard delete would simply fail the moment
-- this row has ever been used on an order; archiving is the only
-- removal path suppliers actually have, and it's reversible.
--
-- Run the SELECT first to see exactly what this will affect. If that
-- list looks right, run the UPDATE below it.
-- ─────────────────────────────────────────────────────────────

-- Preview
SELECT id, name, category, created_at
  FROM suppliers
 WHERE lower(name) = 'test'
   AND archived_at IS NULL;

-- Archive
UPDATE suppliers
   SET is_active      = false,
       deactivated_at = COALESCE(deactivated_at, now()),
       archived_at    = COALESCE(archived_at, now())
 WHERE lower(name) = 'test'
   AND archived_at IS NULL;

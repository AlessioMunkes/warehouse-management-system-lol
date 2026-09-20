-- ─────────────────────────────────────────────────────────────
-- server/database/cleanup_access_check_products.sql
--
-- Removes verification/QA product rows that leaked into the real
-- products table — "Access Check Resolved access-check-<timestamp>"
-- entries. They show up in every product picker across the app,
-- including the decanting product dropdown, because nothing marks
-- them as different from a real product.
--
-- Soft-deletes them the same way the app's own Archive action does
-- (product.repository.js's archiveProduct) — is_active = false plus
-- archived_at — rather than a hard DELETE. A hard delete risks a
-- foreign-key failure if any of these rows picked up a stock
-- movement or order line during testing; archiving is the
-- established, reversible way this codebase removes a product from
-- every picker (decanting, receiving, PO lines, the manifest, intake
-- search) without touching any of those queries.
--
-- Run the SELECT first to see exactly what this will affect. If that
-- list looks right, run the UPDATE below it.
-- ─────────────────────────────────────────────────────────────

-- Preview
SELECT id, name, stock_keeping_unit, created_at
  FROM products
 WHERE name ILIKE 'Access Check Resolved%'
   AND archived_at IS NULL
 ORDER BY created_at;

-- Archive
UPDATE products
   SET is_active   = false,
       archived_at = COALESCE(archived_at, now())
 WHERE name ILIKE 'Access Check Resolved%'
   AND archived_at IS NULL;

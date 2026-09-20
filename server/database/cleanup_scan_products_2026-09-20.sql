-- ─────────────────────────────────────────────────────────────
-- server/database/cleanup_scan_products_2026-09-20.sql
--
-- The 6 product rows scan_test_data.sql turned up on 2026-09-20:
-- one "Test Product <timestamp>", four "Access check item L1/L2
-- access-check-<timestamp>" (a different name prefix than
-- cleanup_access_check_products.sql's "Access Check Resolved%", so
-- that script never caught these), and one "test rename".
--
-- Matched by id rather than a name pattern — these are the exact rows
-- already confirmed from the scan, so there's nothing to guess at
-- here the way scan_test_data.sql's broader patterns still need a
-- human to look at.
--
-- Archived the same way product.repository.js's archiveProduct does
-- (is_active = false, archived_at) — not a hard DELETE, for the same
-- foreign-key reason as the other two cleanup scripts: any of these
-- may have picked up a stock movement or order line during whatever
-- testing created them.
-- ─────────────────────────────────────────────────────────────

-- Preview
SELECT id, name, created_at
  FROM products
 WHERE id IN (17, 479, 480, 482, 483, 1114)
   AND archived_at IS NULL
 ORDER BY id;

-- Archive
UPDATE products
   SET is_active   = false,
       archived_at = COALESCE(archived_at, now())
 WHERE id IN (17, 479, 480, 482, 483, 1114)
   AND archived_at IS NULL;

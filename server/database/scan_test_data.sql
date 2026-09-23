-- ─────────────────────────────────────────────────────────────
-- server/database/scan_test_data.sql
--
-- SELECT-ONLY. This session has no live database connection, so
-- unlike cleanup_access_check_products.sql and
-- cleanup_test_supplier.sql — both written against a specific row
-- reported in a screenshot — this one isn't targeting a confirmed
-- row. It's a scan across the three "picker directory" tables that
-- surface in dropdowns/tap-lists across the app (suppliers, products,
-- ecd_centres/beneficiaries), looking for common QA/placeholder
-- naming patterns, so you can see what's actually there before
-- anything gets archived.
--
-- Run this, then tell me which rows in the results are genuinely junk
-- (vs. a real supplier/product/centre that happens to match a
-- pattern) — I'll turn those into the same kind of targeted, reviewed
-- archive statement as the other two scripts rather than guessing.
-- ─────────────────────────────────────────────────────────────

SELECT 'suppliers' AS table_name, id, name, created_at
  FROM suppliers
 WHERE archived_at IS NULL
   AND (name ILIKE 'test%' OR name ILIKE 'qa%' OR name ILIKE 'demo%'
        OR name ILIKE 'asdf%' OR name ILIKE 'xxx%' OR name ILIKE '%example%')

UNION ALL

SELECT 'products', id, name, created_at
  FROM products
 WHERE archived_at IS NULL
   AND (name ILIKE 'test%' OR name ILIKE 'qa%' OR name ILIKE 'demo%'
        OR name ILIKE 'asdf%' OR name ILIKE 'xxx%' OR name ILIKE '%example%'
        OR name ILIKE 'access check%')

UNION ALL

SELECT 'ecd_centres', id, name, created_at
  FROM ecd_centres
 WHERE (name ILIKE 'test%' OR name ILIKE 'qa%' OR name ILIKE 'demo%'
        OR name ILIKE 'asdf%' OR name ILIKE 'xxx%' OR name ILIKE '%example%')

ORDER BY table_name, created_at;

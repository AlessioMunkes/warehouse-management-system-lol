-- ─────────────────────────────────────────────────────────────
-- docs/samples/undo-demo-quickbooks-links.sql
--
-- Removes ONLY the QuickBooks links made by the demo file
-- quickbooks-po-export-sample.csv. Read it, then run it yourself.
-- Nothing here is run by the app.
--
-- WHY IT CANNOT HIT REAL LINKS
-- A row is deleted only if ALL of these are true:
--   - it is a purchase order link in quickbooks_object_map
--   - the PO number is one of PO-2026-0101 .. PO-2026-0106
--   - the QuickBooks number starts with DEMO-  (the demo file's Num
--     column; no real QuickBooks number does)
-- A real link on any of those POs (a number that does not start with
-- DEMO-) is left alone and shows up in step 1 so you can see it.
--
-- AUDIT ROWS ARE NOT TOUCHED
-- The audit_log is an append-only record. The demo links, and this
-- undo, stay in it as what happened. Nothing below writes to or
-- deletes from audit_log.
--
-- Before the demo, run section 0 and keep the numbers.
-- ─────────────────────────────────────────────────────────────

-- 0. BEFORE THE DEMO: snapshot (read-only). Save these three results.
SELECT now()                                         AS demo_started_at;   -- note this time
SELECT count(*)                                      AS links_before     FROM quickbooks_object_map;
SELECT count(*)                                      AS audit_rows_before FROM audit_log;


-- 1. AFTER THE DEMO: what would be deleted (read-only). Expect up to
--    3 rows: 0101, 0102, 0103. Anything else listed here is a surprise:
--    stop and look before going on.
SELECT po.po_number, q.qbo_id
  FROM quickbooks_object_map q
  JOIN purchase_orders po ON po.id = q.entity_id
 WHERE q.entity_type     = 'purchase_order'
   AND q.qbo_object_type = 'PurchaseOrder'
   AND po.po_number IN ('PO-2026-0101', 'PO-2026-0102', 'PO-2026-0103',
                        'PO-2026-0104', 'PO-2026-0105', 'PO-2026-0106')
 ORDER BY po.po_number;


-- 2. Delete exactly the demo links. Run as one block. RETURNING shows
--    what went. If the rows are not the ones from step 1, run
--    ROLLBACK; instead of COMMIT;
BEGIN;

DELETE FROM quickbooks_object_map q
 USING purchase_orders po
 WHERE po.id = q.entity_id
   AND q.entity_type     = 'purchase_order'
   AND q.qbo_object_type = 'PurchaseOrder'
   AND po.po_number IN ('PO-2026-0101', 'PO-2026-0102', 'PO-2026-0103',
                        'PO-2026-0104', 'PO-2026-0105', 'PO-2026-0106')
   AND q.qbo_id LIKE 'DEMO-%'
RETURNING po.po_number, q.qbo_id;

COMMIT;


-- 3. CHECK NOTHING ELSE WAS TOUCHED (all read-only)

-- 3a. No demo links left. Expect 0.
SELECT count(*) AS demo_links_left
  FROM quickbooks_object_map WHERE qbo_id LIKE 'DEMO-%';

-- 3b. Total links is back to the number from step 0. Expect links_before.
SELECT count(*) AS links_now FROM quickbooks_object_map;

-- 3c. The only thing the demo wrote to the audit log is
--     quickbooks_ref_set rows on those six POs. Replace the time with
--     demo_started_at from step 0. Expect exactly one action, and
--     only these PO numbers.
SELECT a.action, count(*) AS rows, min(a.reason) AS reason
  FROM audit_log a
 WHERE a.created_at >= TIMESTAMPTZ '2026-10-05 00:00:00+02'   -- <- edit: demo_started_at
 GROUP BY a.action;

SELECT DISTINCT po.po_number
  FROM audit_log a
  JOIN purchase_orders po ON po.id::text = a.entity_id
 WHERE a.action = 'quickbooks_ref_set'
   AND a.created_at >= TIMESTAMPTZ '2026-10-05 00:00:00+02'   -- <- edit: demo_started_at
 ORDER BY 1;

-- 3d. The import never edits a purchase order. Nothing on these six
--     POs should have changed status or notes during the demo window.
--     (Compare with what you saw before; the import has no code path
--     that writes to purchase_orders.)
SELECT po_number, status, status_changed_at
  FROM purchase_orders
 WHERE po_number IN ('PO-2026-0101', 'PO-2026-0102', 'PO-2026-0103',
                     'PO-2026-0104', 'PO-2026-0105', 'PO-2026-0106')
 ORDER BY po_number;

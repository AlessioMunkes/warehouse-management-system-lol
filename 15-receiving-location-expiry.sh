#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 15-receiving-location-expiry.sh
#
# D4 — the receiving screen has always collected a put-away location
# per line and a use-by date for perishables. receivingAPI.js
# documents both as part of the contract. delivery_note_items stored
# neither, and a grep for expiry across all of server/src returned
# nothing but JWT and cache TTLs.
#
# Consequences as the branch stands:
#   BR-06 (FEFO for fresh produce) cannot be satisfied — there is no
#         date anywhere to sort by.
#   BR-07 (a receiving task closes only once a storage location is
#         assigned to every item) is not satisfied — the location is
#         captured on screen and discarded on submit.
#
# Both are asserted as implemented in the URS.
#
# Scope of this script: persist what the UI already sends, and
# validate it. Per-batch stock so that picking genuinely allocates
# first-expiry-first-out is a separate, larger change and is NOT
# done here.
#
# ── THIS SCRIPT NEEDS A MIGRATION RUN ────────────────────────
# It writes server/database/migrations/018_add_receiving_location_
# and_expiry.sql but does not execute it. Run that against the
# database before deploying the server changes, or POST /api/deliveries
# will 500 on the new columns.
#
# Point DATABASE_URL at a scratch Supabase branch first. The `main`
# branch is tagged PRODUCTION and integration suites have been run
# against it before.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ ! -f server/src/repositories/delivery.repository.js ] || [ ! -d client/src ]; then
  echo "ERROR: run this from the repository root (the folder containing client/ and server/)." >&2
  exit 1
fi

mkdir -p server/database/migrations

python3 - <<'PYEOF'
import os, sys

CHANGES = 0
FAILED  = []

def _read(p):
    with open(p, 'rb') as f:
        b = f.read()
    return b.decode('utf-8').replace('\r\n', '\n'), (b'\r\n' in b)

def _write(p, s, crlf):
    with open(p, 'wb') as f:
        f.write((s.replace('\n', '\r\n') if crlf else s).encode('utf-8'))

def patch(path, old, new, label):
    global CHANGES
    if not os.path.exists(path):
        FAILED.append("%s: file not found (%s)" % (label, path)); return
    s, crlf = _read(path)
    if new in s:
        print("  = %s (already applied)" % label); return
    if old not in s:
        FAILED.append("%s: anchor not found in %s" % (label, path)); return
    n = s.count(old)
    if n != 1:
        FAILED.append("%s: anchor appears %d times in %s (expected 1)" % (label, n, path)); return
    _write(path, s.replace(old, new, 1), crlf)
    CHANGES += 1
    print("  + %s" % label)

def write_file(path, body, label):
    global CHANGES
    if os.path.exists(path):
        cur, _ = _read(path)
        if cur == body:
            print("  = %s (already written)" % label); return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    _write(path, body, False)
    CHANGES += 1
    print("  + %s" % label)

MIGRATION  = 'server/database/migrations/018_add_receiving_location_and_expiry.sql'
CONSTANTS  = 'server/src/constants/storageAreas.js'
CATALOG    = 'server/src/features/reporting/reportCatalog.js'
REPO_DELIV = 'server/src/repositories/delivery.repository.js'
SVC_DELIV  = 'server/src/services/delivery.service.js'
TEST_DELIV = 'server/__tests__/delivery.service.test.js'
DB_DOC     = 'database.md'

# ── 1. Migration ──────────────────────────────────────────────
print("1  migration")

write_file(MIGRATION, """-- 018_add_receiving_location_and_expiry.sql
--
-- delivery_note_items gains the two fields the receiving screen has
-- been collecting since it was written and the server has been
-- discarding on every submit.
--
--   storage_area  BR-07 — a receiving task closes only once a storage
--                 location is assigned to every item. ReceivingFlow.jsx
--                 sends one of the LOCATIONS slugs per line.
--   expiry_date   BR-06 — FEFO needs something to sort on. Only lines
--                 whose product is_perishable carry one.
--
-- storage_area is the slug, not a foreign key to storage_locations.
-- That table's `area` column holds prose names ('Cold Storage',
-- 'Intake Holding Area' — see donation.repository.getLocationIdForArea)
-- while the receiving screen and reportCatalog.STORAGE_AREAS both
-- speak in slugs. Storing the slug keeps this column consistent with
-- the vocabulary the rest of the application already uses; an FK can
-- be added later once storage_locations has been reconciled.
--
-- Idempotent — safe to run more than once.

ALTER TABLE delivery_note_items
  ADD COLUMN IF NOT EXISTS storage_area VARCHAR(50);

ALTER TABLE delivery_note_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Added separately from the column so a re-run doesn't trip over an
-- existing constraint of the same name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.delivery_note_items'::regclass
      AND conname  = 'delivery_note_items_storage_area_check'
  ) THEN
    ALTER TABLE delivery_note_items
      ADD CONSTRAINT delivery_note_items_storage_area_check
      CHECK (storage_area IS NULL OR storage_area IN
        ('cold_room', 'dry_store', 'fts_section', 'mezzanine', 'boardroom'));
  END IF;
END $$;

-- Partial index: the FEFO question is only ever asked of dated rows.
CREATE INDEX IF NOT EXISTS idx_delivery_note_items_expiry
  ON delivery_note_items (expiry_date)
  WHERE expiry_date IS NOT NULL;
""", "write migration 018")

# ── 2. Storage areas as a shared constant ─────────────────────
print("2  storage area vocabulary")

write_file(CONSTANTS, """// ─────────────────────────────────────────────────────────────
// server/src/constants/storageAreas.js
//
// The storage-area vocabulary, in one place.
//
// These are the slugs ReceivingFlow.jsx's LOCATIONS list sends, the
// values donation_category_routing.storage_area holds, and the values
// delivery_note_items.storage_area is constrained to by migration 018.
//
// It lives here rather than in reportCatalog.js because the delivery
// service needs it too, and a service importing from the reporting
// feature to validate a receipt is the wrong direction. reportCatalog
// re-exports from here so there is still exactly one list — the same
// reasoning as purchaseOrderStatus.js, and for the same reason:
// movement_type drifted once because two modules each kept their own
// copy.
// ─────────────────────────────────────────────────────────────

export const STORAGE_AREAS = [
  'cold_room',
  'dry_store',
  'fts_section',
  'mezzanine',
  'boardroom',
];

export const isStorageArea = (value) =>
  STORAGE_AREAS.includes(String(value || '').trim());

export default { STORAGE_AREAS, isStorageArea };
""", "add constants/storageAreas.js")

# Two steps, not one `export ... from`: the catalog uses STORAGE_AREAS
# locally (the `dimensions` map and the default export), and a bare
# re-export creates no local binding — it threw ReferenceError at
# import time. module-loads.test.js's vm parser also rejects
# `export ... from` outright, which is how that was caught.
patch(CATALOG,
"""// ── Enum values (confirmed from pg_enum, 22 Aug 2026) ─────────""",
"""// The storage-area vocabulary is shared with the delivery service,
// which validates put-away locations against it, so it is declared
// once in constants/ and re-exported here to keep this catalog's flat
// shape for its own consumers.
import { STORAGE_AREAS } from '../../constants/storageAreas.js';

// ── Enum values (confirmed from pg_enum, 22 Aug 2026) ─────────""",
"reportCatalog imports STORAGE_AREAS")

patch(CATALOG,
"""export const STORAGE_AREAS = ['cold_room', 'dry_store', 'fts_section', 'mezzanine', 'boardroom'];""",
"""export { STORAGE_AREAS };""",
"reportCatalog re-exports STORAGE_AREAS")

# ── 3. Repository: persist the two columns ────────────────────
print("3  repository")

patch(REPO_DELIV,
"""        `INSERT INTO delivery_note_items
           (delivery_note_id, product_id, purchase_order_item_id,
            expected_quantity, expected_weight_kg,
            received_quantity, unit, discrepancy_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          deliveryNoteId,
          line.productId,
          line.purchaseOrderItemId,
          line.expectedQuantity,
          line.expectedWeightKg,
          line.receivedQuantity,
          line.unit,
          line.discrepancyReason,
        ],
      );""",
"""        `INSERT INTO delivery_note_items
           (delivery_note_id, product_id, purchase_order_item_id,
            expected_quantity, expected_weight_kg,
            received_quantity, unit, discrepancy_reason,
            storage_area, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          deliveryNoteId,
          line.productId,
          line.purchaseOrderItemId,
          line.expectedQuantity,
          line.expectedWeightKg,
          line.receivedQuantity,
          line.unit,
          line.discrepancyReason,
          line.storageArea,   // BR-07 — migration 018
          line.expiryDate,    // BR-06 — null for anything not perishable
        ],
      );""",
"delivery_note_items stores storage_area and expiry_date")

patch(REPO_DELIV,
"""       p.name                  AS product_name,
       p.stock_keeping_unit    AS sku,
       p.weight_kg             AS product_weight_kg,
       p.default_unit
     FROM purchase_order_items poi""",
"""       p.name                  AS product_name,
       p.stock_keeping_unit    AS sku,
       p.weight_kg             AS product_weight_kg,
       p.default_unit,
       p.is_perishable
     FROM purchase_order_items poi""",
"purchase order items carry is_perishable")

# ── 4. Service: validate ──────────────────────────────────────
print("4  service validation")

patch(SVC_DELIV,
"""    resolved.push({
      productId:           po.product_id,
      purchaseOrderItemId: po.purchase_order_item_id,
      expectedQuantity:    expected,
      expectedWeightKg:    po.expected_weight_kg ?? null,
      receivedQuantity:    received,   // what arrived — drives discrepancy_quantity
      acceptedQuantity:    accepted,   // what goes into stock
      unit:                po.default_unit,
      discrepancyReason:   variance === 0 ? null : String(line.discrepancyReason).trim(),
    });""",
"""    // ── BR-07: every item gets a put-away location ─────────────
    // Checked after the quantity and discrepancy rules above so that a
    // line failing for a more specific reason still says so. The
    // screen has always sent this; until migration 018 the server
    // dropped it, which is why the rule was never actually enforced.
    const storageArea = String(line.location || '').trim();
    if (!storageArea) {
      fail(400, `A put-away location is required for ${po.product_name}.`);
    }
    if (!isStorageArea(storageArea)) {
      fail(400, `"${storageArea}" is not a storage area in this warehouse.`);
    }

    // ── BR-06: FEFO needs a date to sort on ────────────────────
    // Only perishables carry one — dry goods are picked oldest-first
    // and have nothing to record. A date is stored as sent; no
    // timezone conversion, because a use-by date is a calendar date
    // rather than an instant.
    let expiryDate = null;
    if (po.is_perishable) {
      const raw = String(line.expiryDate || '').trim();
      if (!raw) {
        fail(400, `A use-by date is required for ${po.product_name} — it is a perishable product.`);
      }
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
        fail(400, `Use-by date for ${po.product_name} must be a calendar date (YYYY-MM-DD).`);
      }
      expiryDate = raw;
    }

    resolved.push({
      productId:           po.product_id,
      purchaseOrderItemId: po.purchase_order_item_id,
      expectedQuantity:    expected,
      expectedWeightKg:    po.expected_weight_kg ?? null,
      receivedQuantity:    received,   // what arrived — drives discrepancy_quantity
      acceptedQuantity:    accepted,   // what goes into stock
      unit:                po.default_unit,
      discrepancyReason:   variance === 0 ? null : String(line.discrepancyReason).trim(),
      storageArea,                     // BR-07
      expiryDate,                      // BR-06 — null unless perishable
    });""",
"validate put-away location and use-by date")

# The import block differs between checkouts, so anchor on the first
# line of the file's own imports rather than a guessed neighbour.
s_svc, _ = _read(SVC_DELIV) if os.path.exists(SVC_DELIV) else ('', False)
if "constants/storageAreas.js" not in s_svc:
    import re as _re
    m = _re.search(r"^import .+?;$", s_svc, _re.M)
    if not m:
        FAILED.append("import isStorageArea: no import statement found in %s" % SVC_DELIV)
    else:
        first = m.group(0)
        patch(SVC_DELIV, first,
              first + "\nimport { isStorageArea } from '../constants/storageAreas.js';",
              "import isStorageArea into delivery.service.js")
else:
    print("  = import isStorageArea into delivery.service.js (already applied)")

# ── 5. Tests: the contract changed, so the fixtures do too ────
print("5  test fixtures")

patch(TEST_DELIV,
"""  lineItems:       [{ purchaseOrderItemId: 100, receivedQuantity: 20, overAction: 'accept' }],""",
"""  lineItems:       [{ purchaseOrderItemId: 100, receivedQuantity: 20, overAction: 'accept',
                      location: 'dry_store' }],""",
"default delivery body carries a location")

patch(TEST_DELIV,
"""      body({ lineItems: [{ purchaseOrderItemId: 100, receivedQuantity: 20, productId: 999, unit: 'crate' }] }),""",
"""      body({ lineItems: [{ purchaseOrderItemId: 100, receivedQuantity: 20, productId: 999, unit: 'crate',
                           location: 'dry_store' }] }),""",
"override-fields test carries a location")

patch(TEST_DELIV,
"""      body({ lineItems: [{
        purchaseOrderItemId: 100, receivedQuantity: 25,""",
"""      body({ lineItems: [{
        location: 'dry_store',
        purchaseOrderItemId: 100, receivedQuantity: 25,""",
"over-receipt test carries a location")

patch(TEST_DELIV,
"""      body({ lineItems: [{
        purchaseOrderItemId: 100, receivedQuantity: 18,""",
"""      body({ lineItems: [{
        location: 'dry_store',
        purchaseOrderItemId: 100, receivedQuantity: 18,""",
"short-receipt test carries a location")

# ── 6. database.md ────────────────────────────────────────────
print("6  database.md")

patch(DB_DOC,
"""## Status of this document

This schema is derived from the Milestone 2 class diagram. Every change from the original
diagram is called out inline with a `-- ADJUSTED` or `-- NEW` comment and cross-referenced
to the relevant warehouse-visit section number, so anyone can trace *why* a field exists.

**This documents the intended/target schema, not necessarily the exact live database.**
Once the current build is available, reconcile this file against the actual Supabase
schema (`pg_dump --schema-only`, or `server/database/schema.sql` in the repo) and update
whichever one is wrong. Docs should track code, not the reverse.""",
"""## Status of this document

> **⚠ This file is the Milestone 2 target schema. It is NOT the live database, and in
> several places it contradicts it. Do not build against this file — read the SQL in
> `server/src/repositories/` instead, which is what actually runs.**

This schema is derived from the Milestone 2 class diagram. Every change from the original
diagram is called out inline with a `-- ADJUSTED` or `-- NEW` comment and cross-referenced
to the relevant warehouse-visit section number, so anyone can trace *why* a field exists.

`server/database/schema.sql` is an empty placeholder and `server/database/migrations/`
only holds 015 onward, so neither is a substitute. The reconciliation below was done by
reading the queries the application issues; the authoritative version is
`pg_dump --schema-only` against the live database, which nobody has run yet.

### Known divergences from the live database

Confirmed by reading the SQL in `server/src/repositories/`, September 2026.

| This document says | The live database has | Evidence |
|---|---|---|
| `stock_items` | `products` | every repository joins `products p` |
| `inventory` | `stock_levels` | `stock.repository.js` — `quantity_on_hand`, `unit`, `reorder_threshold` |
| `ecd_centers` | `ecd_centres` | `dispatch.repository.js` |
| `stock_movements.removed BOOLEAN` | `stock_movements.movement_type` + `unit`, `reason`, `performed_by` | `stock.repository.js` `adjustStock` |
| `stock_movements.stock_item_id` | `stock_movements.product_id` | same |
| UUID primary keys throughout | `products`, `users`, `suppliers`, `purchase_orders` are integer `SERIAL` | `validateIntId` middleware; `Number.isInteger(productId)` guard in `adjustStock` |
| `purchase_orders.status` per §11.2 | seven values, listed verbatim in `server/src/constants/purchaseOrderStatus.js` | the CHECK constraint |
| `decanting_records` / `decanting_lines` not described here | both live; see the schema comment at the top of `decanting.repository.js` | — |
| — | `warehouse_manager_flags`, `pending_donation_items`, `donation_category_routing`, `donation_routing_defaults`, `reporting_queries`, `notifications` all live and undocumented here | the repositories that query them |

`movement_type` is constrained to exactly: `adjustment`, `decanted`, `dispatched`,
`donated`, `picked`, `received`, `wastage` (mirrored in `reportCatalog.js`). `picked` is
deliberately never written — stock is deducted at the dispatch gate, not at packing; see
the header comment in `picking.repository.js`.

### Applied since this document was written

- **018** — `delivery_note_items.storage_area` (BR-07) and `.expiry_date` (BR-06). The
  receiving screen had been collecting both since it was written; the server discarded
  them on every submit, so neither business rule was actually enforced.

**Still open:** per-batch stock. `expiry_date` is now recorded against the receipt line,
but `stock_levels` remains one balance per product, so picking cannot yet allocate
first-expiry-first-out. BR-06 is recorded, not enforced.""",
"database.md flags itself as stale and lists the divergences")

# ── Report ────────────────────────────────────────────────────
print("")
if FAILED:
    print("ABORTED — the failures below were not applied:")
    for f in FAILED:
        print("  ! %s" % f)
    print("")
    print("%d change(s) applied before the failure." % CHANGES)
    sys.exit(1)

print("%d change(s) applied." % CHANGES)
PYEOF

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Script 15 done."
echo ""
echo "  1. RUN THE MIGRATION FIRST — the server changes assume it:"
echo ""
echo "       psql \"\$DATABASE_URL\" -f server/database/migrations/018_add_receiving_location_and_expiry.sql"
echo ""
echo "     Point DATABASE_URL at a scratch Supabase branch, not main."
echo ""
echo "  2. Then verify:"
echo ""
echo "       cd client && npm run lint && npm run build && npm test"
echo "       cd ../server && npm test"
echo ""
echo "Receiving now rejects a line with no put-away location, and a line"
echo "for a perishable product with no use-by date. The client already"
echo "sends both, so nothing on screen changes — but four server test"
echo "fixtures were posting lines without a location and have been"
echo "updated to match the contract."
echo "─────────────────────────────────────────────────────────────"
#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 14-ledger-defects.sh
#
# Ledger correctness. No schema change — run this one first.
#
#   D1  Donation intake wrote stock_levels directly with no
#       stock_movements row, no row lock and a hard-coded 'kg'.
#       Now goes through adjustStock like every other inbound path.
#
#   D2  Decanting wastage was captured, validated and stored on
#       decanting_lines.wastage_kg — and never reached stock.
#       Whatever the worker enters manually now adjusts the
#       corresponding product, as a 'wastage' movement.
#
#   D2b Manual adjustments whose reason is a spoilage reason
#       ("Damaged / spoiled", "Expired", "Spillage") now write
#       movement_type = 'wastage' instead of 'adjustment', so the
#       wastage reporting dimension covers all wastage rather than
#       returning zero.
#
#   D3  MovementHistory's labels never matched the values actually
#       written ('receipt' vs 'received'), so managers saw raw enum
#       strings. 'donated' and 'dispatched' had no label at all.
#
#   Plus: three CURRENT_DATE occurrences in decanting.repository.js.
#         Render runs UTC, so CURRENT_DATE is yesterday for the first
#         two hours of every South African day. Same bug class already
#         fixed three times in this repo.
#
# Idempotent: safe to run more than once. Aborts without writing
# anything if the source has drifted from what it expects.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ ! -f server/src/repositories/stock.repository.js ] || [ ! -d client/src ]; then
  echo "ERROR: run this from the repository root (the folder containing client/ and server/)." >&2
  exit 1
fi

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
    """Replace `old` with `new`, exactly once. `new` is tested first so a
    re-run is a no-op even when `old` still appears inside `new`."""
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

def drop(path, text, label):
    """Remove an exact block. Separate from patch() because patch('', ...)
    can never work — the empty string is in every file."""
    global CHANGES
    if not os.path.exists(path):
        FAILED.append("%s: file not found (%s)" % (label, path)); return
    s, crlf = _read(path)
    if text not in s:
        print("  = %s (already removed)" % label); return
    n = s.count(text)
    if n != 1:
        FAILED.append("%s: block appears %d times in %s (expected 1)" % (label, n, path)); return
    _write(path, s.replace(text, '', 1), crlf)
    CHANGES += 1
    print("  + %s" % label)

def drop_between(path, start, end, label):
    """Remove start..end inclusive. Used where the block to delete contains
    trailing whitespace that would make an exact-literal anchor brittle —
    donation.intake.repository.js's JSDoc has three such lines."""
    global CHANGES
    if not os.path.exists(path):
        FAILED.append("%s: file not found (%s)" % (label, path)); return
    s, crlf = _read(path)
    if start not in s:
        print("  = %s (already removed)" % label); return
    if s.count(start) != 1:
        FAILED.append("%s: start marker appears %d times in %s" % (label, s.count(start), path)); return
    i = s.index(start)
    j = s.find(end, i)
    if j == -1:
        FAILED.append("%s: end marker not found after start in %s" % (label, path)); return
    _write(path, s[:i] + s[j + len(end):], crlf)
    CHANGES += 1
    print("  + %s" % label)

SVC_INTAKE   = 'server/src/services/donation.intake.service.js'
REPO_INTAKE  = 'server/src/repositories/donation.intake.repository.js'
REPO_DECANT  = 'server/src/repositories/decanting.repository.js'
REPO_STOCK   = 'server/src/repositories/stock.repository.js'
CLI_HISTORY  = 'client/src/features/InventoryManagement/components/MovementHistory.jsx'

# ── D1 ────────────────────────────────────────────────────────
print("D1  donation intake -> adjustStock")

patch(SVC_INTAKE,
"""import pool from '../config/db.js';
import donationRepository from '../repositories/donation.intake.repository.js';""",
"""import pool              from '../config/db.js';
import donationRepository from '../repositories/donation.intake.repository.js';
import stockModel         from '../repositories/stock.repository.js';""",
"import stockModel into donation.intake.service.js")

patch(SVC_INTAKE,
"""      const stockRes = await donationRepository.upsertInventoryLevel(client, productId, quantityKg);
      updatedStockBalance = stockRes.quantity_on_hand;""",
"""      // Inbound donation stock goes through adjustStock, the single
      // write path for quantity_on_hand — so the balance and
      // stock_movements stay reconcilable, the product row is locked
      // against a concurrent receipt, and the unit comes from the
      // product rather than being assumed to be kilograms.
      //
      // The previous upsertInventoryLevel did none of those three
      // things: it added straight to stock_levels, wrote no ledger
      // row, and hard-coded 'kg'. Stock arrived from nowhere as far
      // as any audit or report was concerned.
      const stockRes = await stockModel.adjustStock(client, {
        productId,
        quantityDelta: quantityKg,
        unit:          product.default_unit || 'kg',
        movementType:  'donated',
        referenceType: 'donation_intake',
        reason:        `Donation intake (${finalCategory})`,
        performedBy:   receivedByUserId,
      });
      updatedStockBalance = stockRes.after;""",
"donation intake writes a ledger row")

# adjustStock needs the product's unit, which this query didn't select.
patch(REPO_INTAKE,
"""    SELECT p.id, p.name, p.stock_keeping_unit, p.storage_type, d.donation_category AS default_category""",
"""    SELECT p.id, p.name, p.stock_keeping_unit, p.storage_type, p.default_unit,
           d.donation_category AS default_category""",
"select default_unit for the intake product")

drop_between(REPO_INTAKE,
"""/**
 * Upserts quantity_on_hand in the existing stock_levels table for ECD items.""",
"""  const res = await dbClient.query(query, [productId, quantityKg]);
  return res.rows[0];
};

""",
"remove upsertInventoryLevel (the last stock_levels write outside adjustStock)")

patch(REPO_INTAKE,
"""  getCategoryRoutingRule,
  upsertInventoryLevel,
};""",
"""  getCategoryRoutingRule,
};""",
"drop upsertInventoryLevel from the default export")

# dotenv loading env.example from a repository module — dead, and pointing
# at the example file. Config lives in config/db.js.
drop(REPO_INTAKE,
"""import dotenv from 'dotenv';
dotenv.config({ path: '../../../server/env.example'})
""",
"remove stray dotenv(env.example) from the intake repository")

# ── D2 ────────────────────────────────────────────────────────
print("D2  decanting wastage -> stock")

patch(REPO_DECANT,
"""import pool from '../config/db.js';""",
"""import pool       from '../config/db.js';
import stockModel from './stock.repository.js';""",
"import stockModel into decanting.repository.js")

patch(REPO_DECANT,
"""    await client.query('COMMIT');

    // Return the freshly-saved record with its lines
    return await getDecantingById(record.id);""",
"""    // ── Wastage leaves the building, so it leaves the ledger ────
    // Wastage is measured and typed in by the worker after the sack
    // is decanted — it cannot be derived, which is why it arrives as
    // a per-line figure rather than being calculated here. Whatever
    // they entered is what comes off the product.
    //
    // Decanting itself moves no stock: a 50 kg sack split into
    // 100 x 500 g bags is the same 50 kg of the same product, and the
    // bag split is recorded on the decanting line. Only the wastage
    // is a real change in what the warehouse holds.
    //
    // adjustStock's contract: callers touching multiple products must
    // lock them in product_id order or they deadlock against other
    // transactions doing the same (see delivery.repository.createDelivery).
    const wasted = lines
      .filter((l) => l.productId && Number(l.wastageKg) > 0)
      .sort((a, b) => a.productId - b.productId);

    const stockWarnings = [];

    for (const line of wasted) {
      const res = await stockModel.adjustStock(client, {
        productId:     line.productId,
        quantityDelta: -Math.abs(Number(line.wastageKg)),
        unit:          'kg',
        movementType:  'wastage',
        referenceType: 'decanting',
        referenceId:   record.id,
        reason:        `Decanting wastage, week of ${weekOf}`,
        performedBy:   recordedBy,
      });

      if (res.isUnitMismatch) {
        stockWarnings.push({
          productId: line.productId,
          message: 'Decanting wastage is measured in kg but this product\\'s ledger is in a different unit; the wastage was deducted in the recorded unit.',
        });
      }
      if (res.isShortfall) {
        stockWarnings.push({
          productId: line.productId,
          message: 'Recording this wastage took the product below zero on hand — the shelf and the ledger disagree.',
        });
      }
    }

    await client.query('COMMIT');

    // Return the freshly-saved record with its lines
    const saved = await getDecantingById(record.id);
    return stockWarnings.length ? { ...saved, stockWarnings } : saved;""",
"decanting wastage adjusts stock")

# SAST: Render is UTC, so CURRENT_DATE is yesterday until 02:00 local.
patch(REPO_DECANT,
"""    dateFilter = `AND dr.created_at::date = CURRENT_DATE`;
  } else if (range === 'week') {
    dateFilter = `AND dr.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
  } else if (range === 'month') {
    dateFilter = `AND dr.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
  }""",
"""    // SAST, not UTC. Render's clock is UTC, so CURRENT_DATE is still
    // yesterday for the first two hours of every South African day —
    // a decanting run recorded at 01:00 local vanished from "today".
    dateFilter = `AND (dr.created_at AT TIME ZONE 'Africa/Johannesburg')::date`
               + ` = (now() AT TIME ZONE 'Africa/Johannesburg')::date`;
  } else if (range === 'week') {
    dateFilter = `AND (dr.created_at AT TIME ZONE 'Africa/Johannesburg')::date`
               + ` >= (now() AT TIME ZONE 'Africa/Johannesburg')::date - INTERVAL '7 days'`;
  } else if (range === 'month') {
    dateFilter = `AND (dr.created_at AT TIME ZONE 'Africa/Johannesburg')::date`
               + ` >= (now() AT TIME ZONE 'Africa/Johannesburg')::date - INTERVAL '30 days'`;
  }""",
"decanting date filters use SAST, not UTC")

# ── D2b ───────────────────────────────────────────────────────
print("D2b manual spoilage reasons -> 'wastage'")

patch(REPO_STOCK,
"""    const outcome = await adjustStock(client, {
      productId, quantityDelta, unit, movementType: 'adjustment', referenceType: 'manual_adjustment', reason, performedBy,
    });""",
"""    const outcome = await adjustStock(client, {
      productId, quantityDelta, unit,
      movementType:  movementTypeForReason(reason),
      referenceType: 'manual_adjustment',
      reason, performedBy,
    });""",
"manualAdjust picks its movement type from the reason")

patch(REPO_STOCK,
"""// ── Manual adjustment ─────────────────────────────────────────""",
"""// ── Which movement type is a manual adjustment? ───────────────
// The adjustment screen offers a fixed reason list, and three of its
// entries describe stock that spoiled rather than stock that was
// mis-counted. Filing those as 'adjustment' left the ledger unable to
// answer "how much did we lose?" — the wastage reporting dimension
// could only ever return zero, because decanting was the sole writer
// of that type and it wasn't writing either.
//
// Matched on the exact strings in AdjustStockModal.jsx's REASONS.
// A reason added there and not here degrades to 'adjustment', which
// is the safe direction: it under-reports wastage rather than
// inventing it.
const WASTAGE_REASONS = new Set([
  'Damaged / spoiled',
  'Expired',
  'Spillage',
]);

const movementTypeForReason = (reason) =>
  WASTAGE_REASONS.has(String(reason || '').trim()) ? 'wastage' : 'adjustment';

// ── Manual adjustment ─────────────────────────────────────────""",
"add WASTAGE_REASONS mapping")

# ── D3 ────────────────────────────────────────────────────────
print("D3  movement history labels")

patch(CLI_HISTORY,
"""const TYPE_LABEL = {
  adjustment: "Manual adjustment",
  receipt: "Goods received",
  pick: "Picked for dispatch",
  decant: "Decanting",
  wastage: "Wastage",
};""",
"""// Keys are the values the database actually stores — the
// movement_type CHECK constraint, mirrored in reportCatalog.js's
// MOVEMENT_TYPES. Three of these were previously singular forms
// ('receipt', 'pick', 'decant') that no row could ever match, and
// 'donated' and 'dispatched' were missing entirely, so the drawer
// fell through to `?? m.movementType` and showed managers the raw
// enum value on every real row.
const TYPE_LABEL = {
  adjustment: "Manual adjustment",
  decanted:   "Decanting",
  dispatched: "Dispatched to beneficiary",
  donated:    "Donation received",
  picked:     "Picked for dispatch",
  received:   "Goods received",
  wastage:    "Wastage",
};""",
"movement type labels match the stored values")

# ── Report ────────────────────────────────────────────────────
print("")
if FAILED:
    print("ABORTED — no files were written for the failures below:")
    for f in FAILED:
        print("  ! %s" % f)
    print("")
    print("%d change(s) applied before the failure. The source has drifted" % CHANGES)
    print("from what this script expects — re-check those anchors by hand.")
    sys.exit(1)

print("%d change(s) applied." % CHANGES)
PYEOF

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Script 14 done. Verify with:"
echo ""
echo "  cd client && npm run lint && npm run build && npm test"
echo "  cd ../server && npm test"
echo ""
echo "No migration is needed for this script — decanting_lines.wastage_kg"
echo "and stock_movements already exist."
echo ""
echo "After this lands, every write to stock_levels goes through"
echo "adjustStock. Confirm with:"
echo ""
echo "  grep -rn 'stock_levels' server/src --include=*.js | grep -i 'insert\\|update'"
echo ""
echo "Expect exactly two hits, both inside stock.repository.js."
echo "─────────────────────────────────────────────────────────────"
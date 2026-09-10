#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 16-manager-stock-ledger.sh
#
# The manager stock ledger. No migration — every table this reads
# already exists.
#
# WHAT THIS ADDS
#   GET /api/stock/ledger                 manager/admin
#     Warehouse-wide movement history: filter by date range (SAST),
#     product, movement type, actor and reference type. Keyset
#     paginated. Each row carries balance_after — that product's
#     running balance at that moment, computed over its FULL history
#     so the number stays true no matter how the list is filtered.
#     Returns a summary (in / out / net / counts) over the same
#     filters in the same response.
#
#   GET /api/stock/ledger/reconciliation  manager/admin
#     Per product: stock_levels.quantity_on_hand vs SUM of its
#     stock_movements, and the variance between them. After script
#     14 this should be empty. It is the screen that proves the
#     donation-intake bypass is closed and keeps proving it.
#
#   /noc/stock-ledger — the page, under Insights in the manager and
#     admin sidebars.
#
# WHAT THIS DELIBERATELY DOES NOT DO
#   No shared DataTable extraction. StockManifestTable is the most
#   capable table in the client and refactoring it in the same change
#   as a new feature risks a screen that works. The extraction is
#   still worth doing — separately, with its own verification.
#
# Idempotent. Aborts without writing if the source has drifted.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ ! -f server/src/repositories/stock.repository.js ] || [ ! -d client/src ]; then
  echo "ERROR: run this from the repository root (the folder containing client/ and server/)." >&2
  exit 1
fi

if ! grep -q "constants/storageAreas.js" server/src/features/reporting/reportCatalog.js 2>/dev/null; then
  echo "ERROR: script 15 has not been applied to this checkout." >&2
  echo "Run 14-ledger-defects.sh and 15-receiving-location-expiry.sh first." >&2
  exit 1
fi

python3 - <<'PYEOF'
import os, sys

CATALOG_PATH = 'server/src/features/reporting/reportCatalog.js'

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
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    _write(path, body, False)
    CHANGES += 1
    print("  + %s" % label)

# ══════════════════════════════════════════════════════════════
print("1  movement type vocabulary")
# ══════════════════════════════════════════════════════════════

write_file('server/src/constants/movementTypes.js', """// ─────────────────────────────────────────────────────────────
// server/src/constants/movementTypes.js
//
// The stock_movements.movement_type vocabulary, in one place.
//
// THIS LIST IS THE CHECK CONSTRAINT, VERBATIM.
//
// It lives in constants/ rather than in reportCatalog.js because the
// stock service needs it to validate a ledger filter, and a service
// importing from the reporting feature to do that is the wrong
// direction. reportCatalog re-exports from here, so there is exactly
// one list — the same arrangement as purchaseOrderStatus.js and
// storageAreas.js, and for the reason stock.repository.js already
// records in its own header: movement_type drifted once because two
// modules each kept a copy.
//
// 'picked' is never written, deliberately. Stock is deducted at the
// dispatch gate against what was actually loaded, not at packing —
// otherwise a pallet standing in the staging area drives the balance
// negative for food that is still in the building. See the header of
// picking.repository.js before you "fix" that.
// ─────────────────────────────────────────────────────────────

export const MOVEMENT_TYPES = [
  'adjustment',   // manual correction, reason recorded
  'decanted',     // reserved; decanting moves no stock, only its wastage does
  'dispatched',   // left the building with a beneficiary
  'donated',      // arrived as a donation
  'picked',       // reserved, never written — see above
  'received',     // arrived against a purchase order
  'wastage',      // spoiled, damaged, spilled or lost in decanting
];

// Types that take stock out of the building. Used for the ledger
// summary's split, so "out" means the same thing everywhere.
export const OUTBOUND_MOVEMENT_TYPES = ['dispatched', 'picked', 'wastage'];

export const isMovementType = (value) =>
  MOVEMENT_TYPES.includes(String(value || '').trim());

export default { MOVEMENT_TYPES, OUTBOUND_MOVEMENT_TYPES, isMovementType };
""", "add constants/movementTypes.js")

# Same two-step as storageAreas: the catalog uses MOVEMENT_TYPES
# locally, and `export ... from` creates no local binding (and
# module-loads.test.js's vm parser rejects it outright).
# ONE patch, replacing the constant in place — the import and the
# re-export both land where the declaration was.
#
# The obvious alternative, adding the import next to script 15's
# `import { STORAGE_AREAS }` line, is a trap. Script 15 decides it has
# already run by testing for its inserted block as one contiguous
# string (comment + import + blank line + the "Enum values" header).
# Slipping a line into the middle of that block breaks the match, so a
# re-run of 15 no longer recognises its own work and inserts a SECOND
# `import { STORAGE_AREAS }` — a duplicate binding and a hard
# SyntaxError. Two scripts must never write inside each other's anchor.
#
# A mid-file `import` is legal ESM (declarations are hoisted) and
# module-loads.test.js parses it happily — unlike `export ... from`,
# which its vm parser rejects outright.
# An earlier build of this script wrote the same import and re-export
# with different comment prose. Recognise that as done rather than
# aborting on a missing anchor — what matters is that the binding comes
# from constants/movementTypes.js and is re-exported, not the wording
# above it.
_cat, _ = _read(CATALOG_PATH) if os.path.exists(CATALOG_PATH) else ('', False)
if 'constants/movementTypes.js' in _cat and 'export { MOVEMENT_TYPES }' in _cat:
    print("  = reportCatalog imports and re-exports MOVEMENT_TYPES (already applied)")
else:
    patch('server/src/features/reporting/reportCatalog.js',
"""export const MOVEMENT_TYPES = [
  'adjustment', 'decanted', 'dispatched', 'donated', 'picked', 'received', 'wastage',
];""",
"""// The movement_type vocabulary is shared with the stock service,
// which validates ledger filters against it, so it is declared once in
// constants/ and re-exported here to keep this catalog's flat shape.
import { MOVEMENT_TYPES } from '../../constants/movementTypes.js';
export { MOVEMENT_TYPES };""",
          "reportCatalog imports and re-exports MOVEMENT_TYPES")

# ══════════════════════════════════════════════════════════════
print("2  repository")
# ══════════════════════════════════════════════════════════════

# Anchored on the PREFIX of the export, not the whole line: #56 added
# setStockMeta to it and the next feature will add something else. The
# new names are prepended and the file's own `, ... };` still closes it.
patch('server/src/repositories/stock.repository.js',
"""
export default { adjustStock, manualAdjust, getManifest, getMovements""",
"""
// ── The ledger, warehouse-wide ─────────────────────────────────
//
// getMovements above answers "what happened to this product". This
// answers "what happened", which is the manager's question, and it is
// the only place the ledger can be read without first knowing which
// product you care about.
//
// RUNNING BALANCE
// balance_after is computed in a CTE over the UNFILTERED table and
// filtered afterwards. That ordering is the whole point: a window
// function only sees the rows that survive the WHERE clause, so
// computing it after filtering would show a "balance" that counted
// only the movements you happened to be looking at — a number that
// looks authoritative and is wrong. Filtering to wastage-only would
// have shown rice's balance walking down from -10.
//
// The CTE scans every movement on every call. At this warehouse's
// volume that is a few thousand rows and costs nothing measurable.
// If stock_movements ever reaches the point where it does, the fix is
// a materialised balance column maintained by adjustStock — not
// moving the window inside the filter.
//
// PAGINATION IS KEYSET, NOT OFFSET
// (created_at, id) as a row comparison, matching the ORDER BY exactly.
// OFFSET on an append-only table shifts every page boundary as soon as
// one movement is written mid-browse, which silently duplicates and
// skips rows.
const LEDGER_CTE = `
  WITH walked AS (
    SELECT sm.id, sm.product_id, sm.quantity, sm.unit, sm.movement_type,
           sm.reference_type, sm.reference_id, sm.reason,
           sm.performed_by, sm.created_at,
           SUM(sm.quantity) OVER (PARTITION BY sm.product_id
                                  ORDER BY sm.created_at, sm.id
                                  ROWS UNBOUNDED PRECEDING) AS balance_after
    FROM stock_movements sm
  )`;

// Shared by the page query and the summary so the two can never
// disagree about what the manager is looking at. SAST, not UTC:
// Render's clock is UTC, so a movement recorded at 01:00 in Cape Town
// falls on the previous calendar day and drops out of "today".
const ledgerWhere = (filters, params, alias) => {
  const where = [];
  const { from, to, productId, movementTypes, performedBy, referenceType } = filters;

  if (from) {
    params.push(from);
    where.push(`(${alias}.created_at AT TIME ZONE 'Africa/Johannesburg')::date >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`(${alias}.created_at AT TIME ZONE 'Africa/Johannesburg')::date <= $${params.length}::date`);
  }
  if (productId) {
    params.push(productId);
    where.push(`${alias}.product_id = $${params.length}`);
  }
  if (movementTypes && movementTypes.length) {
    params.push(movementTypes);
    where.push(`${alias}.movement_type = ANY($${params.length}::text[])`);
  }
  if (performedBy) {
    params.push(performedBy);
    where.push(`${alias}.performed_by = $${params.length}`);
  }
  if (referenceType) {
    params.push(referenceType);
    where.push(`${alias}.reference_type = $${params.length}`);
  }
  return where;
};

// One extra row is requested beyond the caller's limit. If it comes
// back there is another page; it is dropped before returning, so the
// caller never sees it. Cheaper and more honest than a COUNT(*) over
// the whole table on every request.
const getLedger = async ({ limit = 50, cursor = null, ...filters } = {}) => {
  const params = [];
  const where  = ledgerWhere(filters, params, 'w');

  if (cursor) {
    params.push(cursor.createdAt);
    params.push(cursor.id);
    where.push(`(w.created_at, w.id) < ($${params.length - 1}::timestamptz, $${params.length}::int)`);
  }

  params.push(limit + 1);

  const result = await pool.query(
    `${LEDGER_CTE}
     SELECT w.id, w.product_id, w.quantity, w.unit, w.movement_type,
            w.reference_type, w.reference_id, w.reason, w.created_at,
            w.balance_after,
            p.name               AS product_name,
            p.stock_keeping_unit AS sku,
            u.first_name         AS performed_by_name
     FROM walked w
     JOIN products p       ON p.id = w.product_id
     LEFT JOIN users u     ON u.id = w.performed_by
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY w.created_at DESC, w.id DESC
     LIMIT $${params.length}`,
    params,
  );

  const rows    = result.rows;
  const hasMore = rows.length > limit;
  const page    = hasMore ? rows.slice(0, limit) : rows;
  const last    = page[page.length - 1];

  return {
    rows: page,
    nextCursor: hasMore && last
      ? { createdAt: last.created_at, id: last.id }
      : null,
  };
};

// The same filters, aggregated. Reads stock_movements directly rather
// than the CTE — the running balance is irrelevant to a total, and
// there is no reason to walk every product's history to add up a
// column.
const getLedgerSummary = async (filters = {}) => {
  const params = [];
  const where  = ledgerWhere(filters, params, 'sm');

  const result = await pool.query(
    `SELECT
       COALESCE(SUM(sm.quantity) FILTER (WHERE sm.quantity > 0), 0)::numeric AS total_in,
       COALESCE(SUM(sm.quantity) FILTER (WHERE sm.quantity < 0), 0)::numeric AS total_out,
       COALESCE(SUM(sm.quantity), 0)::numeric                                AS net_change,
       COUNT(*)::int                                                         AS movement_count,
       COUNT(DISTINCT sm.product_id)::int                                    AS product_count
     FROM stock_movements sm
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    params,
  );
  return result.rows[0];
};

// ── Does the balance still equal the ledger? ───────────────────
// quantity_on_hand is maintained by adjustStock, which writes a
// movement in the same transaction — so for every product the two
// must agree, and a non-zero variance means something wrote the
// balance without writing the ledger.
//
// That is not hypothetical: donation intake did exactly that until
// script 14 (INSERT ... ON CONFLICT straight into stock_levels, no
// movement row, no row lock). This query is how you would have found
// it, and how you find the next one.
//
// Products with no movements and no balance are excluded — a catalog
// entry nothing has ever happened to is not a discrepancy.
const getReconciliation = async () => {
  const result = await pool.query(
    `SELECT
       p.id,
       p.name,
       p.stock_keeping_unit                        AS sku,
       COALESCE(sl.unit, '')                       AS unit,
       COALESCE(sl.quantity_on_hand, 0)::numeric   AS balance,
       COALESCE(m.ledger_sum, 0)::numeric          AS ledger_sum,
       COALESCE(m.movement_count, 0)::int          AS movement_count,
       (COALESCE(sl.quantity_on_hand, 0) - COALESCE(m.ledger_sum, 0))::numeric AS variance
     FROM products p
     LEFT JOIN stock_levels sl ON sl.product_id = p.id
     LEFT JOIN (
       SELECT product_id,
              SUM(quantity)  AS ledger_sum,
              COUNT(*)       AS movement_count
       FROM stock_movements
       GROUP BY product_id
     ) m ON m.product_id = p.id
     WHERE p.is_active = true
       AND (sl.product_id IS NOT NULL OR m.product_id IS NOT NULL)
     ORDER BY ABS(COALESCE(sl.quantity_on_hand, 0) - COALESCE(m.ledger_sum, 0)) DESC,
              p.name ASC`,
  );
  return result.rows;
};

// ── Who has moved stock, for the ledger's actor filter ─────────
const getLedgerActors = async () => {
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.first_name AS name
     FROM stock_movements sm
     JOIN users u ON u.id = sm.performed_by
     ORDER BY u.first_name ASC`,
  );
  return result.rows;
};

export default {
  getLedger, getLedgerSummary, getReconciliation, getLedgerActors,
  adjustStock, manualAdjust, getManifest, getMovements""",
"repository: getLedger, getLedgerSummary, getReconciliation, getLedgerActors")

# ══════════════════════════════════════════════════════════════
print("3  service")
# ══════════════════════════════════════════════════════════════

patch('server/src/services/stock.service.js',
"""import stockModel from '../repositories/stock.repository.js';""",
"""import stockModel        from '../repositories/stock.repository.js';
import { isMovementType } from '../constants/movementTypes.js';""",
"stock.service imports isMovementType")

patch('server/src/services/stock.service.js',
"""export default { getManifest, getMovements, adjustManually };""",
"""// ── Ledger ─────────────────────────────────────────────────────
// The cursor is opaque on purpose. It encodes (created_at, id) — the
// keyset the repository pages on — but a client that parses it and
// starts constructing its own would be building on a detail that is
// free to change. Base64 says "hand this back to me, don't read it".
const encodeCursor = (cursor) =>
  cursor ? Buffer.from(`${new Date(cursor.createdAt).toISOString()}|${cursor.id}`, 'utf8').toString('base64') : null;

const decodeCursor = (raw) => {
  if (!raw) return null;
  let text;
  try {
    text = Buffer.from(String(raw), 'base64').toString('utf8');
  } catch {
    fail(400, 'That page cursor is not valid.');
  }
  const [createdAt, id] = text.split('|');
  const parsedId = Number(id);
  if (!createdAt || Number.isNaN(Date.parse(createdAt)) || !Number.isInteger(parsedId)) {
    fail(400, 'That page cursor is not valid.');
  }
  return { createdAt, id: parsedId };
};

const DATE_ONLY = /^\\d{4}-\\d{2}-\\d{2}$/;

// A calendar date, compared against a SAST calendar date in SQL — so
// it is not parsed into an instant here. Doing that is what turns
// "2026-09-09" into 2026-09-08T22:00Z and loses a day.
const parseDate = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!DATE_ONLY.test(text) || Number.isNaN(Date.parse(text))) {
    fail(400, `${label} must be a calendar date (YYYY-MM-DD).`);
  }
  return text;
};

const MAX_LIMIT     = 200;
const DEFAULT_LIMIT = 50;

const parseLimit = (value) => {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    fail(400, `Limit must be a whole number between 1 and ${MAX_LIMIT}.`);
  }
  return n;
};

// Express gives ?type=a&type=b as an array and ?type=a as a string.
// Both shapes reach here, so both are normalised rather than one of
// them silently becoming a seven-character array of letters.
const parseMovementTypes = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const list = (Array.isArray(value) ? value : String(value).split(','))
    .map((t) => String(t).trim())
    .filter(Boolean);

  for (const t of list) {
    if (!isMovementType(t)) fail(400, `"${t}" is not a kind of stock movement.`);
  }
  return list;
};

const parseId = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(400, `${label} must be a valid id.`);
  return n;
};

const getLedger = async (query = {}) => {
  const from = parseDate(query.from, 'Start date');
  const to   = parseDate(query.to,   'End date');

  if (from && to && from > to) {
    fail(400, 'The start date is after the end date.');
  }

  const filters = {
    from,
    to,
    productId:     parseId(query.productId, 'Product'),
    performedBy:   parseId(query.performedBy, 'User'),
    movementTypes: parseMovementTypes(query.movementType ?? query.movementTypes),
    referenceType: query.referenceType ? String(query.referenceType).trim() : null,
    limit:         parseLimit(query.limit),
    cursor:        decodeCursor(query.cursor),
  };

  // The summary answers the same question as the page, so it takes
  // the same filters — but never the cursor or the limit, or the
  // totals would describe one page rather than the whole selection.
  const { cursor, limit, ...summaryFilters } = filters;

  const [page, summary] = await Promise.all([
    stockModel.getLedger(filters),
    stockModel.getLedgerSummary(summaryFilters),
  ]);

  return {
    movements:  page.rows,
    summary,
    nextCursor: encodeCursor(page.nextCursor),
  };
};

const getReconciliation = async () => {
  const rows = await stockModel.getReconciliation();
  return {
    products:  rows,
    variances: rows.filter((r) => Number(r.variance) !== 0),
  };
};

const getLedgerActors = async () => stockModel.getLedgerActors();

export default {
  getManifest, getMovements, adjustManually,
  getLedger, getReconciliation, getLedgerActors,
};""",
"service: ledger filters, cursor and reconciliation")

# ══════════════════════════════════════════════════════════════
print("4  controller and routes")
# ══════════════════════════════════════════════════════════════

# The TODO this replaces is stale — stock.service.js has had a fail()
# helper since the manual-adjustment work.
patch('server/src/controllers/stock.controller.js',
"""// TODO(Alessio): stock.service.js currently throws bare `new Error(...)`
// with no `.status` attached (unlike picking.service.js's `fail()`
// helper), so right now every thrown error here — even a validation
// error like "Product ID is required." — falls through to the 500
// branch below instead of getting a 400/404. Add a `fail(status, msg)`
// helper to stock.service.js (mirroring picking.service.js) to fix this.""",
"""// stock.service.js has a `fail(status, message)` helper mirroring
// picking.service.js's, so validation errors arrive here carrying a
// 400/404 and keep their message. (An earlier note here said it
// didn't — it does.)""",
"drop the stale TODO from stock.controller.js")

patch('server/src/controllers/stock.controller.js',
"""export default {
  getManifest,
  getMovements,
  adjustManually,
};""",
"""// ── The ledger, warehouse-wide (manager/admin) ───────────────────
// GET /api/stock/ledger
// Query: from, to (YYYY-MM-DD, SAST), productId, movementType
//        (repeatable or comma-separated), performedBy, referenceType,
//        limit, cursor
// Returns: { movements, summary, nextCursor }
const getLedger = async (req, res) => {
  try {
    const data = await stockService.getLedger(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getLedger]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve the stock ledger.',
    });
  }
};

// ── Balance vs ledger (manager/admin) ────────────────────────────
// GET /api/stock/ledger/reconciliation
// Returns: { products, variances } — variances is the subset that
// does not balance, and should be empty.
const getReconciliation = async (req, res) => {
  try {
    const data = await stockService.getReconciliation();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getReconciliation]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to reconcile stock balances.',
    });
  }
};

// ── Actors, for the ledger's filter bar (manager/admin) ──────────
// GET /api/stock/ledger/actors
const getLedgerActors = async (req, res) => {
  try {
    const data = await stockService.getLedgerActors();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[getLedgerActors]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve ledger users.',
    });
  }
};

export default {
  getManifest,
  getMovements,
  adjustManually,
  getLedger,
  getReconciliation,
  getLedgerActors,
};""",
"controller: ledger, reconciliation, actors")

patch('server/src/routes/stock.routes.js',
"""// ── Static paths before /:id to prevent shadowing ────────────
router.post('/adjust', auth, requireRole(...MANAGERS_UP), stockController.adjustManually);""",
"""// ── Static paths before /:id to prevent shadowing ────────────
router.post('/adjust', auth, requireRole(...MANAGERS_UP), stockController.adjustManually);

// ── Ledger (manager/admin) ────────────────────────────────────
// The two /ledger/... paths are declared before /ledger itself for
// the same reason this whole block sits above /:id — Express matches
// in declaration order, and a bare /ledger route declared first would
// not shadow them, but keeping the specific-before-general habit is
// what stops the next route from being the one that breaks.
//
// Manager/admin only. The per-product drawer at /:id/history stays
// open to all roles: a packer checking why the rice count moved is a
// reasonable thing to do, whereas the warehouse-wide ledger is a
// supervisory view.
router.get('/ledger/reconciliation', auth, requireRole(...MANAGERS_UP), stockController.getReconciliation);
router.get('/ledger/actors',         auth, requireRole(...MANAGERS_UP), stockController.getLedgerActors);
router.get('/ledger',                auth, requireRole(...MANAGERS_UP), stockController.getLedger);""",
"routes: /ledger, /ledger/reconciliation, /ledger/actors")

# ══════════════════════════════════════════════════════════════
print("5  client API")
# ══════════════════════════════════════════════════════════════

patch('client/src/services/stockAPI.js',
"""export default { getManifest, getMovements, adjustStock };""",
"""// ── Ledger row ────────────────────────────────────────────────
// balanceAfter is that product's running balance immediately after
// this movement, computed server-side over its full history — it is
// NOT affected by the filters in the UI, and must not be recomputed
// here from the visible rows.
const toLedgerRow = (row) => ({
  id:              row.id,
  productId:       row.product_id,
  productName:     row.product_name,
  sku:             row.sku,
  quantity:        Number(row.quantity ?? 0),
  balanceAfter:    Number(row.balance_after ?? 0),
  unit:            row.unit || "",
  movementType:    row.movement_type,
  referenceType:   row.reference_type,
  referenceId:     row.reference_id,
  reason:          row.reason,
  performedByName: row.performed_by_name || "Unknown",
  createdAt:       row.created_at,
});

const toReconciliationRow = (row) => ({
  id:            row.id,
  name:          row.name,
  sku:           row.sku,
  unit:          row.unit || "",
  balance:       Number(row.balance ?? 0),
  ledgerSum:     Number(row.ledger_sum ?? 0),
  variance:      Number(row.variance ?? 0),
  movementCount: Number(row.movement_count ?? 0),
});

// ── GET /api/stock/ledger ─────────────────────────────────────
// Filters are omitted from the query string when empty rather than
// sent as "", because the server treats an empty string as absent but
// there is no reason to make it prove that on every request.
export const getLedger = async ({
  from, to, productId, performedBy, movementTypes, referenceType, limit, cursor,
} = {}) => {
  const params = new URLSearchParams();
  if (from)          params.set("from", from);
  if (to)            params.set("to", to);
  if (productId)     params.set("productId", String(productId));
  if (performedBy)   params.set("performedBy", String(performedBy));
  if (referenceType) params.set("referenceType", referenceType);
  if (limit)         params.set("limit", String(limit));
  if (cursor)        params.set("cursor", cursor);
  if (movementTypes && movementTypes.length) {
    params.set("movementType", movementTypes.join(","));
  }

  const qs   = params.toString();
  const body = await apiGet(`/api/stock/ledger${qs ? `?${qs}` : ""}`);
  const data = body.data ?? {};

  return {
    movements:  (data.movements ?? []).map(toLedgerRow),
    nextCursor: data.nextCursor ?? null,
    summary: {
      totalIn:       Number(data.summary?.total_in ?? 0),
      totalOut:      Number(data.summary?.total_out ?? 0),
      netChange:     Number(data.summary?.net_change ?? 0),
      movementCount: Number(data.summary?.movement_count ?? 0),
      productCount:  Number(data.summary?.product_count ?? 0),
    },
  };
};

// ── GET /api/stock/ledger/reconciliation ──────────────────────
export const getReconciliation = async () => {
  const body = await apiGet("/api/stock/ledger/reconciliation");
  const data = body.data ?? {};
  return {
    products:  (data.products ?? []).map(toReconciliationRow),
    variances: (data.variances ?? []).map(toReconciliationRow),
  };
};

// ── GET /api/stock/ledger/actors ──────────────────────────────
export const getLedgerActors = async () => {
  const body = await apiGet("/api/stock/ledger/actors");
  return (body.data ?? []).map((r) => ({ id: r.id, name: r.name || "Unknown" }));
};

export default {
  getManifest, getMovements, adjustStock,
  getLedger, getReconciliation, getLedgerActors,
};""",
"stockAPI: getLedger, getReconciliation, getLedgerActors")

# ══════════════════════════════════════════════════════════════
print("6  client components")
# ══════════════════════════════════════════════════════════════

write_file('client/src/features/InventoryManagement/components/LedgerTable.jsx', """// ─────────────────────────────────────────────────────────────
// LedgerTable.jsx
//
// The warehouse-wide movement list. Deliberately NOT a copy of
// StockManifestTable: this one has no client-side sort, because the
// ledger is chronological by definition and re-sorting it by quantity
// would make the running balance column meaningless.
// ─────────────────────────────────────────────────────────────
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// Same keys the database stores. Kept in step with
// server/src/constants/movementTypes.js.
const TYPE_LABEL = {
  adjustment: "Manual adjustment",
  decanted:   "Decanting",
  dispatched: "Dispatched",
  donated:    "Donation",
  picked:     "Picked",
  received:   "Received",
  wastage:    "Wastage",
};

// Tone follows what the movement means, not its sign: wastage is a
// loss even though a manual correction downward is not.
const TYPE_TONE = {
  wastage:    "border-[#ef3a40] text-[#ef3a40]",
  adjustment: "border-[#b8860b] text-[#8a6508]",
};

const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Africa/Johannesburg explicitly: a manager opening this from a
  // laptop still set to another timezone should see warehouse time,
  // which is also the timezone the server filtered on.
  return d.toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const fmtQty = (n) => {
  const rounded = Math.round(Number(n) * 1000) / 1000;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-ZA")}`;
};

export default function LedgerTable({ rows, isLoading }) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm font-medium">No stock movements match these filters.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Widen the date range, or clear the filters to see everything.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">When</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="w-[110px]">SKU</TableHead>
            <TableHead className="w-[140px]">Type</TableHead>
            <TableHead className="w-[110px] text-right">Change</TableHead>
            <TableHead className="w-[120px] text-right">Balance after</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="w-[110px]">By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {fmtWhen(m.createdAt)}
              </TableCell>
              <TableCell className="max-w-[220px] truncate font-medium" title={m.productName}>
                {m.productName}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{m.sku}</TableCell>
              <TableCell>
                <Badge variant="outline" className={TYPE_TONE[m.movementType] || ""}>
                  {TYPE_LABEL[m.movementType] ?? m.movementType}
                </Badge>
              </TableCell>
              <TableCell
                className={`text-right font-mono text-sm ${m.quantity < 0 ? "text-[#ef3a40]" : ""}`}
              >
                {fmtQty(m.quantity)} {m.unit}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-muted-foreground">
                {(Math.round(m.balanceAfter * 1000) / 1000).toLocaleString("en-ZA")}
              </TableCell>
              <TableCell className="max-w-[260px] truncate text-xs" title={m.reason || ""}>
                {m.reason || (m.referenceType ? m.referenceType.replace(/_/g, " ") : "—")}
              </TableCell>
              <TableCell className="text-xs">{m.performedByName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
""", "LedgerTable.jsx")

write_file('client/src/features/InventoryManagement/components/ReconciliationPanel.jsx', """// ─────────────────────────────────────────────────────────────
// ReconciliationPanel.jsx
//
// Does quantity_on_hand still equal the sum of stock_movements?
//
// It should, for every product, because adjustStock writes both in one
// transaction. A row here means something wrote a balance without
// writing the ledger — which is precisely what donation intake did
// until it was routed through adjustStock.
//
// The empty state is the point of this screen, so it is written as a
// result rather than as an absence.
// ─────────────────────────────────────────────────────────────
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const fmt = (n) => (Math.round(Number(n) * 1000) / 1000).toLocaleString("en-ZA");

export default function ReconciliationPanel({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  const products  = data?.products ?? [];
  const variances = data?.variances ?? [];

  if (variances.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm font-medium">
          Every balance matches its ledger.
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
          All {products.length} product{products.length === 1 ? "" : "s"} with stock
          history reconcile: what the system says is on hand is exactly the sum of
          every movement recorded against it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[#ef3a40] bg-[#fff4f2] px-4 py-3">
        <p className="text-sm font-medium text-[#ef3a40]">
          {variances.length} product{variances.length === 1 ? "" : "s"} out of balance
        </p>
        <p className="mt-1 text-xs text-[#8a2a2e]">
          The quantity on hand does not equal the sum of recorded movements. Something
          changed a balance without writing to the ledger — start with the most recent
          movements for these products.
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="w-[110px]">SKU</TableHead>
              <TableHead className="w-[120px] text-right">On hand</TableHead>
              <TableHead className="w-[120px] text-right">Ledger sum</TableHead>
              <TableHead className="w-[120px] text-right">Variance</TableHead>
              <TableHead className="w-[110px] text-right">Movements</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variances.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-[240px] truncate font-medium" title={r.name}>
                  {r.name}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.sku}</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmt(r.balance)} {r.unit}</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmt(r.ledgerSum)}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="border-[#ef3a40] font-mono text-[#ef3a40]">
                    {r.variance > 0 ? "+" : ""}{fmt(r.variance)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {r.movementCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
""", "ReconciliationPanel.jsx")

# ══════════════════════════════════════════════════════════════
print("7  client page")
# ══════════════════════════════════════════════════════════════

write_file('client/src/pages/StockLedgerPage.jsx', """// ─────────────────────────────────────────────────────────────
// StockLedgerPage.jsx
//
// The manager's view of stock_movements.
//
// The inventory screen answers "what do we have". This answers "how
// did it get that way", which is the question that comes up when the
// shelf and the system disagree — and, on the reconciliation tab,
// whether they disagree at all.
//
// Manager and admin only (mirrored by requireRole on all three
// /api/stock/ledger routes). Warehouse staff keep the per-product
// history drawer on the inventory screen.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Layers, Scale } from "lucide-react";

import StatTile from "../features/taskdashboard/components/StatTile";
import LedgerTable from "../features/InventoryManagement/components/LedgerTable";
import ReconciliationPanel from "../features/InventoryManagement/components/ReconciliationPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLedger, getReconciliation, getLedgerActors, getManifest } from "../services/stockAPI";

// Kept in step with server/src/constants/movementTypes.js. 'picked' is
// omitted: it is never written (stock is deducted at the dispatch
// gate, not at packing), so offering it as a filter would only ever
// return nothing.
const TYPES = [
  { value: "received",   label: "Received" },
  { value: "donated",    label: "Donation" },
  { value: "dispatched", label: "Dispatched" },
  { value: "wastage",    label: "Wastage" },
  { value: "adjustment", label: "Adjustment" },
  { value: "decanted",   label: "Decanting" },
];

const RANGES = [
  { value: "7",   label: "Last 7 days" },
  { value: "30",  label: "Last 30 days" },
  { value: "90",  label: "Last 90 days" },
  { value: "all", label: "All time" },
];

// SAST, matching the server's filter. Building this from the local
// clock would put a manager in another timezone a day out of step
// with the rows they are looking at.
const sastToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const rangeToFrom = (range) => {
  if (range === "all") return null;
  const today = new Date(`${sastToday()}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - Number(range));
  return today.toISOString().slice(0, 10);
};

const fmtQty = (n) => (Math.round(Number(n) * 1000) / 1000).toLocaleString("en-ZA");

export default function StockLedgerPage() {
  const [tab, setTab] = useState("movements");

  const [range, setRange] = useState("30");
  const [productId, setProductId] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [types, setTypes] = useState([]);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaging, setIsPaging] = useState(false);
  const [error, setError] = useState(null);

  const [products, setProducts] = useState([]);
  const [actors, setActors] = useState([]);

  const [recon, setRecon] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState(null);

  // ── Filter options ─────────────────────────────────────────
  // Failures here are swallowed on purpose: an empty product dropdown
  // is a degraded filter bar, not a broken page, and the ledger
  // itself still loads.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getManifest(), getLedgerActors()])
      .then(([manifest, people]) => {
        if (cancelled) return;
        setProducts(manifest);
        setActors(people);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const filters = useCallback(() => ({
    from: rangeToFrom(range),
    productId: productId || null,
    performedBy: performedBy || null,
    movementTypes: types,
  }), [range, productId, performedBy, types]);

  // ── First page, and every refetch when a filter changes ────
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getLedger({ ...filters(), limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setRows(res.movements);
        setSummary(res.summary);
        setNextCursor(res.nextCursor);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load the stock ledger.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [filters]);

  // ── Reconciliation, loaded when its tab is first opened ────
  //
  // The guard is a ref, and the effect depends on `tab` alone.
  //
  // Writing this the obvious way — deps [tab, recon, reconLoading],
  // with a `cancelled` flag — deadlocks: setReconLoading(true) changes
  // a dependency, so the effect re-runs, its cleanup sets cancelled on
  // the closure that owns the in-flight request, and when that request
  // resolves every state setter is skipped. The tab then shows a
  // skeleton forever. A ref is not a dependency, so nothing re-runs.
  //
  // No cancelled flag: this page does not unmount while its own tab
  // button is being clicked, and a state set after unmount is a no-op.
  const reconRequested = useRef(false);

  useEffect(() => {
    if (tab !== "reconciliation" || reconRequested.current) return;
    reconRequested.current = true;
    setReconLoading(true);

    getReconciliation()
      .then((res) => { setRecon(res); setReconError(null); })
      .catch((err) => {
        setReconError(err.message || "Could not reconcile balances.");
        // Let a tab switch retry a failed load rather than leaving the
        // manager on an error with no way back to the data.
        reconRequested.current = false;
      })
      .finally(() => setReconLoading(false));
  }, [tab]);

  const loadMore = async () => {
    if (!nextCursor || isPaging) return;
    setIsPaging(true);
    try {
      const res = await getLedger({ ...filters(), limit: 50, cursor: nextCursor });
      setRows((prev) => [...prev, ...res.movements]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err.message || "Could not load more movements.");
    } finally {
      setIsPaging(false);
    }
  };

  const toggleType = (value) => {
    setTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
  };

  const resetFilters = () => {
    setRange("30");
    setProductId("");
    setPerformedBy("");
    setTypes([]);
  };

  const filtersActive = range !== "30" || productId || performedBy || types.length > 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Stock ledger</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every movement of stock through the warehouse, and whether the balances
          still add up.
        </p>
      </header>

      {/* Tabs — two buttons rather than a tab primitive, since there
          is no Tabs component in components/ui and two states do not
          justify adding one. */}
      <div className="flex gap-1 border-b">
        {[
          { id: "movements", label: "Movements" },
          { id: "reconciliation", label: "Reconciliation" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-[#ef3a40] text-[#ef3a40]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "movements" && (
        <>
          {/* ── Filters ─────────────────────────────────────── */}
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <label className="flex flex-col gap-1 text-xs font-medium">
                Period
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  {RANGES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium">
                Product
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="h-9 max-w-[220px] rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">All products</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium">
                Recorded by
                <select
                  value={performedBy}
                  onChange={(e) => setPerformedBy(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Anyone</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col gap-1 text-xs font-medium">
                Movement type
                <div className="flex flex-wrap gap-1">
                  {TYPES.map((t) => {
                    const on = types.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleType(t.value)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          on
                            ? "border-[#ef3a40] bg-[#fff4f2] text-[#ef3a40]"
                            : "border-input text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Reset
                </Button>
              )}
            </CardContent>
          </Card>

          {/* ── Summary ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={ArrowUpRight} label="Stock in"
                      value={summary ? fmtQty(summary.totalIn) : "—"} />
            <StatTile icon={ArrowDownLeft} label="Stock out"
                      value={summary ? fmtQty(Math.abs(summary.totalOut)) : "—"} />
            <StatTile icon={Scale} label="Net change"
                      value={summary ? fmtQty(summary.netChange) : "—"} />
            <StatTile icon={Layers} label="Movements"
                      value={summary ? summary.movementCount : "—"} />
          </div>

          {error && (
            <div className="rounded-md border border-[#ef3a40] bg-[#fff4f2] px-4 py-3 text-sm text-[#ef3a40]">
              {error}
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <LedgerTable rows={rows} isLoading={isLoading} />
            </CardContent>
          </Card>

          {nextCursor && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={isPaging}>
                {isPaging ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      {tab === "reconciliation" && (
        <>
          {reconError && (
            <div className="rounded-md border border-[#ef3a40] bg-[#fff4f2] px-4 py-3 text-sm text-[#ef3a40]">
              {reconError}
            </div>
          )}
          <Card>
            <CardContent className="p-4">
              <ReconciliationPanel data={recon} isLoading={reconLoading} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
""", "StockLedgerPage.jsx")

# ══════════════════════════════════════════════════════════════
print("8  routing and navigation")
# ══════════════════════════════════════════════════════════════

# Anchored on the one line, not on the object's closing brace — #55
# added communityRequests after documents and more will follow.
patch('client/src/routes/paths.js',
"""  documents: '/noc/documents',""",
"""  documents: '/noc/documents',
  // Manager-only. All three /api/stock/ledger routes are
  // requireRole(MANAGER, ADMIN); the App.jsx gate mirrors that. The
  // per-product history drawer on the inventory screen stays open to
  // every role — this is the warehouse-wide, supervisory view.
  stockLedger: '/noc/stock-ledger',""",
"paths: STAFF.stockLedger")

# Anchored on the closing line alone — #55 added PhoneCall to this list
# and the next feature will add another icon above it.
patch('client/src/features/taskdashboard/components/navSections.js',
"""
} from 'lucide-react';""",
"""
  ScrollText,
} from 'lucide-react';""",
"navSections: import ScrollText")

patch('client/src/features/taskdashboard/components/navSections.js',
"""    label: 'Insights',
    items: [
      { to: STAFF.reporting, label: 'Reporting', icon: BarChart3 },
      { to: STAFF.impactReport, label: 'Impact Report', icon: HeartHandshake },
    ],
  },
];""",
"""    label: 'Insights',
    items: [
      { to: STAFF.stockLedger, label: 'Stock Ledger', icon: ScrollText },
      { to: STAFF.reporting, label: 'Reporting', icon: BarChart3 },
      { to: STAFF.impactReport, label: 'Impact Report', icon: HeartHandshake },
    ],
  },
];""",
"manager nav: Stock Ledger under Insights")

patch('client/src/App.jsx',
"""        <Route path="/noc/inventory" element={<InventoryManagementPage />} />""",
"""        <Route path="/noc/inventory" element={<InventoryManagementPage />} />
          {/* The warehouse-wide ledger. Manager/admin only, matching
              requireRole(MANAGERS_UP) on all three /api/stock/ledger
              routes — warehouse staff reach movement history through
              the per-product drawer on the inventory screen. */}
          <Route path={STAFF.stockLedger} element={<StockLedgerPage />} />""",
"App.jsx: /noc/stock-ledger route")

patch('client/src/App.jsx',
"""import ManagerDashboardPage                         from './pages/ManagerDashboardPage';""",
"""import ManagerDashboardPage                         from './pages/ManagerDashboardPage';
import StockLedgerPage                               from './pages/StockLedgerPage';""",
"App.jsx: import StockLedgerPage")

# ══════════════════════════════════════════════════════════════
print("9  tests")
# ══════════════════════════════════════════════════════════════

write_file('server/__tests__/stock.ledger.test.js', """// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.ledger.test.js
//
// The service layer of the stock ledger: filter parsing, cursor
// round-tripping, and the shape handed to the repository.
//
// The repository is mocked, so this does not prove the SQL — that was
// verified against a real Postgres 16 instance, which is the only
// thing that can prove a window function or a keyset comparison. What
// this locks down is everything between the query string and the
// repository call, which is where the parsing bugs live.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = {
  getLedger:         vi.fn(),
  getLedgerSummary:  vi.fn(),
  getReconciliation: vi.fn(),
  getLedgerActors:   vi.fn(),
  getManifest:       vi.fn(),
  getMovements:      vi.fn(),
  manualAdjust:      vi.fn(),
};

vi.mock('../src/repositories/stock.repository.js', () => ({ default: repoMock }));

const { default: stockService } = await import('../src/services/stock.service.js');

const EMPTY_SUMMARY = {
  total_in: '0', total_out: '0', net_change: '0',
  movement_count: 0, product_count: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getLedger.mockResolvedValue({ rows: [], nextCursor: null });
  repoMock.getLedgerSummary.mockResolvedValue(EMPTY_SUMMARY);
});

describe('stockService.getLedger — filters', () => {
  it('defaults to a 50-row page with no filters', async () => {
    await stockService.getLedger({});
    const args = repoMock.getLedger.mock.calls[0][0];
    expect(args.limit).toBe(50);
    expect(args.cursor).toBeNull();
    expect(args.movementTypes).toEqual([]);
  });

  it('accepts movement types as a comma-separated string', async () => {
    await stockService.getLedger({ movementType: 'wastage,received' });
    expect(repoMock.getLedger.mock.calls[0][0].movementTypes).toEqual(['wastage', 'received']);
  });

  it('accepts movement types as a repeated query parameter', async () => {
    await stockService.getLedger({ movementType: ['wastage', 'dispatched'] });
    expect(repoMock.getLedger.mock.calls[0][0].movementTypes).toEqual(['wastage', 'dispatched']);
  });

  it('rejects a movement type that is not in the constraint', async () => {
    await expect(stockService.getLedger({ movementType: 'stolen' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a date that is not a calendar date', async () => {
    await expect(stockService.getLedger({ from: '09/09/2026' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('passes calendar dates through unparsed, so no timezone shift can occur', async () => {
    await stockService.getLedger({ from: '2026-09-01', to: '2026-09-09' });
    const args = repoMock.getLedger.mock.calls[0][0];
    expect(args.from).toBe('2026-09-01');
    expect(args.to).toBe('2026-09-09');
  });

  it('rejects a start date after the end date', async () => {
    await expect(stockService.getLedger({ from: '2026-09-09', to: '2026-09-01' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a limit above the maximum', async () => {
    await expect(stockService.getLedger({ limit: '5000' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a non-integer product id', async () => {
    await expect(stockService.getLedger({ productId: 'rice' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('never sends the cursor or limit to the summary query', async () => {
    await stockService.getLedger({ limit: '10', movementType: 'wastage' });
    const summaryArgs = repoMock.getLedgerSummary.mock.calls[0][0];
    expect(summaryArgs).not.toHaveProperty('cursor');
    expect(summaryArgs).not.toHaveProperty('limit');
    expect(summaryArgs.movementTypes).toEqual(['wastage']);
  });
});

describe('stockService.getLedger — cursor', () => {
  it('round-trips a cursor back to the keyset it encodes', async () => {
    const createdAt = '2026-09-07T07:00:00.000Z';
    repoMock.getLedger.mockResolvedValue({
      rows: [], nextCursor: { createdAt, id: 42 },
    });

    const first = await stockService.getLedger({});
    expect(first.nextCursor).toBeTypeOf('string');

    await stockService.getLedger({ cursor: first.nextCursor });
    expect(repoMock.getLedger.mock.calls[1][0].cursor).toEqual({ createdAt, id: 42 });
  });

  it('returns a null cursor when there is no further page', async () => {
    const res = await stockService.getLedger({});
    expect(res.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor rather than paging from the start', async () => {
    const bad = Buffer.from('not-a-date|nope', 'utf8').toString('base64');
    await expect(stockService.getLedger({ cursor: bad }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('stockService.getReconciliation', () => {
  it('splits out the products that do not balance', async () => {
    repoMock.getReconciliation.mockResolvedValue([
      { id: 1, name: 'Rice',     variance: '0'  },
      { id: 2, name: 'Pilchards', variance: '40' },
      { id: 3, name: 'Maize',    variance: '0'  },
    ]);

    const res = await stockService.getReconciliation();
    expect(res.products).toHaveLength(3);
    expect(res.variances).toHaveLength(1);
    expect(res.variances[0].name).toBe('Pilchards');
  });

  it('reports no variances when every balance matches', async () => {
    repoMock.getReconciliation.mockResolvedValue([
      { id: 1, name: 'Rice', variance: '0' },
    ]);
    const res = await stockService.getReconciliation();
    expect(res.variances).toEqual([]);
  });

  it('treats a numeric-string zero as balanced, not as truthy', async () => {
    // node-postgres returns NUMERIC as a string: '0' is truthy in JS,
    // so a filter written as `r.variance` rather than
    // `Number(r.variance) !== 0` would report every product as broken.
    repoMock.getReconciliation.mockResolvedValue([
      { id: 1, name: 'Rice',  variance: '0.000' },
      { id: 2, name: 'Maize', variance: '-0'    },
    ]);
    const res = await stockService.getReconciliation();
    expect(res.variances).toEqual([]);
  });
});
""", "server/__tests__/stock.ledger.test.js")

write_file('client/src/tests/StockLedgerPage.test.jsx', """// ─────────────────────────────────────────────────────────────
// StockLedgerPage.test.jsx
//
// The page's wiring: does it ask the API for what the filter bar
// says, and does it render what comes back.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const api = {
  getLedger:        vi.fn(),
  getReconciliation: vi.fn(),
  getLedgerActors:  vi.fn(),
  getManifest:      vi.fn(),
};

vi.mock('../services/stockAPI', () => api);

const { default: StockLedgerPage } = await import('../pages/StockLedgerPage');

const MOVEMENT = {
  id: 7,
  productId: 3,
  productName: 'Maize Meal',
  sku: 'MAIZE-5',
  quantity: -5,
  balanceAfter: 55,
  unit: 'kg',
  movementType: 'wastage',
  referenceType: 'manual_adjustment',
  referenceId: null,
  reason: 'Damaged / spoiled',
  performedByName: 'Alessio',
  createdAt: '2026-09-09T21:30:00.000Z',
};

const SUMMARY = {
  totalIn: 510, totalOut: -35, netChange: 475,
  movementCount: 7, productCount: 3,
};

const renderPage = () =>
  render(<MemoryRouter><StockLedgerPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getLedger.mockResolvedValue({ movements: [MOVEMENT], summary: SUMMARY, nextCursor: null });
  api.getReconciliation.mockResolvedValue({ products: [], variances: [] });
  api.getLedgerActors.mockResolvedValue([{ id: 2, name: 'Alessio' }]);
  api.getManifest.mockResolvedValue([{ id: 3, name: 'Maize Meal' }]);
});

// The product name appears twice on screen — once in the filter
// dropdown, once in the table — so "has the page loaded" is asserted
// on the reason cell, which only the row has. A bare
// getByText('Maize Meal') matches both and throws.
const rowLoaded = () => screen.findByText('Damaged / spoiled');

describe('StockLedgerPage', () => {
  it('renders a movement row with its running balance', async () => {
    renderPage();
    await rowLoaded();
    expect(screen.getByRole('cell', { name: 'Maize Meal' })).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
  });

  it('shows stock out as a positive magnitude, not a minus figure', async () => {
    renderPage();
    // -35 in the ledger is 35 units of stock leaving; showing "-35"
    // under a label that already says "out" reads as a double negative.
    expect(await screen.findByText('35')).toBeInTheDocument();
  });

  it('defaults to the last 30 days', async () => {
    renderPage();
    await waitFor(() => expect(api.getLedger).toHaveBeenCalled());
    const args = api.getLedger.mock.calls[0][0];
    expect(args.from).toMatch(/^\\d{4}-\\d{2}-\\d{2}$/);
    expect(args.movementTypes).toEqual([]);
  });

  it('refetches with the type filter when a chip is pressed', async () => {
    renderPage();
    await rowLoaded();

    await userEvent.click(screen.getByRole('button', { name: 'Wastage' }));

    await waitFor(() => {
      const last = api.getLedger.mock.calls.at(-1)[0];
      expect(last.movementTypes).toEqual(['wastage']);
    });
  });

  it('drops the date filter entirely when the period is All time', async () => {
    renderPage();
    await rowLoaded();

    await userEvent.selectOptions(screen.getByLabelText(/Period/i), 'all');

    await waitFor(() => {
      expect(api.getLedger.mock.calls.at(-1)[0].from).toBeNull();
    });
  });

  it('loads reconciliation only once its tab is opened', async () => {
    renderPage();
    await rowLoaded();
    expect(api.getReconciliation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Reconciliation' }));

    await waitFor(() => expect(api.getReconciliation).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Every balance matches its ledger/i)).toBeInTheDocument();
  });

  it('names the products that do not balance', async () => {
    api.getReconciliation.mockResolvedValue({
      products: [{ id: 2, name: 'Tinned Pilchards', sku: 'FISH-400', unit: 'unit',
                   balance: 340, ledgerSum: 300, variance: 40, movementCount: 1 }],
      variances: [{ id: 2, name: 'Tinned Pilchards', sku: 'FISH-400', unit: 'unit',
                    balance: 340, ledgerSum: 300, variance: 40, movementCount: 1 }],
    });

    renderPage();
    await rowLoaded();
    await userEvent.click(screen.getByRole('button', { name: 'Reconciliation' }));

    expect(await screen.findByText('Tinned Pilchards')).toBeInTheDocument();
    expect(screen.getByText(/1 product out of balance/i)).toBeInTheDocument();
  });

  it('surfaces a load failure without blanking the page', async () => {
    api.getLedger.mockRejectedValue(new Error('Ledger unavailable'));
    renderPage();
    expect(await screen.findByText('Ledger unavailable')).toBeInTheDocument();
    expect(screen.getByText('Stock ledger')).toBeInTheDocument();
  });
});
""", "client/src/tests/StockLedgerPage.test.jsx")

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
echo "Script 16 done. No migration needed."
echo ""
echo "Verify:"
echo "  cd client && npm run lint && npm run build && npm test"
echo "  cd ../server && npm test"
echo ""
echo "Then open /noc/stock-ledger as a manager. The Reconciliation tab"
echo "should say every balance matches — if it names a product, something"
echo "is still writing stock_levels without writing the ledger."
echo "─────────────────────────────────────────────────────────────"
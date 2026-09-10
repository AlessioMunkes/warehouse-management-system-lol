// ─────────────────────────────────────────────────────────────
// server/src/repositories/stock.repository.js
//
// All SQL for the stock module.
// adjustStock is the single write path for every change to
// quantity_on_hand — procurement, picking, and manual adjustments
// all go through it, so there's exactly one place that can get
// the arithmetic wrong.
// ─────────────────────────────────────────────────────────────
import pool                  from '../config/db.js';
import { committedStockSql } from './committedStock.sql.js';

// ── Adjust stock — the single write path for every stock change ──
// Must be called with a client already inside BEGIN/COMMIT — either
// its own (see manualAdjust below) or one borrowed from another
// repository's transaction (see picking.repository.js completeSlip).
//
// Locks the product's stock_levels row before writing, so concurrent
// callers touching the same product serialize instead of racing.
// Callers touching multiple products should lock them in product_id
// order (see completeSlip) to avoid deadlocking against other
// transactions doing the same.
//
// Never blocks or throws on a negative result — quantity_on_hand can
// go below zero, and the caller decides what to do with isShortfall.
// Similarly, if the caller's unit doesn't match the unit already on
// record for this product, the movement still goes through — the
// ledger's established unit wins so the running total never silently
// drifts between units — but isUnitMismatch comes back so the caller
// can surface it. quantity_on_hand is NUMERIC, which node-postgres
// returns as a string, not a number — every value read back off it
// gets an explicit Number() cast below.
const adjustStock = async (client, { productId, quantityDelta, unit = null, movementType, referenceType = null, referenceId = null, reason = null, performedBy }) => {
  // ── Guard the delta before anything touches the database ──────
  // This is the single write path for stock, and it is called directly
  // by picking and procurement, not only through stock.service.js — so
  // the validation has to live here, not in the service.
  //
  // Number(undefined) is NaN. Without this guard: after = NaN, the
  // `NaN < 0` shortfall test is false so nothing is flagged, and
  // Postgres NUMERIC *accepts* 'NaN' — it even sorts NaN as greater
  // than every real value. The product's balance is then permanently
  // NaN, because NaN + anything is NaN.
  // null/undefined/'' are caller bugs, not a legitimate zero — and
  // Number() quietly turns all three into 0, so they must be caught
  // before the isFinite check rather than by it.
  if (quantityDelta === null || quantityDelta === undefined || quantityDelta === '') {
    throw new Error('Stock adjustment quantity must be a finite number (received: no value).');
  }

  const delta = Number(quantityDelta);
  if (!Number.isFinite(delta)) {
    throw new Error(`Stock adjustment quantity must be a finite number (received: ${quantityDelta}).`);
  }
  if (!Number.isInteger(Number(productId)) || Number(productId) <= 0) {
    throw new Error(`Stock adjustment requires a valid product id (received: ${productId}).`);
  }

  const existing = await client.query(
    `SELECT quantity_on_hand, unit FROM stock_levels WHERE product_id = $1 FOR UPDATE`,
    [productId]
  );

  let before, resolvedUnit;
  let isUnitMismatch = false;

  if (existing.rows[0]) {
    before = Number(existing.rows[0].quantity_on_hand);
    resolvedUnit = existing.rows[0].unit;
    if (unit && unit !== resolvedUnit) isUnitMismatch = true;
  } else {
    if (!unit) throw new Error("Unit is required for a product's first stock movement.");
    before = 0;
    resolvedUnit = unit;
    await client.query(
      `INSERT INTO stock_levels (product_id, quantity_on_hand, unit) VALUES ($1, 0, $2)`,
      [productId, unit]
    );
  }

  // ── Let Postgres do the sum ───────────────────────────────────
  // quantity_on_hand is NUMERIC precisely so decimal arithmetic is
  // exact. Computing `before + delta` in JavaScript and writing the
  // result back threw that away: JS numbers are binary floats, so
  // 0.1 + 0.2 stored 0.30000000000000004, and over a season of
  // decanting movements the balance drifted away from the sum of the
  // ledger. Adding in SQL and reading the stored value back with
  // RETURNING keeps the balance exact and makes the ledger and the
  // balance reconcilable.
  //
  // The row is already locked by the SELECT ... FOR UPDATE above, so
  // this read-modify-write is still safe against a concurrent caller.
  const updated = await client.query(
    `UPDATE stock_levels
     SET quantity_on_hand = quantity_on_hand + $1::numeric,
         updated_at       = NOW()
     WHERE product_id = $2
     RETURNING quantity_on_hand`,
    [delta, productId]
  );

  // One conversion of the stored value for the caller to report on —
  // not an accumulating calculation, so no error compounds here.
  const after = Number(updated.rows[0].quantity_on_hand);

  await client.query(
    `INSERT INTO stock_movements
       (product_id, quantity, unit, movement_type, reference_type, reference_id, reason, performed_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [productId, delta, resolvedUnit, movementType, referenceType, referenceId, reason, performedBy]
  );

  return { before, after, isShortfall: after < 0, isUnitMismatch };
};

// ── Which movement type is a manual adjustment? ───────────────
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

// ── Manual adjustment ─────────────────────────────────────────
// Entry point for the inventory management screen. Opens its own
// transaction — unlike adjustStock, this isn't nested inside another
// repository's write, so it manages BEGIN/COMMIT itself, the same
// way createDelivery and completeSlip do.
const manualAdjust = async ({ productId, quantityDelta, unit, reason, performedBy }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productCheck = await client.query(
      `SELECT id FROM products WHERE id = $1 AND is_active = true`,
      [productId]
    );
    if (!productCheck.rows[0]) { await client.query('ROLLBACK'); return { productNotFound: true }; }

    const outcome = await adjustStock(client, {
      productId, quantityDelta, unit,
      movementType:  movementTypeForReason(reason),
      referenceType: 'manual_adjustment',
      reason, performedBy,
    });

    await client.query('COMMIT');
    return outcome;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Manifest — current levels for the overview screen ─────────
// is_shortfall / is_low_stock are computed here rather than in the
// UI so every screen that reads the manifest gets the same badges.
//
// COMMITTED STOCK IS PART OF THE ANSWER.
// committedStock.sql.js names three call sites that need its exact
// definition — the packing availability check, the dispatch gate
// view, and this manifest. This one did not import it, which is
// precisely the disagreement that file exists to prevent: packing
// refused to commit rice it could see the manifest promising, because
// the manifest was counting pallets that were already built and
// standing in the staging area waiting for a driver.
//
//   quantity_on_hand — what is physically inside the building
//   committed        — packed, closed, not yet collected
//   available        — what a packer can still allocate
//
// The badges are derived from AVAILABLE, not on hand, because "can I
// still promise this to an ECD?" is the question the inventory screen
// is actually asked. Nothing is lost by the change: committed can
// never be negative, so available <= quantity_on_hand always, and a
// ledger that has genuinely gone below zero still trips is_shortfall.
//
// All three come back as NUMERIC, which node-postgres returns as
// STRINGS — see the Number() casts in client/src/services/stockAPI.js.
const getManifest = async () => {
  const result = await pool.query(
    `SELECT
       p.id, p.name, p.stock_keeping_unit AS sku,
       COALESCE(sl.quantity_on_hand, 0)::numeric AS quantity_on_hand,
       COALESCE(c.committed, 0)::numeric         AS committed,
       (COALESCE(sl.quantity_on_hand, 0) - COALESCE(c.committed, 0))::numeric AS available,
       COALESCE(sl.unit, '')                     AS unit,
       COALESCE(sl.reorder_threshold, 0)         AS reorder_threshold,
       (COALESCE(sl.quantity_on_hand, 0) - COALESCE(c.committed, 0)) < 0
         AS is_shortfall,
       (COALESCE(sl.quantity_on_hand, 0) - COALESCE(c.committed, 0))
         <= COALESCE(sl.reorder_threshold, 0)
         AS is_low_stock,
       sl.updated_at
     FROM products p
     LEFT JOIN stock_levels sl ON sl.product_id = p.id
     LEFT JOIN (${committedStockSql()}) c ON c.product_id = p.id
     WHERE p.is_active = true
     ORDER BY p.name ASC`
  );
  return result.rows;
};

// ── Movement history for one product ───────────────────────────
const getMovements = async (productId) => {
  const result = await pool.query(
    `SELECT sm.*, u.first_name AS performed_by_name
     FROM stock_movements sm
     LEFT JOIN users u ON u.id = sm.performed_by
     WHERE sm.product_id = $1
     ORDER BY sm.created_at DESC`,
    [productId]
  );
  return result.rows;
};

// ── Stock metadata — unit and reorder threshold ────────────────
// The catalogue's write path into stock_levels. It lives here rather
// than in product.repository.js for the same reason adjustStock does:
// every statement that touches stock_levels or stock_movements is in
// this file, so there is one place to look when the numbers are wrong.
// product.repository.js calls it with its own transaction client, the
// way delivery.repository.js and picking.repository.js call adjustStock.
//
// THIS IS NOT A STOCK MOVEMENT.
// It changes what the balance is measured in and when to reorder it —
// never the balance itself. quantity_on_hand is untouched on both
// branches below, and nothing is written to stock_movements: a
// zero-quantity ledger row to record a threshold edit would be noise
// in the one table that is supposed to reconcile against the balance.
// Quantities still change only through adjustStock.
//
// TWO UNIT ARGUMENTS, ON PURPOSE.
// stock_levels.unit is NOT NULL and a product may have no row yet, so
// creating one needs a unit whether or not the caller is changing it —
// that is `seedUnit`, used only by the INSERT. `unit` is the separate
// "change it to this" instruction, used only by the UPDATE. Collapsing
// them into one argument means editing a reorder threshold quietly
// rewrites the unit the ledger has been accumulating in, which is
// exactly the silent drift adjustStock's isUnitMismatch exists to
// catch. Pass unit: null to leave it alone.
//
// Callers must validate both units against STOCK_UNITS first —
// stock_levels_unit_check allows nine values and rejects the rest as a
// 23514 mid-transaction.
const setStockMeta = async (client, { productId, seedUnit, unit = null, reorderThreshold = null }) => {
  if (!client) {
    throw new Error('setStockMeta requires the caller\'s transaction client.');
  }
  if (!seedUnit) {
    throw new Error('setStockMeta requires a seed unit — stock_levels.unit is NOT NULL.');
  }

  const { rows } = await client.query(
    `INSERT INTO stock_levels (product_id, quantity_on_hand, unit, reorder_threshold, updated_at)
     VALUES ($1, 0, $2, COALESCE($3::numeric, 0), NOW())
     ON CONFLICT (product_id) DO UPDATE
       SET unit              = COALESCE($4::varchar, stock_levels.unit),
           reorder_threshold = COALESCE($3::numeric, stock_levels.reorder_threshold),
           updated_at        = NOW()
     RETURNING product_id, quantity_on_hand, unit, reorder_threshold, updated_at`,
    [productId, seedUnit, reorderThreshold, unit]
  );
  return rows[0];
};

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
// ── 30-day stock level trace, for the inventory sparklines ─────
//
// One row per product per day: what the balance was at the END of
// that day, for every day in the window.
//
// THE PRE-WINDOW BALANCE HAS TO CARRY IN.
// `closing` walks the product's ENTIRE movement history, not just the
// window, so a product whose last movement was two months ago still
// plots its real balance as a flat line rather than starting from
// zero. Restricting the window before the window function — the
// obvious way to write this — draws every long-settled product as a
// step up from nothing on the first day of the chart.
//
// Days with no movement inherit the last known closing balance. That
// is the correlated subquery at the bottom: for each (product, day),
// the most recent closing on or before that day. It runs
// products x days times, which at this warehouse (tens of products,
// 30 days) is a few hundred index lookups and costs nothing. If the
// catalogue ever grows into the thousands, the fix is a lateral join
// or a materialised daily balance — not dropping the carry-in.
//
// Products that have never had a movement are excluded rather than
// returned as a flat zero line: thirty rows saying nothing happened
// is not information, and the client renders those as a dash.
const getStockTrends = async ({ days = 30 } = {}) => {
  const result = await pool.query(
    `WITH bounds AS (
       SELECT ((now() AT TIME ZONE 'Africa/Johannesburg')::date - ($1::int - 1)) AS from_day,
              (now() AT TIME ZONE 'Africa/Johannesburg')::date                    AS to_day
     ),
     daily AS (
       SELECT sm.product_id,
              (sm.created_at AT TIME ZONE 'Africa/Johannesburg')::date AS day,
              SUM(sm.quantity)::numeric                                AS net
       FROM stock_movements sm
       GROUP BY 1, 2
     ),
     closing AS (
       SELECT product_id, day,
              SUM(net) OVER (PARTITION BY product_id
                             ORDER BY day
                             ROWS UNBOUNDED PRECEDING) AS balance
       FROM daily
     ),
     series AS (
       SELECT p.id AS product_id, d.day::date AS day
       FROM products p
       CROSS JOIN bounds b
       CROSS JOIN LATERAL generate_series(b.from_day, b.to_day, INTERVAL '1 day') AS d(day)
       WHERE p.is_active = true
         AND EXISTS (SELECT 1 FROM daily dd WHERE dd.product_id = p.id)
     )
     SELECT s.product_id,
            s.day,
            COALESCE((
              SELECT c.balance
              FROM closing c
              WHERE c.product_id = s.product_id AND c.day <= s.day
              ORDER BY c.day DESC
              LIMIT 1
            ), 0)::numeric AS balance
     FROM series s
     ORDER BY s.product_id, s.day`,
    [days],
  );
  return result.rows;
};

export default {
  getStockTrends,
  getLedger, getLedgerSummary, getReconciliation, getLedgerActors,
  adjustStock, manualAdjust, getManifest, getMovements, setStockMeta };
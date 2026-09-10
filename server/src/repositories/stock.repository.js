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
      productId, quantityDelta, unit, movementType: 'adjustment', referenceType: 'manual_adjustment', reason, performedBy,
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

export default { adjustStock, manualAdjust, getManifest, getMovements, setStockMeta };
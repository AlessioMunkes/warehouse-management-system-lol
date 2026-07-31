// ─────────────────────────────────────────────────────────────
// server/src/repositories/stock.repository.js
//
// All SQL for the stock module.
// adjustStock is the single write path for every change to
// quantity_on_hand — procurement, picking, and manual adjustments
// all go through it, so there's exactly one place that can get
// the arithmetic wrong.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

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

  const after = before + delta;

  await client.query(
    `UPDATE stock_levels
     SET quantity_on_hand = $1, updated_at = NOW()
     WHERE product_id = $2`,
    [after, productId]
  );

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
const getManifest = async () => {
  const result = await pool.query(
    `SELECT
       p.id, p.name, p.stock_keeping_unit AS sku,
       COALESCE(sl.quantity_on_hand, 0)   AS quantity_on_hand,
       COALESCE(sl.unit, '')              AS unit,
       COALESCE(sl.reorder_threshold, 0)  AS reorder_threshold,
       COALESCE(sl.quantity_on_hand, 0) < 0                                  AS is_shortfall,
       COALESCE(sl.quantity_on_hand, 0) <= COALESCE(sl.reorder_threshold, 0) AS is_low_stock,
       sl.updated_at
     FROM products p
     LEFT JOIN stock_levels sl ON sl.product_id = p.id
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

export default { adjustStock, manualAdjust, getManifest, getMovements };
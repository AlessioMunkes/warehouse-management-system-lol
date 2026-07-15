// ─────────────────────────────────────────────────────────────
// server/src/repositories/packing.repository.js
//
// All SQL for the packing module.
// No business logic here — only database queries.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// ── Audit helper (used inside existing transactions) ──────────
const logEvent = async (client, slipId, eventType, actorId, detail = null) => {
  await client.query(
    `INSERT INTO packing_events (packing_slip_id, event_type, actor_id, detail)
     VALUES ($1, $2, $3, $4)`,
    [slipId, eventType, actorId, detail]
  );
};

// ── List slips for a dispatch day ─────────────────────────────
// Progress is computed in SQL so the board doesn't need N+1 queries.
const getSlips = async ({ dispatchDate, cohort, status, assignedTo }) => {
  const params = [];
  const where  = [];

  if (dispatchDate) { params.push(dispatchDate); where.push(`ps.dispatch_date = $${params.length}`); }
  if (cohort)       { params.push(cohort);       where.push(`ps.cohort = $${params.length}`); }
  if (status)       { params.push(status);       where.push(`ps.status = $${params.length}`); }
  if (assignedTo)   { params.push(assignedTo);   where.push(`ps.assigned_to = $${params.length}`); }

  const result = await pool.query(
    `SELECT
       ps.id,
       ps.dispatch_date,
       ps.cohort,
       ps.pallet_ref,
       ps.status,
       ps.assigned_to,
       e.name       AS ecd_name,
       e.child_count,
       u.first_name AS packer_name,
       COUNT(psi.id)                                          AS total_items,
       COUNT(psi.id) FILTER (WHERE psi.status = 'confirmed')  AS confirmed_items,
       COUNT(psi.id) FILTER (WHERE psi.status = 'flagged')    AS flagged_items
     FROM packing_slips ps
     JOIN ecd_centres e ON e.id = ps.ecd_id
     LEFT JOIN users u ON u.id = ps.assigned_to
     LEFT JOIN packing_slip_items psi ON psi.packing_slip_id = ps.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY ps.id, e.name, e.child_count, u.first_name
     ORDER BY e.name ASC`,
    params
  );

  return result.rows;
};

// ── One slip with its lines ───────────────────────────────────
const getSlipById = async (id) => {
  const slipResult = await pool.query(
    `SELECT
       ps.*,
       e.name         AS ecd_name,
       e.child_count,
       e.contact_name,
       u.first_name   AS packer_name
     FROM packing_slips ps
     JOIN ecd_centres e ON e.id = ps.ecd_id
     LEFT JOIN users u ON u.id = ps.assigned_to
     WHERE ps.id = $1`,
    [id]
  );

  if (!slipResult.rows[0]) return null;

  const itemsResult = await pool.query(
    `SELECT
       psi.id,
       psi.product_id,
       psi.required_quantity,
       psi.unit,
       psi.packed_quantity,
       psi.status,
       psi.flag_reason,
       psi.confirmed_at,
       p.name               AS product_name,
       p.stock_keeping_unit AS sku
     FROM packing_slip_items psi
     JOIN products p ON p.id = psi.product_id
     WHERE psi.packing_slip_id = $1
     ORDER BY p.name ASC, psi.unit ASC`,
    [id]
  );

  return { ...slipResult.rows[0], items: itemsResult.rows };
};

// ── Generate a week's slips from ECD master data ──────────────
// Idempotent: the UNIQUE (ecd_id, dispatch_date) constraint means
// re-running for the same day updates nothing and creates nothing.
// Slips already in progress are never touched.
const generateSlips = async ({ dispatchDate, cohort, generatedBy }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slips = await client.query(
      `INSERT INTO packing_slips (ecd_id, dispatch_date, cohort, generated_by)
       SELECT e.id, $1::date, $2::cohort_day, $3
       FROM ecd_centres e
       WHERE e.cohort = $2::cohort_day
         AND e.is_active = TRUE
         AND e.approved_at IS NOT NULL
       ON CONFLICT (ecd_id, dispatch_date) DO NOTHING
       RETURNING id, ecd_id`,
      [dispatchDate, cohort, generatedBy]
    );

    // Snapshot the recipe onto each new slip. Copying (not joining) means a
    // later change to ecd_order_lines can never rewrite a packed slip.
    for (const slip of slips.rows) {
      await client.query(
        `INSERT INTO packing_slip_items (packing_slip_id, product_id, required_quantity, unit)
         SELECT $1, ol.product_id, ol.quantity, ol.unit
         FROM ecd_order_lines ol
         WHERE ol.ecd_id = $2
           AND ol.effective_from <= $3::date
           AND (ol.effective_to IS NULL OR ol.effective_to >= $3::date)`,
        [slip.id, slip.ecd_id, dispatchDate]
      );
      await logEvent(client, slip.id, 'generated', generatedBy, { dispatch_date: dispatchDate });
    }

    await client.query('COMMIT');
    return { created: slips.rowCount };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Claim a slip ──────────────────────────────────────────────
// FOR UPDATE prevents two packers claiming the same pallet.
// Returns null if someone else already holds it.
const assignSlip = async ({ slipId, packerId, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, status, assigned_to FROM packing_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = current.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }
    if (slip.assigned_to && slip.assigned_to !== packerId) {
      await client.query('ROLLBACK');
      return { conflict: true };
    }

    const result = await client.query(
      `UPDATE packing_slips
       SET assigned_to = $1,
           status      = 'in_progress',
           started_at  = COALESCE(started_at, NOW())
       WHERE id = $2
       RETURNING *`,
      [packerId, slipId]
    );

    await logEvent(client, slipId, 'assigned', actorId, { packer_id: packerId });
    await client.query('COMMIT');
    return { slip: result.rows[0] };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Confirm or flag one line ──────────────────────────────────
// Guarded on the parent slip's status so a completed slip can't be edited.
const setItemStatus = async ({ slipId, itemId, status, packedQuantity, flagReason, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slipResult = await client.query(
      `SELECT id, status, assigned_to FROM packing_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = slipResult.rows[0];
    if (!slip)                     { await client.query('ROLLBACK'); return { notFound: true }; }
    if (slip.status === 'complete'){ await client.query('ROLLBACK'); return { locked: true }; }

    const result = await client.query(
      `UPDATE packing_slip_items
       SET status          = $1::packing_item_status,
           packed_quantity = $2,
           flag_reason     = $3,
           confirmed_by    = $4,
           confirmed_at    = NOW()
       WHERE id = $5 AND packing_slip_id = $6
       RETURNING *`,
      [status, packedQuantity ?? null, flagReason ?? null, actorId, itemId, slipId]
    );

    if (!result.rows[0]) { await client.query('ROLLBACK'); return { notFound: true }; }

    await logEvent(
      client, slipId,
      status === 'flagged' ? 'item_flagged' : 'item_confirmed',
      actorId,
      { item_id: itemId, packed_quantity: packedQuantity, flag_reason: flagReason }
    );

    await client.query('COMMIT');
    return { item: result.rows[0], assignedTo: slip.assigned_to };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Complete a slip ───────────────────────────────────────────
// The core rule: cannot complete while any line is still 'pending'.
// Enforced inside the transaction, not in JS, so a race can't slip past it.
const completeSlip = async ({ slipId, palletRef, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slipResult = await client.query(
      `SELECT id, status FROM packing_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = slipResult.rows[0];
    if (!slip)                      { await client.query('ROLLBACK'); return { notFound: true }; }
    if (slip.status === 'complete') { await client.query('ROLLBACK'); return { alreadyComplete: true }; }

    const pending = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM packing_slip_items
       WHERE packing_slip_id = $1 AND status = 'pending'`,
      [slipId]
    );
    if (pending.rows[0].n > 0) {
      await client.query('ROLLBACK');
      return { pendingItems: pending.rows[0].n };
    }

    const result = await client.query(
      `UPDATE packing_slips
       SET status       = 'complete',
           completed_at = NOW(),
           completed_by = $1,
           pallet_ref   = COALESCE($2, pallet_ref)
       WHERE id = $3
       RETURNING *`,
      [actorId, palletRef ?? null, slipId]
    );

    // Sprint 3 hook: deduct confirmed quantities from stock in THIS transaction,
    // so stock and slip state can never diverge.
    //
    // await client.query(
    //   `INSERT INTO stock_movements (product_id, quantity, unit, movement_type, reference_id)
    //    SELECT product_id, -packed_quantity, unit, 'packed', $1
    //    FROM packing_slip_items
    //    WHERE packing_slip_id = $1 AND status = 'confirmed'`,
    //   [slipId]
    // );

    await logEvent(client, slipId, 'completed', actorId, { pallet_ref: palletRef });
    await client.query('COMMIT');
    return { slip: result.rows[0] };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default {
  getSlips,
  getSlipById,
  generateSlips,
  assignSlip,
  setItemStatus,
  completeSlip,
};
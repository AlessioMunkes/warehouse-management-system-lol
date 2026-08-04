// ─────────────────────────────────────────────────────────────
// server/src/repositories/picking.repository.js
//
// All SQL for the picking module.
// No business logic here — only database queries.
// ─────────────────────────────────────────────────────────────
import pool       from '../config/db.js';
import stockModel from './stock.repository.js';

// ── Audit helper (used inside existing transactions) ──────────
const logEvent = async (client, slipId, eventType, actorId, detail = null) => {
  await client.query(
    `INSERT INTO picking_events (picking_slip_id, event_type, actor_id, detail)
     VALUES ($1, $2, $3, $4)`,
    [slipId, eventType, actorId, detail]
  );
};

// ── Rotation anchor ────────────────────────────────────────────
// The Monday of a known 'week1' week — the service layer uses this
// to compute which cohort is active for any given dispatch date.
const getCohortAnchor = async () => {
  const result = await pool.query(
    `SELECT value FROM picking_settings WHERE key = 'cohort_anchor_monday'`
  );
  return result.rows[0]?.value ?? null;
};

// ── List slips for a dispatch day ─────────────────────────────
// Progress is computed in SQL so the board doesn't need N+1 queries.
//
// variance_items counts lines a packer confirmed at a quantity that
// isn't what the slip asked for. Those lines are legitimately
// 'confirmed', so without this count the board shows the pallet as
// clean and dispatch has no reason to look twice — which is exactly
// the Monday packing error the gate re-check exists to catch.
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
       e.last_collected_date,
       u.first_name AS packer_name,
       COUNT(psi.id)                                          AS total_items,
       COUNT(psi.id) FILTER (WHERE psi.status = 'confirmed')  AS confirmed_items,
       COUNT(psi.id) FILTER (WHERE psi.status = 'flagged')    AS flagged_items,
       COUNT(psi.id) FILTER (
         WHERE psi.status = 'confirmed'
           AND psi.packed_quantity IS DISTINCT FROM psi.required_quantity
       )                                                      AS variance_items
     FROM picking_slips ps
     JOIN ecd_centres e ON e.id = ps.ecd_id
     LEFT JOIN users u ON u.id = ps.assigned_to
     LEFT JOIN picking_slip_items psi ON psi.picking_slip_id = ps.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY ps.id, e.name, e.child_count, e.last_collected_date, u.first_name
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
       e.name                AS ecd_name,
       e.child_count,
       e.contact_name,
       e.last_collected_date,
       u.first_name          AS packer_name
     FROM picking_slips ps
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
     FROM picking_slip_items psi
     JOIN products p ON p.id = psi.product_id
     WHERE psi.picking_slip_id = $1
     ORDER BY p.name ASC, psi.unit ASC`,
    [id]
  );

  return { ...slipResult.rows[0], items: itemsResult.rows };
};

// ── Generate a week's slips from ECD master data ──────────────
// Idempotent: the UNIQUE (ecd_id, dispatch_date) constraint means
// re-running for the same day updates nothing and creates nothing.
// Slips already in progress are never touched.
//
// An ECD with no effective order lines produces a slip with zero
// items, which then has zero pending lines and can be closed
// instantly with nothing packed. That is not blocked — food is never
// blocked on a data problem — but every such slip is returned in
// emptySlips so the manager can fix the master data before Monday.
const generateSlips = async ({ dispatchDate, cohort, generatedBy }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slips = await client.query(
      `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, generated_by)
       SELECT e.id, $1::date, $2::cohort_group, $3
       FROM ecd_centres e
       WHERE e.cohort = $2::cohort_group
         AND e.is_active = TRUE
         AND e.approved_at IS NOT NULL
       ON CONFLICT (ecd_id, dispatch_date) DO NOTHING
       RETURNING id, ecd_id`,
      [dispatchDate, cohort, generatedBy]
    );

    const emptySlips = [];

    // Snapshot the recipe onto each new slip. Copying (not joining) means a
    // later change to ecd_order_lines can never rewrite a packed slip.
    for (const slip of slips.rows) {
      const items = await client.query(
        `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
         SELECT $1, ol.product_id, ol.quantity, ol.unit
         FROM ecd_order_lines ol
         WHERE ol.ecd_id = $2
           AND ol.effective_from <= $3::date
           AND (ol.effective_to IS NULL OR ol.effective_to >= $3::date)
         RETURNING id`,
        [slip.id, slip.ecd_id, dispatchDate]
      );

      await logEvent(client, slip.id, 'generated', generatedBy, {
        dispatch_date: dispatchDate,
        item_count:    items.rowCount,
      });

      if (items.rowCount === 0) {
        emptySlips.push({ slipId: slip.id, ecdId: slip.ecd_id });
        await logEvent(client, slip.id, 'no_order_lines', generatedBy, { dispatch_date: dispatchDate });
      }
    }

    await client.query('COMMIT');
    return { created: slips.rowCount, emptySlips };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Create a single ad-hoc slip ───────────────────────────────
// Same idempotent shape as generateSlips, scoped to one ECD — for a
// late-registered ECD, a correction, or any slip needed outside the
// normal cohort-wide generation run.
const createSlip = async ({ ecdId, dispatchDate, cohort, generatedBy }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ecdCheck = await client.query(
      `SELECT id FROM ecd_centres WHERE id = $1 AND is_active = TRUE AND approved_at IS NOT NULL`,
      [ecdId]
    );
    if (!ecdCheck.rows[0]) { await client.query('ROLLBACK'); return { ecdNotFound: true }; }

    const slipResult = await client.query(
      `INSERT INTO picking_slips (ecd_id, dispatch_date, cohort, generated_by)
       VALUES ($1, $2, $3::cohort_group, $4)
       ON CONFLICT (ecd_id, dispatch_date) DO NOTHING
       RETURNING id`,
      [ecdId, dispatchDate, cohort, generatedBy]
    );

    if (!slipResult.rows[0]) { await client.query('ROLLBACK'); return { alreadyExists: true }; }

    const slipId = slipResult.rows[0].id;

    const itemsResult = await client.query(
      `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
       SELECT $1, ol.product_id, ol.quantity, ol.unit
       FROM ecd_order_lines ol
       WHERE ol.ecd_id = $2
         AND ol.effective_from <= $3::date
         AND (ol.effective_to IS NULL OR ol.effective_to >= $3::date)
       RETURNING id`,
      [slipId, ecdId, dispatchDate]
    );

    await logEvent(client, slipId, 'generated', generatedBy, {
      dispatch_date: dispatchDate,
      mode:          'manual',
      item_count:    itemsResult.rowCount,
    });
    if (itemsResult.rowCount === 0) {
      await logEvent(client, slipId, 'no_order_lines', generatedBy, { dispatch_date: dispatchDate });
    }

    await client.query('COMMIT');
    return { slipId, itemCount: itemsResult.rowCount };

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
      `SELECT id, status, assigned_to FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = current.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }
    if (slip.assigned_to && slip.assigned_to !== packerId) {
      await client.query('ROLLBACK');
      return { conflict: true };
    }

    const result = await client.query(
      `UPDATE picking_slips
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
//
// A confirm whose quantity doesn't match required_quantity is still a
// valid confirm — the packer may genuinely have packed more or less —
// but it is recorded as its own audit event and returned as `variance`
// so the board and the slip can show it. Silently accepting a
// mismatched confirm is how a short pallet reaches the gate looking
// complete.
const setItemStatus = async ({ slipId, itemId, status, packedQuantity, flagReason, actorId, canOverride = false }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slipResult = await client.query(
      `SELECT id, status, assigned_to FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = slipResult.rows[0];
    if (!slip)                     { await client.query('ROLLBACK'); return { notFound: true }; }
    if (slip.status === 'complete'){ await client.query('ROLLBACK'); return { locked: true }; }

    // ── Authorisation, inside the lock and BEFORE the write ──
    // Doing this here (rather than after setItemStatus returns) means a
    // refused packer cannot mutate the row at all. The FOR UPDATE above
    // also closes the race where a slip is reassigned mid-check.
    if (!canOverride && slip.assigned_to !== actorId) {
      await client.query('ROLLBACK');
      return { forbidden: true, assignedTo: slip.assigned_to };
    }

    const result = await client.query(
      `UPDATE picking_slip_items
       SET status          = $1::picking_item_status,
           packed_quantity = $2,
           flag_reason     = $3,
           confirmed_by    = $4,
           confirmed_at    = NOW()
       WHERE id = $5 AND picking_slip_id = $6
       RETURNING *, (packed_quantity - required_quantity) AS quantity_variance`,
      [status, packedQuantity ?? null, flagReason ?? null, actorId, itemId, slipId]
    );

    if (!result.rows[0]) { await client.query('ROLLBACK'); return { notFound: true }; }

    // quantity_variance is subtracted by Postgres in NUMERIC and only
    // then converted, so the difference is exact. Doing `packed -
    // required` in JS gave 8.7 - 7.2 = 1.4999999999999991, which is
    // the number that would have gone into the audit log and onto the
    // screen. It is stripped off the item before returning so the API
    // response shape doesn't change.
    const { quantity_variance: rawVariance, ...item } = result.rows[0];

    const required = Number(item.required_quantity);
    const packed   = item.packed_quantity === null ? null : Number(item.packed_quantity);
    const variance = (status === 'confirmed' && packed !== null && packed !== required)
      ? { required, packed, difference: Number(rawVariance) }
      : null;

    await logEvent(
      client, slipId,
      status === 'flagged' ? 'item_flagged' : 'item_confirmed',
      actorId,
      { item_id: itemId, required_quantity: required, packed_quantity: packedQuantity, flag_reason: flagReason }
    );

    if (variance) {
      await logEvent(client, slipId, 'item_variance', actorId, { item_id: itemId, ...variance });
    }

    await client.query('COMMIT');
    return { item, variance, assignedTo: slip.assigned_to };

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
//
// Stock is deducted here, in the same transaction as the completion
// write, so slip state and stock can never diverge. If a packed
// quantity exceeds recorded stock, completion still succeeds — ECDs
// can't go without food because a system count is off — but the
// shortfall is logged as its own audit event and returned to the
// caller so the UI can surface it as a warning for a manager to
// reconcile via the manual adjustment screen.
//
// Flagged lines are deducted too, whenever the packer recorded a
// quantity. A flag usually means "short quantity — I packed 10 of the
// 20", and those 10 physically leave the warehouse; deducting only
// 'confirmed' lines silently overstated stock on every partial pack.
// A flagged line with no recorded quantity (the packer didn't know)
// is skipped — there is nothing to deduct.
//
// NOTE ON TIMING: stock leaves the ledger when the pallet is packed,
// not when it is collected. The pallet is physically still on the
// floor until the ECD driver arrives, and non-collections are common,
// so an uncollected pallet leaves a standing negative in the ledger
// against food that is still in the building. Every movement written
// here carries reference_type 'picking_slip' + reference_id, so the
// dispatch module can post a compensating movement when a pallet goes
// uncollected. That reversal belongs in the dispatch module and is
// not implemented yet — until it is, Friday's count will show a
// positive variance for every uncollected pallet.
const completeSlip = async ({ slipId, palletRef, actorId, canOverride = false }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slipResult = await client.query(
      `SELECT id, status, assigned_to FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = slipResult.rows[0];
    if (!slip)                      { await client.query('ROLLBACK'); return { notFound: true }; }
    if (slip.status === 'complete') { await client.query('ROLLBACK'); return { alreadyComplete: true }; }

    // Same ownership rule as confirm/flag. Closing a pallet is the
    // write that moves stock, so it can't be looser than the writes
    // that lead up to it.
    if (!canOverride && slip.assigned_to !== actorId) {
      await client.query('ROLLBACK');
      return { forbidden: true, assignedTo: slip.assigned_to };
    }

    const pending = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM picking_slip_items
       WHERE picking_slip_id = $1 AND status = 'pending'`,
      [slipId]
    );
    if (pending.rows[0].n > 0) {
      await client.query('ROLLBACK');
      return { pendingItems: pending.rows[0].n };
    }

    // Deduct packed quantities from stock in THIS transaction, so
    // stock and slip state can never diverge. Locked in product_id
    // order — matches the lock order any other caller of adjustStock
    // (e.g. procurement) should also use, so two transactions touching
    // the same two products can never deadlock against each other.
    const packedItems = await client.query(
      `SELECT product_id, packed_quantity, unit, status
       FROM picking_slip_items
       WHERE picking_slip_id = $1
         AND status IN ('confirmed', 'flagged')
         AND packed_quantity IS NOT NULL
         AND packed_quantity > 0
       ORDER BY product_id ASC`,
      [slipId]
    );

    const shortfalls    = [];
    const unitMismatches = [];
    for (const item of packedItems.rows) {
      const { before, after, isShortfall, isUnitMismatch } = await stockModel.adjustStock(client, {
        productId:     item.product_id,
        quantityDelta: -item.packed_quantity,
        unit:          item.unit,
        movementType:  'picked',
        referenceType: 'picking_slip',
        referenceId:   slipId,
        performedBy:   actorId,
      });
      if (isShortfall) {
        shortfalls.push({ productId: item.product_id, onHand: before, required: Number(item.packed_quantity), after });
      }
      // The ledger's established unit wins, so the running total is
      // still arithmetically sound — but a slip line in kg deducting
      // from a ledger in units means one of the two is wrong, and
      // that has to reach a human rather than vanish.
      if (isUnitMismatch) {
        unitMismatches.push({ productId: item.product_id, slipUnit: item.unit });
      }
    }

    const result = await client.query(
      `UPDATE picking_slips
       SET status       = 'complete',
           completed_at = NOW(),
           completed_by = $1,
           pallet_ref   = COALESCE($2, pallet_ref)
       WHERE id = $3
       RETURNING *`,
      [actorId, palletRef ?? null, slipId]
    );

    await logEvent(client, slipId, 'completed', actorId, { pallet_ref: palletRef });
    if (shortfalls.length > 0) {
      await logEvent(client, slipId, 'stock_shortfall', actorId, { shortfalls });
    }
    if (unitMismatches.length > 0) {
      await logEvent(client, slipId, 'unit_mismatch', actorId, { unitMismatches });
    }

    await client.query('COMMIT');
    return {
      slip:           result.rows[0],
      shortfalls:     shortfalls.length     ? shortfalls     : undefined,
      unitMismatches: unitMismatches.length ? unitMismatches : undefined,
    };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default {
  getCohortAnchor,
  getSlips,
  getSlipById,
  generateSlips,
  createSlip,
  assignSlip,
  setItemStatus,
  completeSlip,
};
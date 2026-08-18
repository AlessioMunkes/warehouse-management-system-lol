// ─────────────────────────────────────────────────────────────
// server/src/repositories/picking.repository.js
//
// All SQL for the picking module.
// No business logic here — only database queries.
//
// STOCK TIMING (changed — read this before editing completeSlip)
// This module NO LONGER writes to stock_levels or stock_movements.
// Stock is deducted at the dispatch gate, against what was actually
// loaded into the vehicle, in dispatch.repository.collect().
//
// The old behaviour deducted at completeSlip. It kept slip state and
// stock in one transaction, but it meant quantity_on_hand went
// negative for food that was still standing on a pallet in the
// staging area, and every uncollected pallet left a permanent
// overstatement that Friday's count had to absorb.
//
// Packing now only READS stock, to warn the packer that the shelf may
// not hold what the slip is asking for. That read is a flag, never a
// block — see the note on completeSlip below.
//
// The `stockModel` import is deliberately gone. If you find yourself
// adding it back, you are about to double-deduct.
// ─────────────────────────────────────────────────────────────
import pool                  from '../config/db.js';
import { committedStockSql } from './committedStock.sql.js';

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
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }

    // 'dispatched' is included alongside 'complete': once the pallet
    // has physically left the gate, editing the line it was built from
    // would rewrite history the dispatch note was printed against.
    if (slip.status === 'complete' || slip.status === 'dispatched') {
      await client.query('ROLLBACK');
      return { locked: true };
    }

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
// STOCK IS NOT DEDUCTED HERE ANY MORE.
//
// It used to be. The reasoning then was that slip state and stock
// should commit together, which is true as far as it goes — but it
// forced quantity_on_hand to mean "on hand, minus anything anyone has
// packed", which is not a number anybody can count. A packed pallet
// stands in the staging area for one to two days, and roughly one in
// ten is never collected, so the ledger drifted below the shelf every
// single week and Friday's count spent its time reconciling the
// difference. Deduction now happens at the gate against what was
// actually loaded into the vehicle (dispatch.repository.collect), so
// quantity_on_hand means exactly what the counters count.
//
// What this function does instead is READ availability and warn.
// available = quantity_on_hand - committed, where committed is every
// other packed-but-not-yet-dispatched pallet (committedStock.sql.js).
// If this pallet's packed quantities exceed that, the packer and the
// manager are told — but completion still succeeds. An ECD never goes
// without food because a system count is off. Same rule as before,
// same `shortfalls` shape on the response; only the meaning has
// tightened, from "the ledger just went negative" to "the shelf may
// not hold this".
//
// Because nothing is written to stock here, this transaction no
// longer needs product_id-ordered row locks. Keep the ORDER BY on the
// read anyway — a stable order makes the warning list reproducible
// between runs, and it keeps this query shaped like the one in
// dispatch.repository.collect() that does still lock.
const completeSlip = async ({ slipId, palletRef, actorId, canOverride = false }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slipResult = await client.query(
      `SELECT id, status, assigned_to FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = slipResult.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }
    if (slip.status === 'complete' || slip.status === 'dispatched') {
      await client.query('ROLLBACK');
      return { alreadyComplete: true };
    }

    // Same ownership rule as confirm/flag. Closing a pallet is what
    // makes it eligible for the gate, so it can't be looser than the
    // writes that lead up to it.
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

    // ── Availability check (read-only) ──────────────────────────
    // Totals are summed and compared by Postgres in NUMERIC. Summing
    // packed_quantity across lines in JS is how DEFECT F got in; the
    // comparison is done in SQL for the same reason.
    //
    // Lines for one product in different units are summed together,
    // which is what the old adjustStock loop effectively did too (the
    // ledger's established unit won). Any line whose unit differs from
    // the ledger's is reported in unitMismatches so a human can decide
    // which of the two is wrong.
    //
    // The exclusion of this slip from `committed` is belt-and-braces:
    // its status is still 'in_progress' at this point so it would be
    // excluded anyway, but that is an ordering coincidence, and
    // ordering coincidences do not survive refactors.
    const availability = await client.query(
      `WITH packed AS (
         SELECT
           psi.product_id,
           SUM(psi.packed_quantity)::numeric  AS packed_quantity,
           ARRAY_AGG(DISTINCT psi.unit)       AS units
         FROM picking_slip_items psi
         WHERE psi.picking_slip_id = $1
           AND psi.status IN ('confirmed', 'flagged')
           AND psi.packed_quantity IS NOT NULL
           AND psi.packed_quantity > 0
         GROUP BY psi.product_id
       )
       SELECT
         packed.product_id,
         packed.packed_quantity,
         packed.units,
         p.name                                            AS product_name,
         COALESCE(sl.quantity_on_hand, 0)::numeric         AS quantity_on_hand,
         sl.unit                                           AS ledger_unit,
         COALESCE(c.committed, 0)::numeric                 AS committed,
         (COALESCE(sl.quantity_on_hand, 0) - COALESCE(c.committed, 0))::numeric AS available,
         (packed.packed_quantity >
            (COALESCE(sl.quantity_on_hand, 0) - COALESCE(c.committed, 0)))      AS is_shortfall
       FROM packed
       JOIN products p ON p.id = packed.product_id
       LEFT JOIN stock_levels sl ON sl.product_id = packed.product_id
       LEFT JOIN (${committedStockSql({ excludeSlipParam: '$1' })}) c
              ON c.product_id = packed.product_id
       ORDER BY packed.product_id ASC`,
      [slipId]
    );

    const shortfalls     = [];
    const unitMismatches = [];

    for (const row of availability.rows) {
      if (row.is_shortfall) {
        shortfalls.push({
          productId:   row.product_id,
          productName: row.product_name,
          onHand:      Number(row.quantity_on_hand),
          committed:   Number(row.committed),
          available:   Number(row.available),
          packed:      Number(row.packed_quantity),
        });
      }

      // A product with no stock_levels row has no established unit
      // yet, so there is nothing to disagree with — the first
      // movement against it (which will now be the dispatch) sets it.
      if (row.ledger_unit) {
        const mismatched = (row.units || []).filter((u) => u !== row.ledger_unit);
        if (mismatched.length > 0) {
          unitMismatches.push({
            productId:   row.product_id,
            productName: row.product_name,
            slipUnits:   mismatched,
            ledgerUnit:  row.ledger_unit,
          });
        }
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
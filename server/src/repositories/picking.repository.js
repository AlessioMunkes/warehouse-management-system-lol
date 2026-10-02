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

// ── Who is acting: staff or a guest ───────────────────────────
// Staff are `users` rows; guests are `volunteers` rows. Two id spaces
// that overlap, on one cookie, distinguished only by role — so the
// actor has to carry its own type rather than being inferred from a
// bare number.
//
// { type: 'user' | 'volunteer', id }
//
// Callers that pass the old `actorId` keep working unchanged: they are
// staff by definition, because until guests existed there was nothing
// else to be.
const asActor = (actor, actorId) => actor ?? { type: 'user', id: actorId };
const isVolunteer = (actor) => actor.type === 'volunteer';

// NEVER write a volunteer id into actor_id / confirmed_by / completed_by.
//
// All three are int4 with a FOREIGN KEY to users(id), and volunteers.id
// is int8. The FK does not protect us here — it ACCEPTS the write
// whenever the number happens to exist in users, and the ranges overlap
// badly: users run 1-346, volunteers run 1-7, and 6 of the 7 current
// volunteers collide with a real staff account. Volunteer 1 is users
// row 1, which is admin001. A guest packing a pallet would be recorded,
// permanently and plausibly, as the administrator.
//
// So a guest's actor column is NULL and the attribution goes in the
// jsonb detail instead, where there is no type to collide with. If you
// are tempted to "fix" this by casting, read the FK first.
const actorUserId = (actor) => (isVolunteer(actor) ? null : actor.id);

const actorDetail = (actor, detail = null) =>
  (isVolunteer(actor)
    ? { ...(detail ?? {}), actor_type: 'volunteer', volunteer_id: actor.id }
    : detail);

// node-postgres hands back int8 as a STRING and int4 as a number, so a
// volunteer id off the JWT is '7' while a slip id is 7. Comparing those
// with !== is always true, which would forbid every guest write with no
// visible reason. Compare as text.
const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

// The owner of a slip depends on who is asking: staff hold it through
// assigned_to, guests through assigned_volunteer_id. Two columns, never
// interchangeable.
const slipOwnerFor = (actor, slip) =>
  (isVolunteer(actor) ? slip.assigned_volunteer_id : slip.assigned_to);

// Who is allowed to work a slip. A guest volunteer is measured against
// assigned_volunteer_id, staff against assigned_to — and, for staff,
// also against assigned_to_2: dual assignment means two people are
// genuinely allowed to pack the slip, not that one is a spectator.
// The second-packer slot is a staff column, so it never widens what a
// volunteer may touch.
const canWorkSlip = (actor, slip) =>
  sameId(slipOwnerFor(actor, slip), actor.id) ||
  (!isVolunteer(actor) && sameId(slip.assigned_to_2, actor.id));

// ── List slips for a dispatch day ─────────────────────────────
// Progress is computed in SQL so the board doesn't need N+1 queries.
//
// variance_items counts lines a packer confirmed at a quantity that
// isn't what the slip asked for. Those lines are legitimately
// 'confirmed', so without this count the board shows the pallet as
// clean and dispatch has no reason to look twice — which is exactly
// the Monday packing error the gate re-check exists to catch.
const getSlips = async ({ dispatchDate, from, to, cohort, status, assignedTo }) => {
  const params = [];
  const where  = [];

  if (dispatchDate) { params.push(dispatchDate); where.push(`ps.dispatch_date = $${params.length}`); }
  // A range, for the manager's week view. Inclusive both ends.
  if (from)         { params.push(from);         where.push(`ps.dispatch_date >= $${params.length}::date`); }
  if (to)           { params.push(to);           where.push(`ps.dispatch_date <= $${params.length}::date`); }
  if (cohort)       { params.push(cohort);       where.push(`ps.cohort = $${params.length}`); }
  if (status)       { params.push(status);       where.push(`ps.status = $${params.length}`); }
  // Matches either slot — a worker requesting "mine" wants every slip
  // they are on, whether they hold it alone or as the second packer.
  if (assignedTo)   { params.push(assignedTo);   where.push(`(ps.assigned_to = $${params.length} OR ps.assigned_to_2 = $${params.length})`); }

  const result = await pool.query(
    `SELECT
       ps.id,
       ps.dispatch_date,
       -- The calendar day as text, for anything that must PRINT the
       -- date rather than compute with it. ps.dispatch_date itself is a
       -- Date by the time node-postgres is done with it, and JSON
       -- serialises that as the previous day in UTC — the defect that
       -- has already reached a volunteer's screen twice. Additive: the
       -- existing column is untouched for existing callers.
       ps.dispatch_date::text AS dispatch_date_iso,
       -- BR-22. The stable per-slip token behind the printed QR label.
       -- Read-only here; nothing in the app ever writes it.
       ps.public_token,
       ps.cohort,
       ps.pallet_ref,
       ps.status,
       ps.assigned_to,
       ps.assigned_to_2,
       e.name       AS ecd_name,
       e.child_count,
       e.last_collected_date,
       u.first_name  AS packer_name,
       u2.first_name AS packer_name_2,
       COUNT(psi.id)                                          AS total_items,
       COUNT(psi.id) FILTER (WHERE psi.status = 'confirmed')  AS confirmed_items,
       COUNT(psi.id) FILTER (WHERE psi.status = 'flagged')    AS flagged_items,
       COUNT(psi.id) FILTER (
         WHERE psi.status = 'confirmed'
           AND psi.packed_quantity IS DISTINCT FROM psi.required_quantity
       )                                                      AS variance_items,
       -- What happened at the gate: awaiting / collected /
       -- late_collected / not_collected / cancelled, or null before a
       -- dispatch event exists. dispatch_events is where the
       -- not-collected cut-off writes; picking_slips.collection_status
       -- is never written and must not be read.
       de.status                                              AS dispatch_status
     FROM picking_slips ps
     JOIN ecd_centres e ON e.id = ps.ecd_id
     LEFT JOIN users u  ON u.id = ps.assigned_to
     LEFT JOIN users u2 ON u2.id = ps.assigned_to_2
     LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
     LEFT JOIN picking_slip_items psi ON psi.picking_slip_id = ps.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY ps.id, e.name, e.child_count, e.last_collected_date, u.first_name, u2.first_name, de.status
     ORDER BY ps.dispatch_date ASC, e.name ASC`,
    params
  );

  return result.rows;
};

// ── One slip with its lines ───────────────────────────────────
const getSlipById = async (id) => {
  const slipResult = await pool.query(
    `SELECT
       ps.*,
       -- The calendar day as text, same reason as getSlips: the DATE
       -- itself serialises as the previous day in UTC.
       ps.dispatch_date::text AS dispatch_date_iso,
       -- The gate's outcome, as getSlips reports it.
       (SELECT de.status FROM dispatch_events de WHERE de.picking_slip_id = ps.id) AS dispatch_status,
       e.name                AS ecd_name,
       e.child_count,
       e.contact_name,
       e.last_collected_date,
       u.first_name           AS packer_name,
       u2.first_name          AS packer_name_2
     FROM picking_slips ps
     JOIN ecd_centres e ON e.id = ps.ecd_id
     LEFT JOIN users u  ON u.id = ps.assigned_to
     LEFT JOIN users u2 ON u2.id = ps.assigned_to_2
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
       psi.packer_note,
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
// `beforeCommit(client, facts)`, when given, runs inside this
// transaction just before COMMIT — the service's notification goes in
// with the change or not at all (features/communications/notices.js).
const generateSlips = async ({ dispatchDate, cohort, generatedBy, beforeCommit }) => {
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
         JOIN products p ON p.id = ol.product_id
         WHERE ol.ecd_id = $2
           AND ol.effective_from <= $3::date
           AND (ol.effective_to IS NULL OR ol.effective_to >= $3::date)
           AND p.archived_at IS NULL
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

    if (beforeCommit) {
      await beforeCommit(client, { created: slips.rowCount, cohort, dispatchDate, emptySlips });
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

// ── Create a single new slip ───────────────────────────────────
// Same idempotent shape as generateSlips, scoped to one ECD — for a
// late-registered ECD, a correction, or any slip needed outside the
// normal cohort-wide generation run.
//
// `items`, when the caller supplies it, REPLACES the usual pull from
// ecd_order_lines — the manager typed or adjusted the lines by hand
// (including via meals-to-serve auto-calculation, done client-side)
// instead of taking the centre's standing order as-is. Omit it
// entirely to keep the original "pull from the standing order"
// behaviour generateSlips also relies on.
// `beforeCommit(client, facts)`, when given, runs inside this
// transaction just before COMMIT — the service's notification goes in
// with the change or not at all (features/communications/notices.js).
const createSlip = async ({ ecdId, dispatchDate, cohort, generatedBy, items, beforeCommit }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ecdCheck = await client.query(
      `SELECT id, name FROM ecd_centres WHERE id = $1 AND is_active = TRUE AND approved_at IS NOT NULL`,
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

    let itemCount;
    if (items) {
      for (const item of items) {
        await client.query(
          `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
           VALUES ($1, $2, $3, $4)`,
          [slipId, item.productId, item.quantity, item.unit]
        );
      }
      itemCount = items.length;
    } else {
      const itemsResult = await client.query(
        `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
         SELECT $1, ol.product_id, ol.quantity, ol.unit
         FROM ecd_order_lines ol
         JOIN products p ON p.id = ol.product_id
         WHERE ol.ecd_id = $2
           AND ol.effective_from <= $3::date
           AND (ol.effective_to IS NULL OR ol.effective_to >= $3::date)
           AND p.archived_at IS NULL
         RETURNING id`,
        [slipId, ecdId, dispatchDate]
      );
      itemCount = itemsResult.rowCount;
    }

    await logEvent(client, slipId, 'generated', generatedBy, {
      dispatch_date: dispatchDate,
      mode:          'manual',
      item_count:    itemCount,
    });
    if (itemCount === 0) {
      await logEvent(client, slipId, 'no_order_lines', generatedBy, { dispatch_date: dispatchDate });
    }

    if (beforeCommit) {
      await beforeCommit(client, { slipId, ecdName: ecdCheck.rows[0].name, dispatchDate, itemCount });
    }

    await client.query('COMMIT');
    return { slipId, itemCount, ecdName: ecdCheck.rows[0].name };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Which statuses can still be claimed ───────────────────────
// A pallet is claimable while it is being built and no longer after
// packing has closed it off. Kept next to assignSlip rather than in
// the service because, like every other guard in this file, it has to
// be evaluated INSIDE the row lock — a check in the service can be
// overtaken between the read and the write.
const CLAIMABLE_STATUSES = ['pending', 'in_progress'];

// ── Claim a slip ──────────────────────────────────────────────
// FOR UPDATE prevents two packers claiming the same pallet.
//
// TWO guards, and they are different things.
//
// STATUS. The UPDATE below sets status = 'in_progress'
// unconditionally, so without a status guard claiming an already
// CLOSED pallet silently reopened it. The damage from that is not
// obvious: a reopened slip drops out of the dispatch board (which
// filters on status IN ('complete','dispatched')) and out of
// committedStockSql (which requires status = 'complete'), so a pallet
// physically standing in the staging area stops being counted as
// committed and its stock reads as available to the next packer. The
// pallet also becomes editable again through setItemStatus, which
// guards 'complete'/'dispatched' but has no say over how the slip got
// back to 'in_progress'. Nobody may claim a closed pallet — not even
// a manager. Reopening one is a deliberate act that deserves its own
// endpoint, not a side effect of tapping Claim.
//
// OWNERSHIP. Taking a pallet off another packer is a legitimate thing
// for a manager to do — a shift ends, someone goes home sick — and
// picking.service.js has always documented it as supported. It was
// not: canOverride did not exist here, so the conflict branch fired
// for managers too and reassignment was impossible through the API.
// canOverride now covers ownership only; the status guard above
// applies to everybody.
const assignSlip = async ({ slipId, packerId, actorId, canOverride = false }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, status, assigned_to FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = current.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }

    if (!CLAIMABLE_STATUSES.includes(slip.status)) {
      await client.query('ROLLBACK');
      return { locked: true, status: slip.status };
    }

    // Re-claiming a pallet you already hold is not a reassignment —
    // it is a packer tapping the same button twice, and it succeeds
    // quietly.
    const isReassignment = Boolean(slip.assigned_to) && slip.assigned_to !== packerId;

    if (isReassignment && !canOverride) {
      await client.query('ROLLBACK');
      return { conflict: true, assignedTo: slip.assigned_to };
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

    // A reassignment is recorded as an 'assigned' event carrying the
    // previous holder in its detail, NOT as a new 'reassigned' event
    // type. picking_events.event_type is constrained in the database,
    // and a label the constraint has never seen would roll the whole
    // transaction back at the one moment a manager is trying to
    // unblock a stalled pallet. The detail column is JSONB and takes
    // whatever it is given.
    await logEvent(client, slipId, 'assigned', actorId, {
      packer_id: packerId,
      ...(isReassignment
        ? { reassigned_from: slip.assigned_to, previous_status: slip.status }
        : {}),
    });

    await client.query('COMMIT');
    return { slip: result.rows[0], reassignedFrom: isReassignment ? slip.assigned_to : null };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Add a second packer ────────────────────────────────────────
// Sponsor change request: a slip can be worked by two people "where
// required" — a big pallet, someone training a new hire, a short-
// staffed shift. Deliberately its own function rather than a second
// call into assignSlip: a second packer is additive (the pallet
// already has an owner and this names a helper), not a claim/conflict
// decision the way the primary assignment is, so it doesn't belong in
// the same conflict/reassignment branching.
//
// Requires a primary first (slip.assigned_to already set) — a helper
// with nobody to help does not mean anything, and it keeps "who is
// the primary" unambiguous for every other check in this file that
// still only reads assigned_to (started_at, reassignment history,
// etc.).
const addSecondPacker = async ({ slipId, packerId, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, status, assigned_to, assigned_to_2 FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = current.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }

    if (!CLAIMABLE_STATUSES.includes(slip.status)) {
      await client.query('ROLLBACK');
      return { locked: true, status: slip.status };
    }

    if (!slip.assigned_to) {
      await client.query('ROLLBACK');
      return { noPrimary: true };
    }

    // Already on it, one way or the other — quiet success, same as
    // assignSlip tapping the same button twice.
    if (slip.assigned_to === packerId || slip.assigned_to_2 === packerId) {
      await client.query('ROLLBACK');
      return { slip };
    }

    if (slip.assigned_to_2) {
      await client.query('ROLLBACK');
      return { full: true, assignedTo2: slip.assigned_to_2 };
    }

    const result = await client.query(
      `UPDATE picking_slips SET assigned_to_2 = $1 WHERE id = $2 RETURNING *`,
      [packerId, slipId]
    );

    await logEvent(client, slipId, 'assigned', actorId, {
      packer_id: packerId,
      second_packer: true,
    });

    await client.query('COMMIT');
    return { slip: result.rows[0] };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Release a slip back to the floor ──────────────────────────
// The other half of assignSlip: nothing until now could put
// assigned_to back to NULL once it was set — assignSlip only ever
// claims. This clears both packer slots and returns the slip to
// 'pending' so it's spare/claimable again, replacing what used to be
// a manager hand-picking a specific worker on the floor's behalf.
//
// Item-level progress (confirmed/flagged lines) is left untouched —
// releasing is about who holds the pallet, not what's already been
// packed on it, so the next claimant picks up where the last one left
// off rather than starting the checklist over.
// `beforeCommit(client, facts)`, when given, runs inside this
// transaction just before COMMIT — the service's notification goes in
// with the change or not at all (features/communications/notices.js).
const releaseSlip = async ({ slipId, actorId, beforeCommit }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, status, assigned_to FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = current.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }

    if (slip.status !== 'in_progress') {
      await client.query('ROLLBACK');
      return { notClaimed: true, status: slip.status };
    }

    const result = await client.query(
      `UPDATE picking_slips
       SET assigned_to = NULL, assigned_to_2 = NULL, status = 'pending'
       WHERE id = $1
       RETURNING *`,
      [slipId]
    );

    // Reuses the 'assigned' event_type rather than adding a new one —
    // same reasoning as the reassignment case above: event_type is a
    // DB-level CHECK constraint, and a label it has never seen would
    // roll back the one transaction a manager is relying on to free
    // up a pallet.
    await logEvent(client, slipId, 'assigned', actorId, {
      packer_id: null,
      released_from: slip.assigned_to,
    });

    // The centre's name, for the floor's "back on the floor" notice
    // and the caller's push message.
    const ecd = await client.query('SELECT name FROM ecd_centres WHERE id = $1', [result.rows[0].ecd_id]);
    const ecdName = ecd.rows[0]?.name ?? 'a centre';
    if (beforeCommit) await beforeCommit(client, { slipId, ecdName });

    await client.query('COMMIT');
    return { slip: result.rows[0], ecdName };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Edit a pending slip ─────────────────────────────────────────
// Manager-only "fix it before it goes out": dispatch date, cohort,
// and/or the full set of product lines. Only reachable while the slip
// is still 'pending' — which is also the only state where every item
// on it is guaranteed to still be 'pending' too, since confirmItem/
// flagItem both require the slip to already be claimed. So there's no
// per-item lock to worry about here the way setItemStatus has to.
//
// `items`, when provided, REPLACES the slip's lines wholesale — the
// client sends the whole edited list, this deletes what's there and
// inserts what was sent, inside the same lock. Simpler and safer than
// diffing adds/removes/quantity-changes against the old set, and
// nothing yet references an item's own id externally at this stage —
// no confirm/flag has happened on a pending slip.
const editSlip = async ({ slipId, dispatchDate, cohort, items, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, ecd_id, status, dispatch_date, cohort FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId]
    );
    const slip = current.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }

    if (slip.status !== 'pending') {
      await client.query('ROLLBACK');
      return { locked: true, status: slip.status };
    }

    if (dispatchDate || cohort) {
      const nextDate = dispatchDate || slip.dispatch_date;
      const nextCohort = cohort || slip.cohort;

      // Same uniqueness this ECD's slips are created under
      // (createSlip's ON CONFLICT (ecd_id, dispatch_date)) — moving a
      // slip onto a date that already has one for this ECD is a
      // conflict, not a silent merge.
      const conflict = await client.query(
        `SELECT id FROM picking_slips WHERE ecd_id = $1 AND dispatch_date = $2::date AND id != $3`,
        [slip.ecd_id, nextDate, slipId]
      );
      if (conflict.rows[0]) {
        await client.query('ROLLBACK');
        return { dateConflict: true };
      }

      await client.query(
        `UPDATE picking_slips SET dispatch_date = $1::date, cohort = $2::cohort_group WHERE id = $3`,
        [nextDate, nextCohort, slipId]
      );
    }

    if (items) {
      await client.query(`DELETE FROM picking_slip_items WHERE picking_slip_id = $1`, [slipId]);
      for (const item of items) {
        await client.query(
          `INSERT INTO picking_slip_items (picking_slip_id, product_id, required_quantity, unit)
           VALUES ($1, $2, $3, $4)`,
          [slipId, item.productId, item.quantity, item.unit]
        );
      }
    }

    // Reuses 'generated' rather than adding a new event_type — same
    // reasoning as reusing 'assigned' for a release/reassignment:
    // event_type is a DB-level CHECK constraint, and a label it has
    // never seen would roll back the one transaction a manager is
    // relying on to fix a mistake before it ships.
    await logEvent(client, slipId, 'generated', actorId, {
      edited: true,
      dispatch_date: dispatchDate || undefined,
      cohort: cohort || undefined,
      item_count: items ? items.length : undefined,
    });

    const updated = await client.query(`SELECT * FROM picking_slips WHERE id = $1`, [slipId]);

    await client.query('COMMIT');
    return { slip: updated.rows[0] };

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
const setItemStatus = async ({ slipId, itemId, status, packedQuantity, flagReason, note, actorId, actor, canOverride = false }) => {
  const who = asActor(actor, actorId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slipResult = await client.query(
      `SELECT id, status, assigned_to, assigned_to_2, assigned_volunteer_id FROM picking_slips WHERE id = $1 FOR UPDATE`,
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
    // See canWorkSlip: the slip's owner for this kind of actor, or
    // the second packer when the actor is staff.
    if (!canOverride && !canWorkSlip(who, slip)) {
      await client.query('ROLLBACK');
      return { forbidden: true, assignedTo: slip.assigned_to };
    }

    const result = await client.query(
      `UPDATE picking_slip_items
       SET status          = $1::picking_item_status,
           packed_quantity = $2,
           flag_reason     = $3,
           packer_note     = $4,
           confirmed_by    = $5,
           confirmed_at    = NOW()
       WHERE id = $6 AND picking_slip_id = $7
       RETURNING *, (packed_quantity - required_quantity) AS quantity_variance`,
      // confirmed_by is NULL for a guest — see actorUserId above.
      [status, packedQuantity ?? null, flagReason ?? null, note ?? null, actorUserId(who), itemId, slipId]
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

    // Same event vocabulary for guests as for staff. A guest_* event type
    // would drop every guest action out of the existing reporting queries.
    await logEvent(
      client, slipId,
      status === 'flagged' ? 'item_flagged' : 'item_confirmed',
      actorUserId(who),
      actorDetail(who, { item_id: itemId, required_quantity: required, packed_quantity: packedQuantity, flag_reason: flagReason, note })
    );

    if (variance) {
      await logEvent(client, slipId, 'item_variance', actorUserId(who), actorDetail(who, { item_id: itemId, ...variance }));
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
const completeSlip = async ({ slipId, palletRef, actorId, actor, canOverride = false }) => {
  const who = asActor(actor, actorId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slipResult = await client.query(
      `SELECT id, status, assigned_to, assigned_to_2, assigned_volunteer_id FROM picking_slips WHERE id = $1 FOR UPDATE`,
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
    // writes that lead up to it. Either packer may close it out.
    if (!canOverride && !canWorkSlip(who, slip)) {
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
      // completed_by is the third int4 FK to users(id), and carries the
      // same hazard as actor_id and confirmed_by — NULL for a guest.
      // assigned_volunteer_id already records which volunteer held it.
      [actorUserId(who), palletRef ?? null, slipId]
    );

    await logEvent(client, slipId, 'completed', actorUserId(who), actorDetail(who, { pallet_ref: palletRef }));
    if (shortfalls.length > 0) {
      await logEvent(client, slipId, 'stock_shortfall', actorUserId(who), actorDetail(who, { shortfalls }));
    }
    if (unitMismatches.length > 0) {
      await logEvent(client, slipId, 'unit_mismatch', actorUserId(who), actorDetail(who, { unitMismatches }));
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

// ── Assignable workers (manager-only lookup) ────────────────────
// Deliberately narrow: id + name only, active warehouse_worker
// accounts only. This is NOT a general users read — /api/users stays
// admin-only account provisioning (see user.routes.js's own header
// comment). This exists solely so AssignPickingSlipsPage.jsx's
// dropdown has someone to assign a slip to.
const getAssignableWorkers = async () => {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name
       FROM users
      WHERE role = 'warehouse_worker' AND is_active = true
      ORDER BY first_name ASC, last_name ASC`
  );
  return rows;
};

export default {
  CLAIMABLE_STATUSES,
  getSlips,
  getSlipById,
  generateSlips,
  createSlip,
  assignSlip,
  addSecondPacker,
  releaseSlip,
  editSlip,
  setItemStatus,
  completeSlip,
  getAssignableWorkers,
};
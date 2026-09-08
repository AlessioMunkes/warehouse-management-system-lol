// ─────────────────────────────────────────────────────────────
// server/src/repositories/dispatch.repository.js
//
// All SQL for the dispatch gate.
// No business logic here — only database queries.
//
// This module owns the stock deduction for the picking → packing →
// dispatch chain. picking.repository.completeSlip() deliberately does
// not touch stock; the food is still on a pallet in the staging area
// at that point. It leaves the building here, and the quantity that
// leaves is loaded_quantity — what dispatch staff counted into the
// vehicle — not packed_quantity, which is what the packer believed
// they put on the pallet on Monday.
//
// That distinction is the entire reason the gate re-check exists in
// the current paper process, and it is the only place in the system
// where a human physically counts the goods twice.
//
// NON-COLLECTION NEEDS NO REVERSAL. Nothing was deducted at packing,
// so a pallet that is never collected simply stops being counted as
// committed (see committedStock.sql.js) and the goods read as
// available again. There is no compensating movement to post, and
// therefore nothing to make idempotent, nothing to double-post, and
// nothing to unwind if the beneficiary turns up late.
// ─────────────────────────────────────────────────────────────
import pool       from '../config/db.js';
import stockModel from './stock.repository.js';

// ── Audit helper ──────────────────────────────────────────────
// Dispatch writes into picking_events, not a separate log. The slip
// and the pallet are the same physical object, and a manager
// investigating a short delivery should not have to open two
// histories to see it generated, packed and collected.
const logEvent = async (client, slipId, eventType, actorId, detail = null) => {
  await client.query(
    `INSERT INTO picking_events (picking_slip_id, event_type, actor_id, detail)
     VALUES ($1, $2, $3, $4)`,
    [slipId, eventType, actorId, detail]
  );
};

// ── The gate board ────────────────────────────────────────────
// Every pallet that is packed and waiting, plus everything already
// handled today, so dispatch staff can see the whole day rather than
// only the outstanding queue. Drivers arrive first come, first
// served, so the board is ordered by beneficiary name for lookup speed, not
// by any notion of scheduled time.
//
// Three ways to scope it:
//   dispatchDate   — one exact day. Used by the manager's board and
//                    by the sweep, which both reason about a date.
//   gateToday      — the gate's own view: every pallet still
//                    outstanding on ANY date, plus whatever was
//                    handled today. A pallet staged for Tuesday that
//                    nobody fetched is still sitting in the building
//                    on Thursday, and the gate has to be able to
//                    release it — the 16:00 sweep marks it
//                    not_collected but explicitly leaves it
//                    collectable as a late collection.
//   neither        — no date restriction at all.
// dispatchDate wins if both are supplied.
//
// gateToday must be a SAST date string from todayString(), never
// CURRENT_DATE: Render runs UTC, so between midnight and 02:00 SAST
// CURRENT_DATE is still yesterday and the day's collections would
// drop off the board.
const getBoard = async ({ dispatchDate, cohort, status, gateToday }) => {
  const params = [];
  const where  = [`ps.status IN ('complete', 'dispatched')`];

  if (dispatchDate) {
    params.push(dispatchDate);
    where.push(`ps.dispatch_date = $${params.length}`);
  } else if (gateToday) {
    params.push(gateToday);
    // "Outstanding" is the absence of a completed collection, not a
    // specific status: no event row yet, or an event that is not one
    // of the two terminal collected states. not_collected is
    // deliberately outstanding — it is written off, not gone.
    where.push(`(
         de.id IS NULL
      OR de.status IS NULL
      OR de.status NOT IN ('collected', 'late_collected')
      OR ps.dispatch_date = $${params.length}::date
    )`);
  }
  if (cohort)       { params.push(cohort);       where.push(`ps.cohort = $${params.length}`); }
  if (status) {
    params.push(status);
    // 'awaiting' on the board means "no dispatch event yet" as well as
    // an explicit awaiting row, because an event is only created when
    // something actually happens to the pallet.
    where.push(
      status === 'awaiting'
        ? `(de.id IS NULL OR de.status = $${params.length})`
        : `de.status = $${params.length}`
    );
  }

  const result = await pool.query(
    `SELECT
       ps.id                AS picking_slip_id,
       ps.dispatch_date,
       ps.cohort,
       ps.pallet_ref,
       ps.status            AS slip_status,
       e.id                 AS ecd_id,
       e.name               AS ecd_name,
       e.contact_name,
       e.child_count,
       e.is_active          AS ecd_is_active,
       e.last_collected_date,
       de.id                AS dispatch_event_id,
       COALESCE(de.status, 'awaiting') AS dispatch_status,
       de.collected_at,
       de.driver_name,
       de.vehicle_reg,
       de.flagged_at,
       u.first_name         AS dispatched_by_name,
       COUNT(psi.id)                                        AS total_items,
       COUNT(psi.id) FILTER (WHERE psi.status = 'flagged')  AS flagged_items,
       COUNT(psi.id) FILTER (
         WHERE psi.status = 'confirmed'
           AND psi.packed_quantity IS DISTINCT FROM psi.required_quantity
       )                                                    AS variance_items
     FROM picking_slips ps
     JOIN ecd_centres e ON e.id = ps.ecd_id
     LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
     LEFT JOIN users u ON u.id = de.dispatched_by
     LEFT JOIN picking_slip_items psi ON psi.picking_slip_id = ps.id
     WHERE ${where.join(' AND ')}
     GROUP BY ps.id, e.id, de.id, u.first_name
     ORDER BY e.name ASC`,
    params
  );

  return result.rows;
};

// ── Past collections, for the staff history page ───────────────
// getBoard above answers "what's outstanding" for one day or the
// live gate queue — it was never a multi-day history the way
// delivery.repository.js's getDeliveries(range) is. This is that
// equivalent for dispatch: every COMPLETED collection in the given
// range, most recent first, each row carrying its dispatch_event_id
// so the staff page can open that collection's note.
const getHistory = async (range = 'all') => {
  let dateFilter = '';

  if (range === 'today') {
    dateFilter = `AND de.collected_at::date = CURRENT_DATE`;
  } else if (range === 'week') {
    dateFilter = `AND de.collected_at >= CURRENT_DATE - INTERVAL '7 days'`;
  } else if (range === 'month') {
    dateFilter = `AND de.collected_at >= CURRENT_DATE - INTERVAL '30 days'`;
  }

  const result = await pool.query(
    `SELECT
       de.id            AS dispatch_event_id,
       de.status,
       de.collected_at,
       de.driver_name,
       ps.id            AS picking_slip_id,
       ps.dispatch_date,
       ps.pallet_ref,
       e.name           AS ecd_name
     FROM dispatch_events de
     JOIN picking_slips ps ON ps.id = de.picking_slip_id
     JOIN ecd_centres e    ON e.id = ps.ecd_id
     WHERE de.status IN ('collected', 'late_collected') ${dateFilter}
     ORDER BY de.collected_at DESC`
  );

  return result.rows;
};

// ── One pallet, as the gate sees it ───────────────────────────
// Returns everything the service needs to work out eligibility
// (BR-11 active centre, BR-12 cohort day, BR-15 flagged lines) plus
// the lines themselves, pre-filled with packed_quantity so the
// default action at the gate is "everything matched".
const getGateView = async (slipId) => {
  const slipResult = await pool.query(
    `SELECT
       ps.id,
       ps.dispatch_date,
       ps.cohort,
       ps.pallet_ref,
       ps.status            AS slip_status,
       ps.completed_at,
       e.id                 AS ecd_id,
       e.name               AS ecd_name,
       e.contact_name,
       e.child_count,
       e.is_active          AS ecd_is_active,
       e.approved_at        AS ecd_approved_at,
       e.last_collected_date,
       de.id                AS dispatch_event_id,
       de.status            AS dispatch_status,
       de.collected_at,
       de.driver_name,
       de.vehicle_reg,
       de.flagged_at,
       de.override_reason
     FROM picking_slips ps
     JOIN ecd_centres e ON e.id = ps.ecd_id
     LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
     WHERE ps.id = $1`,
    [slipId]
  );

  if (!slipResult.rows[0]) return null;

  const itemsResult = await pool.query(
    `SELECT
       psi.id,
       psi.product_id,
       psi.required_quantity,
       psi.packed_quantity,
       psi.unit,
       psi.status,
       psi.flag_reason,
       p.name               AS product_name,
       p.stock_keeping_unit AS sku,
       del.loaded_quantity,
       del.variance_reason
     FROM picking_slip_items psi
     JOIN products p ON p.id = psi.product_id
     LEFT JOIN dispatch_events de  ON de.picking_slip_id = psi.picking_slip_id
     LEFT JOIN dispatch_event_lines del
            ON del.dispatch_event_id = de.id
           AND del.picking_slip_item_id = psi.id
     WHERE psi.picking_slip_id = $1
     ORDER BY p.name ASC, psi.unit ASC`,
    [slipId]
  );

  return { ...slipResult.rows[0], items: itemsResult.rows };
};

// ── Record a collection ───────────────────────────────────────
// This is the only write in the picking chain that moves stock.
//
// `lines` is a sparse override map: [{ itemId, loadedQuantity,
// varianceReason }]. Anything not named keeps its packed quantity,
// because the overwhelmingly common case at the gate is that the
// count matched and staff should not have to retype twenty numbers to
// say so.
//
// Idempotency: the client generates a UUID per collection attempt and
// it is stored UNIQUE. The gate is the one screen that genuinely runs
// offline — a driver is standing in a yard with no signal — so the
// PWA queues the payload and replays it on reconnect. A replay finds
// the existing event and returns it instead of deducting twice.
//
// Late collection is not a separate path. A pallet the 16:00 sweep
// already wrote off has a 'not_collected' event; if the driver turns
// up afterwards this function updates that row to 'late_collected'
// and deducts as normal. Because non-collection posted no movement,
// there is nothing to unwind first.
const collect = async ({
  slipId, driverName, vehicleReg, signature,
  lines = [], idempotencyKey = null, overrideReason = null,
  actorId,
  // Advisory flags from the service. These do not change what is
  // written to stock or to dispatch_events; they are recorded in the
  // audit log so a manager can see the collection was irregular
  // without the gate having refused it.
  wrongDay = false, bookedFor = null,
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Replay check, before anything is locked or written ──
    if (idempotencyKey) {
      const replay = await client.query(
        `SELECT * FROM dispatch_events WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (replay.rows[0]) {
        await client.query('COMMIT');
        return { event: replay.rows[0], replayed: true };
      }
    }

    const slipResult = await client.query(
      `SELECT ps.id, ps.status, ps.ecd_id, ps.dispatch_date, e.is_active AS ecd_is_active
       FROM picking_slips ps
       JOIN ecd_centres e ON e.id = ps.ecd_id
       WHERE ps.id = $1
       FOR UPDATE OF ps`,
      [slipId]
    );
    const slip = slipResult.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }

    // The slip must be packed. The service decides whether a manager
    // may override this; the repository only reports the state.
    if (slip.status !== 'complete' && slip.status !== 'dispatched') {
      await client.query('ROLLBACK');
      return { notPacked: true, slipStatus: slip.status };
    }

    const existingResult = await client.query(
      `SELECT * FROM dispatch_events WHERE picking_slip_id = $1 FOR UPDATE`,
      [slipId]
    );
    const existing = existingResult.rows[0] ?? null;

    if (existing && ['collected', 'late_collected'].includes(existing.status)) {
      await client.query('ROLLBACK');
      return { alreadyDispatched: true, event: existing };
    }

    const isLate = existing?.status === 'not_collected';

    // ── Resolve what actually goes in the vehicle ──────────────
    const packedResult = await client.query(
      `SELECT id, product_id, packed_quantity, unit
       FROM picking_slip_items
       WHERE picking_slip_id = $1
         AND status IN ('confirmed', 'flagged')
         AND packed_quantity IS NOT NULL
         AND packed_quantity > 0
       ORDER BY product_id ASC, id ASC`,
      [slipId]
    );

    const overrides = new Map(
      lines
        .filter((l) => l && l.itemId !== undefined && l.itemId !== null)
        .map((l) => [Number(l.itemId), l])
    );

    // ── Upsert the event header ────────────────────────────────
    const eventResult = existing
      ? await client.query(
          `UPDATE dispatch_events
           SET status          = $1,
               collected_at    = NOW(),
               dispatched_by   = $2,
               driver_name     = $3,
               vehicle_reg     = $4,
               signature       = $5,
               override_reason = COALESCE($6, override_reason),
               override_by     = CASE WHEN $6::text IS NOT NULL THEN $2::integer ELSE override_by END,
               idempotency_key = COALESCE($7, idempotency_key)
           WHERE id = $8
           RETURNING *`,
          ['late_collected', actorId, driverName, vehicleReg ?? null,
           signature ?? null, overrideReason, idempotencyKey, existing.id]
        )
      : await client.query(
          `INSERT INTO dispatch_events
             (picking_slip_id, status, collected_at, dispatched_by, driver_name,
              vehicle_reg, signature, override_reason, override_by, idempotency_key)
           VALUES ($1, 'collected', NOW(), $2::integer, $3, $4, $5, $6,
                   -- $2 is deduced as integer from dispatched_by above, then
                   -- deduced again inside this CASE against an untyped NULL.
                   -- The two deductions conflict and Postgres raises 42P08
                   -- ("inconsistent types deduced for parameter $2") — on
                   -- FIRST-TIME collection only, since the UPDATE branch
                   -- below has an ELSE override_by, a column with a known
                   -- type. Casting both arms pins it. Reproduced and fixed
                   -- against real Postgres 16; the pg mock in the tests
                   -- cannot see this class of error at all.
                   CASE WHEN $6::text IS NOT NULL THEN $2::integer
                        ELSE NULL::integer END, $7)
           RETURNING *`,
          [slipId, actorId, driverName, vehicleReg ?? null,
           signature ?? null, overrideReason, idempotencyKey]
        );

    const event = eventResult.rows[0];

    // Lines are rewritten wholesale rather than merged — a late
    // collection re-counts the pallet from scratch, and a partial
    // merge would leave stale loaded quantities from the first visit.
    await client.query(`DELETE FROM dispatch_event_lines WHERE dispatch_event_id = $1`, [event.id]);

    for (const item of packedResult.rows) {
      const override = overrides.get(Number(item.id));
      const loaded   = override && override.loadedQuantity !== undefined && override.loadedQuantity !== null
        ? override.loadedQuantity
        : item.packed_quantity;

      await client.query(
        `INSERT INTO dispatch_event_lines
           (dispatch_event_id, picking_slip_item_id, product_id,
            packed_quantity, loaded_quantity, unit, variance_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [event.id, item.id, item.product_id, item.packed_quantity,
         loaded, item.unit, override?.varianceReason ?? null]
      );
    }

    // ── Deduct ─────────────────────────────────────────────────
    // Summed per product by Postgres, then locked in product_id
    // order. That lock order is shared with every other caller of
    // adjustStock (procurement, manual adjustment) so two
    // transactions touching the same two products cannot deadlock.
    //
    // A shortfall here is a real signal, not the artefact it was when
    // packing did the deduction: the ledger says the building does
    // not hold what just drove out of it. It still does not block —
    // the vehicle has already left — but it goes to the manager.
    const toDeduct = await client.query(
      `SELECT product_id,
              SUM(loaded_quantity)::numeric AS loaded_quantity,
              MIN(unit)                     AS unit
       FROM dispatch_event_lines
       WHERE dispatch_event_id = $1
         AND loaded_quantity > 0
       GROUP BY product_id
       ORDER BY product_id ASC`,
      [event.id]
    );

    const shortfalls     = [];
    const unitMismatches = [];

    for (const row of toDeduct.rows) {
      const { before, after, isShortfall, isUnitMismatch } = await stockModel.adjustStock(client, {
        productId:     row.product_id,
        quantityDelta: -Number(row.loaded_quantity),
        unit:          row.unit,
        movementType:  'dispatched',
        referenceType: 'dispatch_event',
        referenceId:   event.id,
        performedBy:   actorId,
      });

      if (isShortfall) {
        shortfalls.push({
          productId: row.product_id,
          onHand:    before,
          loaded:    Number(row.loaded_quantity),
          after,
        });
      }
      if (isUnitMismatch) {
        unitMismatches.push({ productId: row.product_id, dispatchUnit: row.unit });
      }
    }

    await client.query(
      `UPDATE picking_slips
       SET status = 'dispatched', dispatched_at = NOW()
       WHERE id = $1`,
      [slipId]
    );

    // Drives the "has this centre been collecting?" line on the
    // packing screen and the non-collection escalation (BR-26).
    await client.query(
      `UPDATE ecd_centres SET last_collected_date = CURRENT_DATE WHERE id = $1`,
      [slip.ecd_id]
    );

    await logEvent(client, slipId, isLate ? 'late_collected' : 'dispatched', actorId, {
      dispatch_event_id: event.id,
      driver_name:       driverName,
      vehicle_reg:       vehicleReg ?? null,
      override_reason:   overrideReason,
      line_count:        packedResult.rowCount,
    });
    if (shortfalls.length > 0) {
      await logEvent(client, slipId, 'stock_shortfall', actorId, { shortfalls, at: 'dispatch' });
    }
    if (unitMismatches.length > 0) {
      await logEvent(client, slipId, 'unit_mismatch', actorId, { unitMismatches, at: 'dispatch' });
    }
    // BR-12 as a record rather than a refusal. Logged separately from
    // the collection itself so it can be counted without parsing the
    // collection event's detail blob.
    if (wrongDay) {
      await logEvent(client, slipId, 'wrong_day_collection', actorId, {
        booked_for: bookedFor,
        at:         'dispatch',
      });
    }

    await client.query('COMMIT');
    return {
      event,
      isLate,
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

// ── The 16:00 sweep (BR-14) ───────────────────────────────────
// Writes a 'not_collected' event for every packed pallet on the given
// date that nobody has come for. No stock movement is posted, because
// none was ever posted for the pallet — the goods just stop counting
// as committed and read as available again on the next query.
//
// Idempotent by construction: the UNIQUE constraint on
// picking_slip_id means a second run inserts nothing, so it is safe
// to call from a scheduler AND opportunistically from the board.
const sweepNonCollections = async ({ dispatchDate, actorId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const swept = await client.query(
      `INSERT INTO dispatch_events (picking_slip_id, status, flagged_at, dispatched_by)
       SELECT ps.id, 'not_collected', NOW(), $2
       FROM picking_slips ps
       LEFT JOIN dispatch_events de ON de.picking_slip_id = ps.id
       WHERE ps.dispatch_date = $1::date
         AND ps.status = 'complete'
         AND de.id IS NULL
       ON CONFLICT (picking_slip_id) DO NOTHING
       RETURNING id, picking_slip_id`,
      [dispatchDate, actorId]
    );

    for (const row of swept.rows) {
      await logEvent(client, row.picking_slip_id, 'not_collected', actorId, {
        dispatch_event_id: row.id,
        dispatch_date:     dispatchDate,
        rule:              'BR-14',
      });
    }

    await client.query('COMMIT');
    return { flagged: swept.rowCount, slipIds: swept.rows.map((r) => r.picking_slip_id) };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Dispatch note ─────────────────────────────────────────────
// The proof-of-collection record. Reads from dispatch_event_lines
// rather than joining live picking_slip_items, so the note always
// reflects what was counted into the vehicle on the day even if the
// underlying master data changes later.
const getDispatchNote = async (eventId) => {
  const eventResult = await pool.query(
    `SELECT
       de.*,
       ps.dispatch_date,
       ps.cohort,
       ps.pallet_ref,
       e.name        AS ecd_name,
       e.contact_name,
       e.child_count,
       u.first_name  AS dispatched_by_name,
       o.first_name  AS override_by_name
     FROM dispatch_events de
     JOIN picking_slips ps ON ps.id = de.picking_slip_id
     JOIN ecd_centres e ON e.id = ps.ecd_id
     LEFT JOIN users u ON u.id = de.dispatched_by
     LEFT JOIN users o ON o.id = de.override_by
     WHERE de.id = $1`,
    [eventId]
  );

  if (!eventResult.rows[0]) return null;

  const linesResult = await pool.query(
    `SELECT
       del.id,
       del.product_id,
       del.packed_quantity,
       del.loaded_quantity,
       del.unit,
       del.variance_reason,
       p.name               AS product_name,
       p.stock_keeping_unit AS sku
     FROM dispatch_event_lines del
     JOIN products p ON p.id = del.product_id
     WHERE del.dispatch_event_id = $1
     ORDER BY p.name ASC`,
    [eventId]
  );

  return { ...eventResult.rows[0], lines: linesResult.rows };
};

// ── Non-collection history (BR-26) ────────────────────────────
// A centre that repeatedly fails to collect is an operations problem,
// not a one-off. The manager needs the pattern, not the single event.
const getNonCollectionHistory = async ({ ecdId, from, to }) => {
  const params = [];
  const where  = [`de.status = 'not_collected'`];

  if (ecdId) { params.push(ecdId); where.push(`ps.ecd_id = $${params.length}`); }
  if (from)  { params.push(from);  where.push(`ps.dispatch_date >= $${params.length}::date`); }
  if (to)    { params.push(to);    where.push(`ps.dispatch_date <= $${params.length}::date`); }

  const result = await pool.query(
    `SELECT
       de.id            AS dispatch_event_id,
       de.flagged_at,
       ps.id            AS picking_slip_id,
       ps.dispatch_date,
       ps.cohort,
       ps.pallet_ref,
       e.id             AS ecd_id,
       e.name           AS ecd_name,
       e.contact_name,
       COUNT(*) OVER (PARTITION BY e.id) AS ecd_non_collection_count
     FROM dispatch_events de
     JOIN picking_slips ps ON ps.id = de.picking_slip_id
     JOIN ecd_centres e ON e.id = ps.ecd_id
     WHERE ${where.join(' AND ')}
     ORDER BY ps.dispatch_date DESC, e.name ASC`,
    params
  );

  return result.rows;
};

export default {
  getBoard,
  getHistory,
  getGateView,
  collect,
  sweepNonCollections,
  getDispatchNote,
  getNonCollectionHistory,
};

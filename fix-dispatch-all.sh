#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# fix-dispatch-all.sh
#
# SUPERSEDES fix-dispatch.sh, fix-syntax.sh and fix-palletcheck.sh.
# Delete those three — running them after this one would undo it.
# (That is exactly what happened last time: fix-dispatch.sh carried
# the pre-fix dispatch.repository.js, so running it after
# fix-syntax.sh put the backtick bug straight back.)
#
# Contains, current as of this run:
#   - 42P08 fix (::integer casts), with the backtick bug NOT present
#   - gate board scope=gate: outstanding on any date + handled today
#   - PalletCheck restored (it was a byte-for-byte copy of GateQueue)
#   - writtenOff advisory, not override-gated
#   - wrongDay (BR-12) advisory, not override-gated; recorded as a
#     wrong_day_collection audit event instead
#   - module-loads.test.js: parses every server file, so a syntax
#     error in a vi.mock()'d repository cannot pass silently
#   - DispatchWiring.test.jsx: catches a duplicated component
#
# Run from the REPO ROOT:  bash fix-dispatch-all.sh
# Idempotent.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
if [ ! -d client ] || [ ! -d server ]; then
  echo "ERROR: run this from the repo root (needs client/ and server/)." >&2
  exit 1
fi
echo "Writing files..."

mkdir -p server/src/repositories
cat > server/src/repositories/dispatch.repository.js <<'ALLEOF_DISPATCH_REPOSITORY_JS'
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
// nothing to unwind if the ECD turns up late.
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
// served, so the board is ordered by ECD name for lookup speed, not
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
                   -- below has ELSE override_by, a column with a known
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
  getGateView,
  collect,
  sweepNonCollections,
  getDispatchNote,
  getNonCollectionHistory,
};
ALLEOF_DISPATCH_REPOSITORY_JS
echo "  wrote server/src/repositories/dispatch.repository.js"

mkdir -p server/src/services
cat > server/src/services/dispatch.service.js <<'ALLEOF_DISPATCH_SERVICE_JS'
// ─────────────────────────────────────────────────────────────
// server/src/services/dispatch.service.js
//
// Business logic for the dispatch gate.
// Validates data and enforces rules before touching the DB.
//
// The governing principle here is the same one that shaped the stock
// repository: the system never stops food leaving the building
// because of a data problem. Almost everything the gate checks is
// therefore a FLAG the screen shows, not an error that refuses the
// request. There is exactly one hard block — an ECD centre that is
// not active (BR-11) — because that is a governance decision made
// upstream by the programme team, not a discrepancy between a number
// in a database and a number on a shelf.
//
// Two things (a pallet booked for another day, and a slip packing has
// not closed off) proceed on a manager override with a recorded
// reason, which is what the paper process already does when Grizel
// signs off an exception at the gate.
//
// A collection after the 16:00 write-off is NOT one of them. It is
// recorded — the event becomes 'late_collected' and the day shows it
// as late — and otherwise proceeds exactly as an on-time collection
// does, with no override, no manager and no extra taps. The sweep
// exists to keep the non-collection history honest at the end of a
// day, not to close the gate at 16:00.
// ─────────────────────────────────────────────────────────────
import dispatchRepository from '../repositories/dispatch.repository.js';
import { ROLES }          from '../middleware/auth.middleware.js';
import { isValidDateString, isPositiveInt } from '../utils/validation.js';

const COHORTS  = ['week1', 'week2'];
const STATUSES = ['awaiting', 'collected', 'late_collected', 'not_collected', 'cancelled'];

// BR-14. Kept as a constant rather than a settings row for now — if
// the sponsor ever wants it configurable, move it to picking_settings
// alongside cohort_anchor_monday rather than adding a second
// settings mechanism.
export const NON_COLLECTION_CUTOFF_HOUR = 16;

// Signatures arrive as base64 PNG data URLs from a canvas, the same
// way delivery notes already store them. A signature from a phone
// canvas is a few tens of KB; the cap is there so a malformed client
// cannot push a multi-megabyte payload into a TEXT column on every
// collection.
const MAX_SIGNATURE_BYTES = 512 * 1024;

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const isManager = (user) => user.role === ROLES.MANAGER || user.role === ROLES.ADMIN;

// ─────────────────────────────────────────────────────────────
// TIME
//
// Two different questions get asked about time in this file, and they
// need two different tools. Conflating them is what broke both.
//
//   "What date is this pallet booked for?"  — a DATE column.
//   "What is the time in the warehouse?"    — an instant.
//
// The server runs in UTC. Render containers always do, and nothing in
// the deploy sets TZ, so process.env.TZ is unset and every JS date
// method that says "local" means UTC. Cape Town is UTC+2.
//
// The bug this replaces: both the 16:00 cutoff and "is this pallet
// for today?" were read with getHours()/getFullYear() off a plain
// new Date(). On a developer's laptop that gave the right answer and
// on Render it gave a UTC one, so BR-14's 16:00 write-off actually
// fired at 18:00 SAST — two hours after the gate closed, every day —
// and the day itself rolled over at 02:00 SAST rather than midnight.
//
// South Africa has no daylight saving and has not since 1944, so a
// fixed offset is exact here. It is also more honest than
// Intl/timeZone lookups, which would silently depend on the
// container's ICU data being present and current.
// ─────────────────────────────────────────────────────────────
export const SAST_OFFSET_MINUTES = 2 * 60;

const pad = (n) => String(n).padStart(2, '0');

// Shift the instant forward by the offset, then read UTC components.
// UTC components are the same number on every machine, so this
// answers "what time is it in Cape Town" identically in CI, on a
// laptop, and on Render.
const sastNow = () => new Date(Date.now() + SAST_OFFSET_MINUTES * 60 * 1000);

// Today's date in the warehouse.
export const todayString = () => {
  const d = sastNow();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// The hour on the warehouse clock, 0-23. What BR-14's cutoff is
// compared against.
export const currentHour = () => sastNow().getUTCHours();

// ── Formatting a DATE column ──────────────────────────────────
// DELIBERATELY different from the above, and not interchangeable
// with it. node-postgres parses a DATE into a JS Date at LOCAL
// midnight, so '2026-08-19' becomes midnight-in-whatever-zone-this-
// process-is. Reading the LOCAL components back gives the original
// string on any machine; toISOString() would shift it a day backwards
// anywhere east of UTC.
//
// Only ever pass this a value that came out of a DATE column. Passing
// it new Date() is what produced the wrong "today" — that is what
// todayString() above is for.
export const pgDateToString = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── Date input from a client ──────────────────────────────────
// isValidDateString lives in utils/validation.js now, not here.
// delivery.service.js needs exactly the same check, and a second copy
// of a validator is how the movement_type constraint and the role
// constants both drifted. See that file for why new Date(x) is not a
// validator.
//
// Why it matters at this particular call site: dispatchDate reaches
// Postgres as $1::date, and the sweep trigger below is a STRING
// compare — so '0000-99-99' reads as a past date and triggers a WRITE
// before anything gets as far as a cast error.

// ── Eligibility ───────────────────────────────────────────────
// Computed in one place so the gate screen and the collect endpoint
// can never disagree about whether a pallet needs an override. The
// screen renders these as warnings; collect() below reads the same
// object to decide what it insists on.
export const evaluateEligibility = (gateView) => {
  const dispatchDay = pgDateToString(gateView.dispatch_date);

  return {
    ecdInactive:      gateView.ecd_is_active === false || gateView.ecd_approved_at === null,
    slipNotPacked:    !['complete', 'dispatched'].includes(gateView.slip_status),
    wrongDay:         dispatchDay !== null && dispatchDay !== todayString(),
    afterCutoff:      currentHour() >= NON_COLLECTION_CUTOFF_HOUR,
    writtenOff:       gateView.dispatch_status === 'not_collected',
    alreadyDispatched: ['collected', 'late_collected'].includes(gateView.dispatch_status),
    hasFlaggedLines:  (gateView.items || []).some((i) => i.status === 'flagged'),
    hasVariance:      (gateView.items || []).some(
      (i) => i.status === 'confirmed' &&
             i.packed_quantity !== null &&
             Number(i.packed_quantity) !== Number(i.required_quantity)
    ),
  };
};

// ── The gate board ────────────────────────────────────────────
// Runs the 16:00 sweep opportunistically. Render's scheduler is the
// primary trigger, but a cron job that silently stops firing is not
// something anyone notices until a month of stock counts is wrong, so
// the board also sweeps whenever it is loaded after the cutoff for a
// past-or-present date. sweepNonCollections is idempotent, so the two
// triggers cannot conflict.
const getBoard = async (query, user) => {
  const { dispatchDate, cohort, status, scope } = query;

  if (cohort && !COHORTS.includes(cohort))   fail(400, 'Cohort must be week1 or week2.');
  if (status && !STATUSES.includes(status))  fail(400, 'Invalid dispatch status filter.');
  if (scope !== undefined && scope !== 'gate') {
    fail(400, "Scope must be 'gate' if supplied.");
  }

  // Validated BEFORE it is compared or passed on. The comparison
  // below is a string compare, which happily calls '0000-99-99' a
  // past date and triggers a write against a value Postgres cannot
  // cast.
  if (dispatchDate !== undefined && !isValidDateString(dispatchDate)) {
    fail(400, 'Dispatch date must be a real date in YYYY-MM-DD form.');
  }

  // scope=gate carries no date of its own, so "today" is resolved
  // here rather than in SQL — todayString() is the one place that
  // knows the service runs in UTC and the warehouse does not.
  const gateToday = (!dispatchDate && scope === 'gate') ? todayString() : undefined;

  if (dispatchDate) {
    const today      = todayString();
    const isPast     = dispatchDate < today;
    const pastCutoff = currentHour() >= NON_COLLECTION_CUTOFF_HOUR;
    if (isPast || (dispatchDate === today && pastCutoff)) {
      await dispatchRepository.sweepNonCollections({ dispatchDate, actorId: user.id });
    }
  } else if (gateToday && currentHour() >= NON_COLLECTION_CUTOFF_HOUR) {
    // The gate board is the other place the sweep gets triggered from
    // (see the note above this function). Dropping the date filter
    // must not also drop that trigger, or an afternoon where nobody
    // opens the dated board leaves the day unswept.
    await dispatchRepository.sweepNonCollections({ dispatchDate: gateToday, actorId: user.id });
  }

  return await dispatchRepository.getBoard({ dispatchDate, cohort, status, gateToday });
};

// ── One pallet at the gate ────────────────────────────────────
const getGateView = async (slipId) => {
  const gateView = await dispatchRepository.getGateView(slipId);
  if (!gateView) fail(404, 'Picking slip not found.');

  return { ...gateView, eligibility: evaluateEligibility(gateView) };
};

// ── Validate the collection payload ───────────────────────────
const validateCollectBody = (body) => {
  const driverName = (body.driverName || '').trim();
  if (!driverName)             fail(400, 'The driver\'s name is required.');
  if (driverName.length > 120) fail(400, 'Driver name is too long.');

  // BR-13: a collection is not complete without digital confirmation.
  // This is the one piece of validation that is genuinely strict,
  // because the signature IS the proof of delivery that replaces the
  // paper register — a collection recorded without it is worth less
  // than the paper it replaced.
  const signature = body.signature;
  if (!signature || typeof signature !== 'string' || !signature.startsWith('data:image/')) {
    fail(400, 'The driver needs to sign before the collection can be recorded.');
  }
  if (Buffer.byteLength(signature, 'utf8') > MAX_SIGNATURE_BYTES) {
    fail(400, 'The signature image is too large.');
  }

  const vehicleReg = (body.vehicleReg || '').trim() || null;
  if (vehicleReg && vehicleReg.length > 20) fail(400, 'Vehicle registration is too long.');

  const rawLines = body.lines === undefined ? [] : body.lines;
  if (!Array.isArray(rawLines)) fail(400, 'Line corrections must be a list.');

  const lines = rawLines.map((line) => {
    const itemId = Number(line?.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) fail(400, 'Each line correction needs a valid item.');

    const loadedQuantity = Number(line.loadedQuantity);
    if (!Number.isFinite(loadedQuantity) || loadedQuantity < 0) {
      fail(400, 'A loaded quantity must be zero or more.');
    }

    const varianceReason = (line.varianceReason || '').trim() || null;
    if (varianceReason && varianceReason.length > 500) fail(400, 'Variance reason is too long.');

    return { itemId, loadedQuantity, varianceReason };
  });

  // A UUID from the client. Validated in shape only — it is a replay
  // key, not a credential, and a collision is a client bug rather
  // than an attack surface.
  const idempotencyKey = body.idempotencyKey ?? null;
  if (idempotencyKey !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    fail(400, 'Invalid request key.');
  }

  const overrideReason = (body.overrideReason || '').trim() || null;
  if (overrideReason && overrideReason.length > 500) fail(400, 'Override reason is too long.');

  return { driverName, vehicleReg, signature, lines, idempotencyKey, overrideReason };
};

// ── Record a collection ───────────────────────────────────────
const collect = async (slipId, body, user) => {
  const payload = validateCollectBody(body);

  const gateView = await dispatchRepository.getGateView(slipId);
  if (!gateView) fail(404, 'Picking slip not found.');

  const eligibility = evaluateEligibility(gateView);

  // The one hard block.
  if (eligibility.ecdInactive) {
    fail(409,
      `${gateView.ecd_name} is not an active centre with approved quantities, so a pallet cannot be released to it. ` +
      `A manager needs to activate the centre first.`
    );
  }

  if (eligibility.alreadyDispatched && !payload.idempotencyKey) {
    fail(409, 'This pallet has already been collected.');
  }

  // ── Override-gated exceptions ──────────────────────────────
  // Each one names what is wrong and what to do about it, in the
  // words the person at the gate would use (ACC-09). "Requires
  // authorisation" tells a warehouse worker nothing actionable; "ask
  // a manager to authorise it" does.
  const needsOverride = [];
  if (eligibility.slipNotPacked) {
    needsOverride.push('this pallet has not been closed off by the packing team yet');
  }
  // wrongDay is DELIBERATELY not in this list, for the same reason
  // writtenOff is not (see below).
  //
  // BR-12 says a pallet is booked for a cohort day. It does not say
  // food may not leave the building on any other day, and a driver
  // standing at the gate with a vehicle has already solved a harder
  // logistics problem than the calendar has. Blocking here meant a
  // centre that missed Tuesday could not collect until a manager was
  // physically found — and the manager's answer was always going to
  // be yes, because the alternative is food sitting in Epping while
  // children do not eat.
  //
  // It became untenable once the gate board stopped filtering to
  // today: the board now shows every pallet still outstanding on any
  // date, precisely so stale ones can be released, and EVERY one of
  // those trips wrongDay by definition. The block would have gated
  // the entire feature behind a manager.
  //
  // Recorded, not ignored. The collection is flagged wrong_day in the
  // audit log with the date it was actually booked for, so BR-26
  // reporting and any manager review still see it. Same principle as
  // shortfall and unit mismatch: the system records what happened
  // rather than refusing to let it happen.
  // writtenOff is DELIBERATELY not in this list.
  //
  // BR-14's 16:00 sweep is a bookkeeping act, not a gate closure. It
  // writes a 'not_collected' event so the non-collection history
  // (BR-26) is accurate for a day that has otherwise ended; it does
  // not mean the food has gone anywhere. If the driver turns up at
  // 16:40 the pallet is still on the floor and still theirs, and the
  // collection proceeds exactly as an on-time one would — the
  // repository upgrades the existing event to 'late_collected' and
  // deducts stock as normal, which is the flag.
  //
  // Requiring a manager here made the sweep a lock: the board sweeps
  // opportunistically whenever it is loaded after 16:00, so from
  // 16:00 onwards every remaining pallet became un-collectable by the
  // warehouse worker actually standing at the gate. That inverts the
  // rule that runs through this whole file — nothing stops food
  // leaving the building over a data disagreement — and the data
  // disagreement here is with a clock.

  if (needsOverride.length > 0) {
    if (!isManager(user)) {
      fail(403,
        `${needsOverride.join(', and ')}. Ask a manager to authorise this collection at the gate.`
      );
    }
    if (!payload.overrideReason) {
      fail(400,
        `${needsOverride.join(', and ')}. Record a short reason for authorising it.`
      );
    }
  }

  const result = await dispatchRepository.collect({
    slipId,
    driverName:     payload.driverName,
    vehicleReg:     payload.vehicleReg,
    signature:      payload.signature,
    lines:          payload.lines,
    idempotencyKey: payload.idempotencyKey,
    overrideReason: payload.overrideReason,
    actorId:        user.id,
    // Advisory, not a gate. Recorded against the collection so a
    // manager reviewing BR-26 can see it went out off-schedule.
    wrongDay:       eligibility.wrongDay,
    bookedFor:      eligibility.wrongDay ? pgDateToString(gateView.dispatch_date) : null,
  });

  if (result.notFound)          fail(404, 'Picking slip not found.');
  if (result.notPacked)         fail(409, 'This pallet has not been packed yet.');
  if (result.alreadyDispatched) fail(409, 'This pallet has already been collected.');

  return result;
};

// ── Run the 16:00 sweep on demand (manager only) ──────────────
// The scheduler calls the same service method. Exposed to managers
// too so a sweep can be forced after a power cut or a deploy that
// happened to land across 16:00.
const sweep = async (body, user) => {
  if (!isManager(user)) fail(403, 'Only managers can run the non-collection sweep.');

  const dispatchDate = body.dispatchDate || todayString();
  if (!isValidDateString(dispatchDate)) {
    fail(400, 'Dispatch date must be a real date in YYYY-MM-DD form.');
  }

  return await dispatchRepository.sweepNonCollections({ dispatchDate, actorId: user.id });
};

// ── Dispatch note ─────────────────────────────────────────────
// Readable by every warehouse role including finance — it is the
// proof-of-collection document, and finance needs it to reconcile the
// weekly cost-of-sales figure (BR-16).
const getDispatchNote = async (eventId) => {
  const note = await dispatchRepository.getDispatchNote(eventId);
  if (!note) fail(404, 'Dispatch note not found.');
  return note;
};

// ── Non-collection history (BR-26) ────────────────────────────
const getNonCollectionHistory = async (query, user) => {
  if (!isManager(user) && user.role !== ROLES.FINANCE) {
    fail(403, 'Only managers can view non-collection history.');
  }

  const { ecdId, from, to } = query;

  // Number('') is 0 and Number.isInteger(0) is true, so the old check
  // let an empty ecdId through as centre 0 and quietly returned
  // nothing instead of the unfiltered history the caller asked for.
  if (ecdId !== undefined && ecdId !== '' && !isPositiveInt(ecdId)) {
    fail(400, 'Invalid ECD centre.');
  }
  if (from !== undefined && from !== '' && !isValidDateString(from)) {
    fail(400, '"From" must be a real date in YYYY-MM-DD form.');
  }
  if (to !== undefined && to !== '' && !isValidDateString(to)) {
    fail(400, '"To" must be a real date in YYYY-MM-DD form.');
  }

  return await dispatchRepository.getNonCollectionHistory({
    ecdId: ecdId === undefined || ecdId === '' ? undefined : Number(ecdId),
    from:  from || undefined,
    to:    to   || undefined,
  });
};

export { isValidDateString };

export default {
  getBoard,
  getGateView,
  collect,
  sweep,
  getDispatchNote,
  getNonCollectionHistory,
};
ALLEOF_DISPATCH_SERVICE_JS
echo "  wrote server/src/services/dispatch.service.js"

mkdir -p server/__tests__
cat > server/__tests__/dispatch.service.test.js <<'ALLEOF_DISPATCH_SERVICE_TEST_JS'
// ─────────────────────────────────────────────────────────────
// server/__tests__/dispatch.service.test.js
//
// dispatch.repository.js is mocked, so these tests exercise the
// service's own rules. The focus is the two things that had no
// coverage at all and were both wrong:
//
//   1. TIME. The server runs in UTC and the warehouse is in Cape
//      Town (UTC+2). Every test here sets the system clock to a
//      specific UTC instant and asserts the answer the warehouse
//      would give, which is the only way to catch this class of bug
//      — the old code passed on a developer's laptop and failed on
//      Render precisely because nothing ever pinned the clock.
//
//   2. DATE INPUT. dispatchDate arrives as a raw query string and
//      reaches Postgres as $1::date. It is checked before it is
//      compared, because the comparison is a string compare that
//      calls '0000-99-99' a past date and triggers a WRITE.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const repoMock = {
  getBoard:                vi.fn(),
  getGateView:             vi.fn(),
  collect:                 vi.fn(),
  sweepNonCollections:     vi.fn(),
  getDispatchNote:         vi.fn(),
  getNonCollectionHistory: vi.fn(),
};

vi.mock('../src/repositories/dispatch.repository.js', () => ({ default: repoMock }));

const module = await import('../src/services/dispatch.service.js');
const dispatchService = module.default;
const {
  todayString,
  currentHour,
  pgDateToString,
  isValidDateString,
  evaluateEligibility,
  NON_COLLECTION_CUTOFF_HOUR,
} = module;

const MANAGER = { id: 1, role: 'manager' };
const WORKER  = { id: 2, role: 'warehouse_worker' };

// Freeze the clock at a UTC instant and say what the warehouse clock
// reads at that moment. Cape Town is UTC+2 with no daylight saving.
const atUtc = (iso) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  repoMock.getBoard.mockResolvedValue([]);
  repoMock.sweepNonCollections.mockResolvedValue({ flagged: 0, slipIds: [] });
  repoMock.getNonCollectionHistory.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

// ── The warehouse clock ───────────────────────────────────────
describe('todayString — the date in Cape Town, not the date in UTC', () => {
  it('is already tomorrow at 22:30 UTC', async () => {
    atUtc('2026-08-19T22:30:00Z');   // 00:30 on the 20th in Cape Town
    expect(todayString()).toBe('2026-08-20');
  });

  it('is still yesterday at 21:00 UTC', async () => {
    atUtc('2026-08-19T21:00:00Z');   // 23:00 on the 19th in Cape Town
    expect(todayString()).toBe('2026-08-19');
  });

  it('rolls over at 22:00 UTC exactly, which is midnight SAST', async () => {
    atUtc('2026-08-19T21:59:59Z');
    expect(todayString()).toBe('2026-08-19');
    atUtc('2026-08-19T22:00:00Z');
    expect(todayString()).toBe('2026-08-20');
  });

  it('crosses a month boundary correctly', async () => {
    atUtc('2026-08-31T22:00:00Z');
    expect(todayString()).toBe('2026-09-01');
  });

  it('pads single-digit months and days', async () => {
    atUtc('2026-01-05T08:00:00Z');
    expect(todayString()).toBe('2026-01-05');
  });
});

describe('currentHour — the hour on the warehouse clock', () => {
  it('reads 16:00 SAST when UTC says 14:00', () => {
    atUtc('2026-08-19T14:00:00Z');
    expect(currentHour()).toBe(16);
  });

  // The whole bug: getHours() on a UTC container returned 14 here, so
  // the cutoff did not fire until 18:00 SAST — two hours after the
  // gate closed, every single day.
  it('is at the cutoff at 14:00 UTC, not at 16:00 UTC', () => {
    atUtc('2026-08-19T14:00:00Z');
    expect(currentHour() >= NON_COLLECTION_CUTOFF_HOUR).toBe(true);

    atUtc('2026-08-19T13:59:00Z');
    expect(currentHour() >= NON_COLLECTION_CUTOFF_HOUR).toBe(false);
  });

  it('wraps past midnight without going negative', () => {
    atUtc('2026-08-19T23:30:00Z');   // 01:30 SAST
    expect(currentHour()).toBe(1);
  });
});

// ── DATE columns are a different problem ──────────────────────
describe('pgDateToString — formatting a value out of a DATE column', () => {
  // node-postgres parses a DATE at LOCAL midnight, so reading the
  // local components back returns the original string. toISOString()
  // would shift it a day backwards anywhere east of UTC.
  it('returns the date it was given', () => {
    expect(pgDateToString(new Date(2026, 7, 19))).toBe('2026-08-19');
  });

  it('pads single digits', () => {
    expect(pgDateToString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('returns null for something that is not a date', () => {
    expect(pgDateToString('not a date')).toBeNull();
  });
});

// ── Client-supplied dates ─────────────────────────────────────
describe('isValidDateString', () => {
  it.each(['2026-08-19', '2026-01-01', '2024-02-29'])('accepts %s', (value) => {
    expect(isValidDateString(value)).toBe(true);
  });

  it.each([
    ['0000-99-99', 'a shape-valid string with impossible parts'],
    ['2026-02-30', 'a day that does not exist in that month'],
    ['2025-02-29', 'a leap day in a non-leap year'],
    ['2026-13-01', 'a thirteenth month'],
    ['19-08-2026', 'the wrong field order'],
    ['Mon Aug 17 2026', 'something new Date() would happily accept'],
    ['2026-8-19', 'unpadded parts'],
    ['', 'an empty string'],
  ])('rejects %s — %s', (value) => {
    expect(isValidDateString(value)).toBe(false);
  });
});

// ── The board ─────────────────────────────────────────────────
describe('getBoard — the sweep trigger', () => {
  it('sweeps a past date whatever the time', async () => {
    atUtc('2026-08-19T06:00:00Z');   // 08:00 SAST
    await dispatchService.getBoard({ dispatchDate: '2026-08-18' }, MANAGER);
    expect(repoMock.sweepNonCollections).toHaveBeenCalledWith(
      { dispatchDate: '2026-08-18', actorId: MANAGER.id }
    );
  });

  it('does not sweep today before the cutoff', async () => {
    atUtc('2026-08-19T13:00:00Z');   // 15:00 SAST
    await dispatchService.getBoard({ dispatchDate: '2026-08-19' }, MANAGER);
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
  });

  // The two hours the old code got wrong.
  it('sweeps today from 16:00 SAST, which is 14:00 UTC', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await dispatchService.getBoard({ dispatchDate: '2026-08-19' }, MANAGER);
    expect(repoMock.sweepNonCollections).toHaveBeenCalled();
  });

  it('does not sweep a future date', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await dispatchService.getBoard({ dispatchDate: '2026-08-20' }, MANAGER);
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
  });

  it('does not sweep when no date is asked for', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await dispatchService.getBoard({}, MANAGER);
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
  });

  // A malformed date used to string-compare as "past", so it reached
  // the sweep — a WRITE — before Postgres rejected the cast.
  it('refuses a malformed date without writing anything', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await expect(dispatchService.getBoard({ dispatchDate: '0000-99-99' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
    expect(repoMock.getBoard).not.toHaveBeenCalled();
  });

  // ── scope=gate ──────────────────────────────────────────────
  // The gate board carries no date of its own. "Today" has to be
  // resolved from todayString(), not from CURRENT_DATE (UTC on
  // Render) and not from the browser clock.
  describe('scope=gate', () => {
    it("passes the SAST date as gateToday, not the UTC one", async () => {
      // 00:30 SAST on the 20th is still 22:30 UTC on the 19th. The
      // board must scope to the 20th, which is the day the warehouse
      // is having.
      atUtc('2026-08-19T22:30:00Z');
      await dispatchService.getBoard({ scope: 'gate' }, MANAGER);
      expect(repoMock.getBoard).toHaveBeenCalledWith(
        expect.objectContaining({ gateToday: '2026-08-20', dispatchDate: undefined })
      );
    });

    it('sweeps after the cutoff even with no date asked for', async () => {
      // Dropping the date filter must not drop the sweep trigger:
      // the gate board is the fallback for a cron that stops firing.
      atUtc('2026-08-19T14:00:00Z');   // 16:00 SAST
      await dispatchService.getBoard({ scope: 'gate' }, MANAGER);
      expect(repoMock.sweepNonCollections).toHaveBeenCalledWith(
        { dispatchDate: '2026-08-19', actorId: MANAGER.id }
      );
    });

    it('does not sweep before the cutoff', async () => {
      atUtc('2026-08-19T13:00:00Z');   // 15:00 SAST
      await dispatchService.getBoard({ scope: 'gate' }, MANAGER);
      expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
    });

    it('yields to an explicit dispatchDate', async () => {
      atUtc('2026-08-19T08:00:00Z');
      await dispatchService.getBoard(
        { scope: 'gate', dispatchDate: '2026-08-19' }, MANAGER
      );
      expect(repoMock.getBoard).toHaveBeenCalledWith(
        expect.objectContaining({ dispatchDate: '2026-08-19', gateToday: undefined })
      );
    });

    it('rejects an unknown scope rather than silently ignoring it', async () => {
      atUtc('2026-08-19T08:00:00Z');
      await expect(dispatchService.getBoard({ scope: 'everything' }, MANAGER))
        .rejects.toMatchObject({ status: 400 });
      expect(repoMock.getBoard).not.toHaveBeenCalled();
    });

    it('leaves the undated board unscoped and unswept', async () => {
      atUtc('2026-08-19T14:00:00Z');
      await dispatchService.getBoard({}, MANAGER);
      expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
      expect(repoMock.getBoard).toHaveBeenCalledWith(
        expect.objectContaining({ gateToday: undefined })
      );
    });
  });

  it('still rejects a bad cohort and status', async () => {
    atUtc('2026-08-19T08:00:00Z');
    await expect(dispatchService.getBoard({ cohort: 'week3' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    await expect(dispatchService.getBoard({ status: 'nonsense' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
  });
});

// ── Eligibility ───────────────────────────────────────────────
const gateView = (over = {}) => ({
  ecd_name:         'Little Stars',
  ecd_is_active:    true,
  ecd_approved_at:  '2026-01-01',
  slip_status:      'complete',
  dispatch_date:    new Date(2026, 7, 19),
  dispatch_status:  null,
  items:            [],
  ...over,
});

describe('evaluateEligibility — wrongDay against the warehouse date', () => {
  it('is not the wrong day for a pallet booked today', () => {
    atUtc('2026-08-19T06:00:00Z');
    expect(evaluateEligibility(gateView()).wrongDay).toBe(false);
  });

  // 00:30 SAST on the 20th. The old code read the UTC date, still the
  // 19th, and called a pallet booked for the 19th "today" — so an
  // early-morning collection quietly skipped the manager override it
  // should have needed.
  it('is the wrong day once Cape Town has rolled over, even though UTC has not', () => {
    atUtc('2026-08-19T22:30:00Z');
    expect(evaluateEligibility(gateView()).wrongDay).toBe(true);
  });

  it('flags afterCutoff on the warehouse clock', () => {
    atUtc('2026-08-19T14:00:00Z');
    expect(evaluateEligibility(gateView()).afterCutoff).toBe(true);
    atUtc('2026-08-19T13:00:00Z');
    expect(evaluateEligibility(gateView()).afterCutoff).toBe(false);
  });

  it('treats an unapproved centre as inactive (BR-11)', () => {
    atUtc('2026-08-19T06:00:00Z');
    expect(evaluateEligibility(gateView({ ecd_approved_at: null })).ecdInactive).toBe(true);
  });
});

// ── Sweep on demand ───────────────────────────────────────────
describe('sweep', () => {
  it('defaults to the warehouse date, not the UTC one', async () => {
    atUtc('2026-08-19T22:30:00Z');
    await dispatchService.sweep({}, MANAGER);
    expect(repoMock.sweepNonCollections).toHaveBeenCalledWith(
      { dispatchDate: '2026-08-20', actorId: MANAGER.id }
    );
  });

  it('refuses a non-manager', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await expect(dispatchService.sweep({}, WORKER)).rejects.toMatchObject({ status: 403 });
  });

  // new Date('Mon Aug 17 2026') is a valid Date, so the old check
  // passed it straight through to $1::date.
  it('refuses a date Postgres could not cast', async () => {
    atUtc('2026-08-19T14:00:00Z');
    await expect(dispatchService.sweep({ dispatchDate: 'Mon Aug 17 2026' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.sweepNonCollections).not.toHaveBeenCalled();
  });
});

// ── Non-collection history ────────────────────────────────────
describe('getNonCollectionHistory', () => {
  it('lets a manager through with no filters', async () => {
    await dispatchService.getNonCollectionHistory({}, MANAGER);
    expect(repoMock.getNonCollectionHistory).toHaveBeenCalledWith(
      { ecdId: undefined, from: undefined, to: undefined }
    );
  });

  it('refuses a worker', async () => {
    await expect(dispatchService.getNonCollectionHistory({}, WORKER))
      .rejects.toMatchObject({ status: 403 });
  });

  it('lets finance through — it feeds BR-16 reconciliation', async () => {
    await dispatchService.getNonCollectionHistory({}, { id: 3, role: 'finance' });
    expect(repoMock.getNonCollectionHistory).toHaveBeenCalled();
  });

  // Number('') is 0 and Number.isInteger(0) is true, so an empty
  // ecdId used to become "centre 0" and return nothing at all
  // instead of the unfiltered history that was asked for.
  it('treats an empty ecdId as no filter rather than centre zero', async () => {
    await dispatchService.getNonCollectionHistory({ ecdId: '' }, MANAGER);
    expect(repoMock.getNonCollectionHistory)
      .toHaveBeenCalledWith(expect.objectContaining({ ecdId: undefined }));
  });

  it.each(['0', '-4', 'abc', '2.5'])('rejects ecdId %s', async (ecdId) => {
    await expect(dispatchService.getNonCollectionHistory({ ecdId }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
  });

  it.each(['from', 'to'])('rejects a malformed %s date', async (key) => {
    await expect(dispatchService.getNonCollectionHistory({ [key]: '2026-02-30' }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.getNonCollectionHistory).not.toHaveBeenCalled();
  });

  it('passes a valid range through', async () => {
    await dispatchService.getNonCollectionHistory(
      { ecdId: '7', from: '2026-08-01', to: '2026-08-31' }, MANAGER
    );
    expect(repoMock.getNonCollectionHistory).toHaveBeenCalledWith(
      { ecdId: 7, from: '2026-08-01', to: '2026-08-31' }
    );
  });
});
// ── The 16:00 write-off is a flag, not a lock (BR-14) ─────────
// The sweep runs opportunistically from getBoard, so from 16:00
// onwards essentially every uncollected pallet carries
// dispatch_status = 'not_collected'. When that fed needsOverride, the
// effect was that the gate closed itself at 16:00 for the warehouse
// worker actually standing at it — a driver arriving at 16:40 had to
// find a manager before food could leave, which is the opposite of
// the rule this service is built on.
//
// These pin the corrected behaviour: written off still SHOWS (the
// flag survives, and the repository files the event as
// 'late_collected'), but it does not gate anything.
describe('a pallet written off at 16:00 can still be collected', () => {
  const writtenOff = () => gateView({ dispatch_status: 'not_collected' });

  beforeEach(() => {
    atUtc('2026-08-19T14:40:00Z');          // 16:40 SAST, after the sweep
    repoMock.collect.mockResolvedValue({ event: { id: 9, status: 'late_collected' } });
  });

  const body = {
    driverName: 'S. Mokoena',
    signature:  'data:image/png;base64,iVBORw0KGgo=',
  };

  it('still flags it as written off', () => {
    expect(evaluateEligibility(writtenOff()).writtenOff).toBe(true);
  });

  it('lets a warehouse worker collect it with no override reason', async () => {
    repoMock.getGateView.mockResolvedValue(writtenOff());

    await expect(dispatchService.collect(1, body, WORKER)).resolves.toMatchObject({
      event: { status: 'late_collected' },
    });

    expect(repoMock.collect).toHaveBeenCalledWith(
      expect.objectContaining({ overrideReason: null, actorId: WORKER.id })
    );
  });

  it('does not ask a manager for a reason either', async () => {
    repoMock.getGateView.mockResolvedValue(writtenOff());
    await expect(dispatchService.collect(1, body, MANAGER)).resolves.toBeTruthy();
  });

  // The cutoff alone — before the sweep has written anything — was
  // never a gate, and must not become one.
  it('does not gate on the clock alone', async () => {
    repoMock.getGateView.mockResolvedValue(gateView());
    expect(evaluateEligibility(gateView()).afterCutoff).toBe(true);
    await expect(dispatchService.collect(1, body, WORKER)).resolves.toBeTruthy();
  });

  // Being written off must not smuggle a pallet past the checks that
  // ARE gates. A written-off pallet at an inactive centre is still
  // blocked, and one that packing never closed off still needs a
  // manager.
  it('still blocks an inactive centre (BR-11)', async () => {
    repoMock.getGateView.mockResolvedValue(
      gateView({ dispatch_status: 'not_collected', ecd_is_active: false })
    );
    await expect(dispatchService.collect(1, body, WORKER)).rejects.toMatchObject({ status: 409 });
    expect(repoMock.collect).not.toHaveBeenCalled();
  });

  it('still needs a manager when packing has not closed the slip', async () => {
    repoMock.getGateView.mockResolvedValue(
      gateView({ dispatch_status: 'not_collected', slip_status: 'in_progress' })
    );
    await expect(dispatchService.collect(1, body, WORKER)).rejects.toMatchObject({ status: 403 });
  });
});

// ── BR-12 as an advisory ──────────────────────────────────────
// wrongDay used to require a manager's override. It became untenable
// once the gate board stopped filtering to today: the board now shows
// every pallet still outstanding on any date, so EVERY stale pallet
// trips wrongDay by definition and the block would have gated the
// whole feature behind a manager.
//
// It is recorded, not ignored — collect passes wrongDay and bookedFor
// down so the repository can log a wrong_day_collection event.
describe('a pallet booked for another day can still be collected', () => {
  const offSchedule = () => gateView({ dispatch_date: new Date(2026, 7, 17) });

  beforeEach(() => {
    atUtc('2026-08-19T08:00:00Z');          // 10:00 SAST, well before the cutoff
    repoMock.collect.mockResolvedValue({ event: { id: 11, status: 'collected' } });
  });

  const body = {
    driverName: 'N. Dlamini',
    signature:  'data:image/png;base64,iVBORw0KGgo=',
  };

  it('still flags it as the wrong day', () => {
    expect(evaluateEligibility(offSchedule()).wrongDay).toBe(true);
  });

  it('lets a warehouse worker collect it with no override reason', async () => {
    repoMock.getGateView.mockResolvedValue(offSchedule());

    await expect(dispatchService.collect(1, body, WORKER)).resolves.toBeTruthy();
    expect(repoMock.collect).toHaveBeenCalledWith(
      expect.objectContaining({ overrideReason: null, actorId: WORKER.id })
    );
  });

  it('passes the flag and the booked date down to be recorded', async () => {
    repoMock.getGateView.mockResolvedValue(offSchedule());
    await dispatchService.collect(1, body, WORKER);

    expect(repoMock.collect).toHaveBeenCalledWith(
      expect.objectContaining({ wrongDay: true, bookedFor: '2026-08-17' })
    );
  });

  it('does not flag an on-schedule collection', async () => {
    repoMock.getGateView.mockResolvedValue(gateView());
    await dispatchService.collect(1, body, WORKER);

    expect(repoMock.collect).toHaveBeenCalledWith(
      expect.objectContaining({ wrongDay: false, bookedFor: null })
    );
  });

  // Off-schedule must not smuggle a pallet past the checks that ARE
  // gates.
  it('still blocks an inactive centre (BR-11)', async () => {
    repoMock.getGateView.mockResolvedValue(
      gateView({ dispatch_date: new Date(2026, 7, 17), ecd_is_active: false })
    );
    await expect(dispatchService.collect(1, body, WORKER)).rejects.toMatchObject({ status: 409 });
  });

  it('still needs a manager when packing has not closed the slip', async () => {
    repoMock.getGateView.mockResolvedValue(
      gateView({ dispatch_date: new Date(2026, 7, 17), slip_status: 'in_progress' })
    );
    await expect(dispatchService.collect(1, body, WORKER)).rejects.toMatchObject({ status: 403 });
  });
});
ALLEOF_DISPATCH_SERVICE_TEST_JS
echo "  wrote server/__tests__/dispatch.service.test.js"

mkdir -p server/__tests__
cat > server/__tests__/module-loads.test.js <<'ALLEOF_MODULE_LOADS_TEST_JS'
// ─────────────────────────────────────────────────────────────
// server/__tests__/module-loads.test.js
//
// Every other suite in here vi.mock()s the repositories, which means
// vitest substitutes the module and never parses the real file. A
// syntax error in a mocked repository is therefore completely
// invisible: the full 801-test suite went green against a
// dispatch.repository.js that Node refused to load at all, and the
// break only surfaced when someone ran `npm run dev`.
//
// (The cause was a backtick inside a SQL comment inside a template
// literal, which closed the literal early. Any typo of that shape
// would be equally invisible.)
//
// This parses every source file instead of importing it. Parsing is
// the right depth: importing would run module-level side effects —
// config/db.js calls process.exit(1) when DATABASE_URL is unset — so
// a full import would need a live database and would test far more
// than "can Node read this file".
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';

const SRC = new URL('../src/', import.meta.url).pathname;

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.js')) acc.push(full);
  }
  return acc;
};

const files = walk(SRC);

describe('every source module parses', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(SRC, f), f]))('parses %s', (_name, full) => {
    const source = readFileSync(full, 'utf8');
    // SourceTextModule is behind a flag, so compile as a classic
    // Script with the import/export lines stripped. That still catches
    // every unbalanced brace, paren, quote and backtick, which is the
    // entire point.
    const stripped = source
      .replace(/^\s*import\s[^;]*;?\s*$/gm, '')
      .replace(/^\s*export\s+default\s+/gm, 'void ')
      .replace(/^\s*export\s+/gm, '');
    expect(() => new vm.Script(stripped, { filename: full })).not.toThrow();
  });
});
ALLEOF_MODULE_LOADS_TEST_JS
echo "  wrote server/__tests__/module-loads.test.js"

mkdir -p client/src/features/dispatch/components
cat > client/src/features/dispatch/components/PalletCheck.jsx <<'ALLEOF_PALLETCHECK_JSX'
// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/PalletCheck.jsx
//
// One pallet at the gate: what the slip says against what actually
// goes into the vehicle, then the driver's name and signature.
//
// WHAT CHANGED, and why it is not cosmetic
//
// 1. LOADED QUANTITY IS NOW CAPTURED. The whole reason stock is
//    deducted at the gate rather than at packing is that the gate is
//    where a human counts the goods a second time. The old screen
//    showed packed_quantity read-only and sent no line data, so every
//    dispatch deducted the packer's Monday figure and the re-check
//    counted for nothing. Each line is now editable and defaults to
//    the packed quantity, because "it all matched" is the common case
//    and must stay a single tap.
//
// 2. THE DRIVER IS NAMED. BR-13 makes the signature proof of
//    collection; a signature with nobody's name against it proves
//    very little. The server requires driverName and rejected every
//    request the old screen sent, which hardcoded collectedBy: null.
//
// 3. THE SERVER'S ELIGIBILITY FLAGS ARE OBEYED. slipNotPacked is the
//    only one needing a manager's recorded reason; an inactive centre
//    (BR-11) is the one thing that cannot proceed at all. writtenOff
//    and wrongDay do NOT gate anything — both are shown as advisories
//    and recorded against the collection. Nothing stops food leaving
//    the building over a disagreement with a clock or a calendar.
//    These are read off the gate view rather than re-derived, so this
//    screen and the collect endpoint cannot disagree.
//
// 4. THE SUBMIT IS REPLAYABLE. One idempotency key is generated when
//    the screen opens and reused on every retry, so a driver in a
//    dead spot who taps Confirm twice does not get their stock
//    deducted twice.
//
// The governing principle is unchanged: nothing here stops food
// leaving the building over a data disagreement. A short count, a
// flagged line, a collection after 16:00 — all proceed. They are
// recorded, and where a person needs to own the decision, that person
// is asked for a reason.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import dispatchAPI, { newIdempotencyKey } from '../../../services/dispatchAPI';
import { useAuth } from '../../../context/AuthContext';
import { Actions, Button, Notice, TextField } from '../../staff/components/StepPrimitives';

// ── Signature pad ─────────────────────────────────────────────
// Unchanged in shape. The one fix: whether anything was drawn is now
// tracked on a ref as well as in state. `stop` used to read the state
// value captured in its own render, which is a race that only shows
// up as an occasional signature silently not registering — the worst
// possible bug on the one field that is legally load-bearing.
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const inked     = useRef(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = '#2b3336';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
  }, []);

  const posOf = (e) => {
    const rect  = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    // The canvas is 600x170 internally but CSS-scaled to the phone's
    // width. Without this ratio the ink lands away from the fingertip.
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
  };

  const start = (e) => {
    e.preventDefault();
    const { x, y } = posOf(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = posOf(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    inked.current = true;
    if (!signed) setSigned(true);
  };

  const stop = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    setSigned(false);
    onChange(null);
  };

  return (
    <div className="stf-field">
      <label className="stf-field-label" htmlFor="stf-signature">Driver signature</label>
      <canvas
        id="stf-signature"
        ref={canvasRef}
        className="stf-sign-canvas"
        width={600}
        height={170}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={stop}
        onMouseLeave={stop}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={stop}
      />
      <Button variant="secondary" onClick={clear} disabled={!signed}>Clear</Button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

// A South African keyboard produces both "12,5" and "12.5"; only one
// of them is a number. Same normalisation NumberField applies.
const toNumber = (value) => {
  const n = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
};

// A line only leaves the building if the packer actually put
// something on the pallet. This mirrors the server's own filter in
// dispatch.repository.collect — a flagged line with no quantity has
// nothing to load, so it is shown but not counted.
const isDispatchable = (item) =>
  ['confirmed', 'flagged'].includes(item.status) &&
  item.packed_quantity !== null &&
  Number(item.packed_quantity) > 0;

const GRID = { display: 'grid', gridTemplateColumns: '1.3fr .5fr .7fr', gap: 8, alignItems: 'center' };

const isManagerRole = (role) => role === 'manager' || role === 'admin';

export default function PalletCheck({ palletId, onBack, onCollected }) {
  const { user } = useAuth();

  const [gate, setGate]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome]   = useState(null);

  const [driverName, setDriverName]         = useState('');
  const [vehicleReg, setVehicleReg]         = useState('');
  const [signature, setSignature]           = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  // itemId -> string, as typed. Kept as strings so a half-typed "1."
  // doesn't collapse to 1 under the person's fingers.
  const [loaded, setLoaded]   = useState({});
  const [reasons, setReasons] = useState({});

  // ONE key for the life of this screen. Regenerating it per tap
  // would make every retry look like a fresh collection to the
  // server and deduct the stock again.
  const [idempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    let cancelled = false;

    dispatchAPI.getGateView(palletId)
      .then((data) => {
        if (cancelled) return;
        setGate(data);
        // Default every line to what was packed. The gate confirms a
        // count; it does not re-enter one from scratch.
        const defaults = {};
        for (const item of data.items || []) {
          if (isDispatchable(item)) defaults[item.id] = String(Number(item.packed_quantity));
        }
        setLoaded(defaults);
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load this pallet.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [palletId]);

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  if (error && !gate) {
    return (
      <>
        <Notice tone="warn">{error}</Notice>
        <Actions><Button variant="secondary" onClick={onBack}>Gate queue</Button></Actions>
      </>
    );
  }
  if (!gate) return null;

  // ── Done screen ─────────────────────────────────────────────
  // Only reached when the collection saved but the server sent
  // something back worth reading. A clean collection returns straight
  // to the queue.
  if (outcome) {
    return (
      <section className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Collection recorded</h1>
          <p className="stf-step-sub">{gate.ecd_name}</p>
        </div>

        {outcome.replayed ? (
          <Notice>This collection had already been saved. Nothing was recorded twice.</Notice>
        ) : null}

        {outcome.shortfalls?.length ? (
          <Notice tone="warn">
            The system now shows less of {outcome.shortfalls.length === 1 ? 'one item' : `${outcome.shortfalls.length} items`} in
            the building than it thought. The pallet has gone; tell a manager so the count can be checked.
          </Notice>
        ) : null}

        {outcome.unitMismatches?.length ? (
          <Notice tone="warn">
            Some items went out in a different unit to the one on record. A manager needs to look at those lines.
          </Notice>
        ) : null}

        <Actions>
          <Button onClick={onBack}>Gate queue</Button>
        </Actions>
      </section>
    );
  }

  const items        = gate.items || [];
  const dispatchable = items.filter(isDispatchable);
  const eligibility  = gate.eligibility || {};
  const manager      = isManagerRole(user?.role);

  // ── What the server will insist on ──────────────────────────
  // Same three conditions dispatch.service.collect checks, phrased
  // the way somebody at a gate would say them.
  const needsOverride = [];
  if (eligibility.slipNotPacked) needsOverride.push('packing has not closed this pallet off yet');
  // wrongDay is DELIBERATELY absent, matching the server. BR-12 books
  // a pallet for a cohort day; it does not say food may not leave on
  // another one. A driver who missed Tuesday and turned up Thursday
  // has solved a harder problem than the calendar has, and a manager
  // asked to authorise it was always going to say yes.
  //
  // It is shown as an advisory below, and the server records a
  // wrong_day_collection event so BR-26 review still sees it.
  // writtenOff is DELIBERATELY absent, matching the server's list in
  // dispatch.service.collect. The 16:00 sweep is bookkeeping, not a
  // gate closure: the pallet is still on the floor and still theirs,
  // and the collection runs normally, filed afterwards as
  // 'late_collected'. Requiring a manager here turned the sweep into
  // a lock — from 16:00 onwards every remaining pallet became
  // un-collectable by the worker actually standing at the gate.
  //
  // Keep this list in step with the server's. A client that asks for
  // an override the server does not want blocks a collection for no
  // reason; one that skips an override the server does want produces
  // a 403 the worker cannot act on.

  // ── Line validation ─────────────────────────────────────────
  const lineErrors = {};
  for (const item of dispatchable) {
    const raw    = loaded[item.id];
    const value  = toNumber(raw);
    const packed = Number(item.packed_quantity);

    if (String(raw ?? '').trim() === '' || Number.isNaN(value) || value < 0) {
      lineErrors[item.id] = 'Enter how many went into the vehicle.';
    } else if (value !== packed && !String(reasons[item.id] || '').trim()) {
      // The count differing from the pallet is exactly the thing this
      // screen exists to catch. Recording the number without the
      // reason leaves a manager a discrepancy and no story.
      lineErrors[item.id] = 'Say why this differs from the pallet.';
    }
  }

  const hasLineErrors  = Object.keys(lineErrors).length > 0;
  const overrideNeeded = needsOverride.length > 0;
  const blockedByRole  = overrideNeeded && !manager;

  const canSubmit =
    !eligibility.ecdInactive &&
    !eligibility.alreadyDispatched &&
    !blockedByRole &&
    !hasLineErrors &&
    Boolean(driverName.trim()) &&
    Boolean(signature) &&
    (!overrideNeeded || Boolean(overrideReason.trim())) &&
    !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Sparse: only the lines that actually differ. Everything else
      // keeps its packed quantity server-side, which is both less to
      // send and less to get wrong.
      const lines = dispatchable
        .filter((item) => toNumber(loaded[item.id]) !== Number(item.packed_quantity))
        .map((item) => ({
          itemId:         item.id,
          loadedQuantity: toNumber(loaded[item.id]),
          varianceReason: String(reasons[item.id] || '').trim() || null,
        }));

      const result = await dispatchAPI.recordCollection(palletId, {
        driverName:     driverName.trim(),
        vehicleReg:     vehicleReg.trim() || null,
        signature,
        lines,
        idempotencyKey,
        overrideReason: overrideNeeded ? overrideReason.trim() : null,
      });

      // Only hold the screen when there is something to read.
      if (result?.shortfalls?.length || result?.unitMismatches?.length || result?.replayed) {
        setOutcome(result);
      } else {
        onCollected(result);
      }
    } catch (err) {
      setError(err.message || 'Could not save this collection. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Hard block (BR-11) ──────────────────────────────────────
  if (eligibility.ecdInactive) {
    return (
      <section className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Check the pallet</h1>
          <p className="stf-step-sub">{gate.ecd_name}</p>
        </div>
        <Notice tone="warn">
          {gate.ecd_name} is not an active centre with approved quantities, so a pallet cannot be released to it.
          A manager needs to activate the centre first.
        </Notice>
        <Actions><Button variant="secondary" onClick={onBack}>Gate queue</Button></Actions>
      </section>
    );
  }

  // ── Already gone ────────────────────────────────────────────
  if (eligibility.alreadyDispatched) {
    return (
      <section className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Already collected</h1>
          <p className="stf-step-sub">{gate.ecd_name}</p>
        </div>
        <Notice>
          This pallet was collected
          {gate.driver_name ? ` by ${gate.driver_name}` : ''}
          {gate.collected_at ? ` at ${new Date(gate.collected_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : ''}.
        </Notice>
        <Actions><Button variant="secondary" onClick={onBack}>Gate queue</Button></Actions>
      </section>
    );
  }

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>Check the pallet</h1>
        <p className="stf-step-sub">
          {gate.ecd_name}
          {gate.child_count ? ` · ${gate.child_count} children` : ''}
          {gate.pallet_ref ? ` · ${gate.pallet_ref}` : ''}
        </p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* Override-gated exceptions, named plainly. ACC-09: tell the
          person what is wrong AND what to do about it. */}
      {overrideNeeded ? (
        <Notice tone="warn">
          {needsOverride.join(', and ')}.{' '}
          {manager
            ? 'You can authorise it below — record a short reason.'
            : 'Ask a manager to authorise this collection at the gate.'}
        </Notice>
      ) : null}

      {/* Advisory, not a gate. Says what is unusual and lets the
          collection proceed — the record is written either way. */}
      {eligibility.wrongDay ? (
        <Notice tone="warn">
          This pallet is booked for another day. It can still go out — the
          collection will be recorded as off-schedule.
        </Notice>
      ) : null}

      {eligibility.hasFlaggedLines ? (
        <Notice tone="warn">Packing flagged one or more items on this pallet. Check them against the shelf before you load.</Notice>
      ) : null}

      {dispatchable.length === 0 ? (
        <Notice tone="warn">Nothing was packed onto this pallet, so there is nothing to load.</Notice>
      ) : null}

      {/* ── The count ──────────────────────────────────────────
          SLIP is what the packer put on the pallet. LOADED is what
          goes into the vehicle, and it is the number that comes off
          the stock. */}
      <div className="stf-list">
        <div className="stf-row stf-row--check is-static">
          <span className="stf-row-main" style={GRID}>
            <span className="stf-row-meta">ITEM</span>
            <span className="stf-row-meta">SLIP</span>
            <span className="stf-row-meta">LOADED</span>
          </span>
        </div>

        {items.map((item) => {
          const packed   = item.packed_quantity === null ? null : Number(item.packed_quantity);
          const loadable = isDispatchable(item);
          const value    = loaded[item.id] ?? '';
          const differs  = loadable && toNumber(value) !== packed;
          const problem  = lineErrors[item.id];

          return (
            <div
              key={item.id}
              className={`stf-row stf-row--check${loadable ? '' : ' is-static'}${problem || differs ? ' is-warn' : ''}`}
            >
              <span className="stf-row-main" style={GRID}>
                <span className="stf-row-title">
                  {item.product_name}
                  <span className="stf-row-meta"> {item.unit}</span>
                </span>
                <span className="stf-row-value">{packed ?? '—'}</span>

                {loadable ? (
                  <input
                    className={`stf-input${problem ? ' is-flagged' : ''}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Quantity of ${item.product_name} loaded into the vehicle`}
                    value={value}
                    onChange={(e) =>
                      setLoaded((prev) => ({ ...prev, [item.id]: e.target.value.replace(',', '.') }))
                    }
                  />
                ) : (
                  <span className="stf-row-value">—</span>
                )}
              </span>

              {/* The reason field appears only once the numbers
                  actually disagree — no dead field on twenty clean
                  lines. */}
              {differs ? (
                <TextField
                  id={`stf-variance-${item.id}`}
                  label="Why the difference?"
                  value={reasons[item.id] || ''}
                  onChange={(v) => setReasons((prev) => ({ ...prev, [item.id]: v }))}
                  placeholder="e.g. one bag split in the yard"
                />
              ) : null}

              {problem ? <p className="stf-field-hint">{problem}</p> : null}

              {item.flag_reason ? (
                <p className="stf-field-hint">Packing noted: {item.flag_reason}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ── Who is taking it ───────────────────────────────────── */}
      <TextField
        id="stf-driver-name"
        label="Driver or collector's name"
        hint="Whoever signs for the pallet."
        value={driverName}
        onChange={setDriverName}
        autoComplete="off"
      />

      <TextField
        id="stf-vehicle-reg"
        label="Vehicle registration (optional)"
        value={vehicleReg}
        onChange={setVehicleReg}
        autoComplete="off"
      />

      {overrideNeeded && manager ? (
        <TextField
          id="stf-override-reason"
          label="Reason for authorising this collection"
          hint="Recorded against the collection, in your name."
          value={overrideReason}
          onChange={setOverrideReason}
          autoComplete="off"
        />
      ) : null}

      <SignaturePad onChange={setSignature} />

      <p className="stf-field-hint">
        Once signed, this pallet is recorded as collected and the loaded quantities come off the stock.
      </p>

      <Actions>
        <Button disabled={!canSubmit} onClick={handleConfirm}>
          {submitting ? 'Saving…' : 'Confirm collection'}
        </Button>
        <Button variant="secondary" onClick={onBack} disabled={submitting}>Gate queue</Button>
      </Actions>
    </section>
  );
}
ALLEOF_PALLETCHECK_JSX
echo "  wrote client/src/features/dispatch/components/PalletCheck.jsx"

mkdir -p client/src/tests
cat > client/src/tests/DispatchWiring.test.jsx <<'ALLEOF_DISPATCHWIRING_TEST_JSX'
// ─────────────────────────────────────────────────────────────
// src/tests/DispatchWiring.test.jsx
//
// PalletCheck.jsx spent several commits as a byte-for-byte copy of
// GateQueue.jsx — a paste into the wrong file. Nothing caught it:
// it compiled, it linted, it built, and the component even rendered.
// Clicking a row on the gate board swapped DispatchPage to
// PalletCheck, which drew the gate board again, so the screen looked
// unchanged and the bug read as "clicking does nothing".
//
// The props are what give it away. PalletCheck takes palletId /
// onBack / onCollected; GateQueue takes onOpenPallet. A copy has the
// wrong signature and silently ignores everything DispatchPage hands
// it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/dispatchAPI', () => ({
  default: { getGateQueue: vi.fn(), getGateView: vi.fn(), collect: vi.fn() },
  todayISO: () => '2026-08-22',
  newIdempotencyKey: () => 'test-key',
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, firstName: 'M', role: 'warehouse_worker' }, logout: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/staff/dispatch' }),
  Link: ({ children }) => <span>{children}</span>,
}));

const dispatchAPI = (await import('../services/dispatchAPI')).default;
const { default: DispatchPage } = await import('../pages/DispatchPage');

const ROW = {
  picking_slip_id: 31,
  ecd_name: 'Little Lights Creche',
  pallet_ref: 'PAL-31',
  dispatch_status: 'awaiting',
  ecd_is_active: true,
  total_items: 4,
  flagged_items: 0,
  variance_items: 0,
  collected_at: null,
  dispatch_date: '2026-08-22',
};

beforeEach(() => {
  vi.clearAllMocks();
  dispatchAPI.getGateQueue.mockResolvedValue([ROW]);
  dispatchAPI.getGateView.mockResolvedValue({
    picking_slip_id: 31,
    ecd_name: 'Little Lights Creche',
    dispatch_date: '2026-08-22',
    slip_status: 'complete',
    items: [],
    eligibility: {
      ecdInactive: false, slipNotPacked: false, wrongDay: false,
      afterCutoff: false, writtenOff: false, alreadyDispatched: false,
      hasFlaggedLines: false, hasVariance: false,
    },
  });
});

describe('dispatch gate wiring', () => {
  it('opening a pallet leaves the queue and fetches that pallet', async () => {
    const user = userEvent.setup();
    render(<DispatchPage />);

    const row = await screen.findByRole('button', { name: /Little Lights Creche/ });
    await user.click(row);

    // The bug: PalletCheck was a copy of GateQueue, so it re-fetched
    // the board and never asked for the pallet. This is the assertion
    // that would have caught it.
    await waitFor(() => expect(dispatchAPI.getGateView).toHaveBeenCalledWith(31));
  });

  it('the board is no longer on screen once a pallet is open', async () => {
    const user = userEvent.setup();
    render(<DispatchPage />);

    await user.click(await screen.findByRole('button', { name: /Little Lights Creche/ }));

    // "At the gate" is GateQueue's heading. If it is still showing
    // after a row is opened, the page did not actually change screens.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'At the gate' })).not.toBeInTheDocument()
    );
  });
});
ALLEOF_DISPATCHWIRING_TEST_JSX
echo "  wrote client/src/tests/DispatchWiring.test.jsx"


echo
echo "Self-checks..."
node --check server/src/repositories/dispatch.repository.js
node --check server/src/services/dispatch.service.js
echo "  server files parse"

if diff -q client/src/features/dispatch/components/PalletCheck.jsx \
           client/src/features/dispatch/components/GateQueue.jsx >/dev/null 2>&1; then
  echo "ERROR: PalletCheck is identical to GateQueue — write failed." >&2
  exit 1
fi
echo "  PalletCheck and GateQueue differ (as they must)"

echo
echo "Now delete the superseded scripts so they cannot be re-run:"
echo "  rm -f fix-dispatch.sh fix-syntax.sh fix-palletcheck.sh"
echo
echo "Then verify:"
echo "  cd server && npm test                                   # expect 843"
echo "  cd ../client && npm run lint && npx vite build && npm test  # expect 46"
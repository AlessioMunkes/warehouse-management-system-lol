#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# fix-dispatch.sh
#
#   1. 42P08 on first-time gate collection — untyped CASE in the
#      dispatch_events INSERT. Reproduced and fixed against real
#      Postgres 16, not reasoned about.
#   2. Gate board scope — every pallet still outstanding on ANY
#      date, plus whatever was handled today. Was hard-scoped to
#      today by the client.
#
# Does NOT touch the stock_movements CHECK constraint — that needs
# the live constraint definition first.
#
# Run from the REPO ROOT:  bash fix-dispatch.sh
# Idempotent.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
if [ ! -d client ] || [ ! -d server ]; then
  echo "ERROR: run this from the repo root (needs client/ and server/)." >&2
  exit 1
fi
echo "Writing files..."

mkdir -p server/src/repositories
cat > server/src/repositories/dispatch.repository.js <<'EOF_DISPATCH_REPOSITORY_JS'
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
                   -- below has `ELSE override_by`, a column with a known
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
EOF_DISPATCH_REPOSITORY_JS
echo "  wrote server/src/repositories/dispatch.repository.js"

mkdir -p server/src/services
cat > server/src/services/dispatch.service.js <<'EOF_DISPATCH_SERVICE_JS'
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
  if (eligibility.wrongDay) {
    needsOverride.push(
      `${gateView.ecd_name} is booked for ${pgDateToString(gateView.dispatch_date)}, not today`
    );
  }
  if (eligibility.slipNotPacked) {
    needsOverride.push('this pallet has not been closed off by the packing team yet');
  }
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
EOF_DISPATCH_SERVICE_JS
echo "  wrote server/src/services/dispatch.service.js"

mkdir -p server/src/controllers
cat > server/src/controllers/dispatch.controller.js <<'EOF_DISPATCH_CONTROLLER_JS'
// ─────────────────────────────────────────────────────────────
// server/src/controllers/dispatch.controller.js
//
// Thin HTTP layer for the dispatch gate. All business logic and
// validation lives in dispatch.service.js — controllers here only
// pull data off the request, call the service, and shape the response.
//
// Error handling: dispatch.service.js attaches a `.status` to every
// error it throws (see the `fail()` helper at the top of that file),
// so every catch block below reads `err.status` directly, the same
// convention picking.controller.js and stock.controller.js use.
// Unrecognised errors (no `.status`, e.g. a DB blew up) fall back to
// 500 with a generic message so we never leak internals to the client.
//
// Two id spaces meet in this router and must not be confused:
// :id below is always a picking_slip_id (the pallet); the dispatch
// note lives under /notes/:eventId, a dispatch_events id.
// ─────────────────────────────────────────────────────────────
import dispatchService from '../services/dispatch.service.js';

// ── The gate board ───────────────────────────────────────────
// GET /api/dispatch?dispatchDate=&cohort=&status=&scope=
// scope=gate drops the date filter in favour of "outstanding on any
// date, plus handled today" — see getBoard in dispatch.service.js.
// Returns: every packed pallet for the day, one row per slip, with
// today's dispatch status baked in. May opportunistically run the
// 16:00 non-collection sweep as a side effect (see the service).
const getBoard = async (req, res) => {
  try {
    const board = await dispatchService.getBoard(req.query, req.user);
    res.status(200).json({ success: true, data: board });
  } catch (err) {
    console.error('[getBoard]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve the dispatch board.',
    });
  }
};

// ── Run the 16:00 sweep on demand (manager only) ─────────────
// POST /api/dispatch/sweep
// Body: { dispatchDate? } — defaults to today.
// Returns: { flagged, slipIds } — every pallet just written off.
const sweep = async (req, res) => {
  try {
    const result = await dispatchService.sweep(req.body, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[sweep]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to run the non-collection sweep.',
    });
  }
};

// ── Non-collection history (BR-26) ───────────────────────────
// GET /api/dispatch/non-collections?ecdId=&from=&to=
// Returns: every non-collection event in range, with a running
// per-ECD count so a repeat offender stands out.
const getNonCollectionHistory = async (req, res) => {
  try {
    const history = await dispatchService.getNonCollectionHistory(req.query, req.user);
    res.status(200).json({ success: true, data: history });
  } catch (err) {
    console.error('[getNonCollectionHistory]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve non-collection history.',
    });
  }
};

// ── Dispatch note (proof of collection) ──────────────────────
// GET /api/dispatch/notes/:eventId
// Returns: the collection record with its lines — a dispatch_events
// id, not a picking slip id.
const getDispatchNote = async (req, res) => {
  try {
    const note = await dispatchService.getDispatchNote(req.params.eventId);
    res.status(200).json({ success: true, data: note });
  } catch (err) {
    console.error('[getDispatchNote]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve dispatch note.',
    });
  }
};

// ── One pallet at the gate ───────────────────────────────────
// GET /api/dispatch/:id
// Returns: the slip, its items, and the computed eligibility flags
// the gate screen renders as warnings.
const getGateView = async (req, res) => {
  try {
    const gateView = await dispatchService.getGateView(req.params.id);
    res.status(200).json({ success: true, data: gateView });
  } catch (err) {
    console.error('[getGateView]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to retrieve pallet.',
    });
  }
};

// ── Record a collection ──────────────────────────────────────
// POST /api/dispatch/:id/collect
// Body: { driverName, signature, vehicleReg?, lines?, idempotencyKey?,
//         overrideReason? }
// Returns: { event, isLate?, shortfalls?, unitMismatches? } — or
// { event, replayed: true } when idempotencyKey matches a prior
// collection. 201 for a newly recorded collection; 200 for a replay,
// same "a retry is not a failure" rule donation intake uses.
const collect = async (req, res) => {
  try {
    const result = await dispatchService.collect(req.params.id, req.body, req.user);
    res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    console.error('[collect]', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status < 500 ? err.message : 'Failed to record collection.',
    });
  }
};

export default {
  getBoard,
  sweep,
  getNonCollectionHistory,
  getDispatchNote,
  getGateView,
  collect,
};
EOF_DISPATCH_CONTROLLER_JS
echo "  wrote server/src/controllers/dispatch.controller.js"

mkdir -p server/__tests__
cat > server/__tests__/dispatch.service.test.js <<'EOF_DISPATCH_SERVICE_TEST_JS'
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
EOF_DISPATCH_SERVICE_TEST_JS
echo "  wrote server/__tests__/dispatch.service.test.js"

mkdir -p client/src/services
cat > client/src/services/dispatchAPI.js <<'EOF_DISPATCHAPI_JS'
// ─────────────────────────────────────────────────────────────
// client/src/services/dispatchAPI.js
//
// Client wrapper around /api/dispatch. One function per route in
// dispatch.routes.js, nothing invented.
//
// WHAT THIS REPLACES, and why it matters
// The previous version of this file predated the dispatch backend.
// It built the gate queue out of picking slips and posted collections
// to POST /api/picking/:id/collect — a route that does not exist, so
// every collection at the gate 404'd. Its payload was wrong too: it
// sent { signatureData, collectedBy, note } where the server requires
// { driverName, signature }, so even with the URL corrected the
// request would have come back 400.
//
// The dispatch board is NOT the picking board. A pallet's gate state
// lives in dispatch_events, not in picking_slips.status, and only
// GET /api/dispatch joins the two. Reading picking slips directly
// meant a collected pallet simply vanished from the queue — its slip
// status becomes 'dispatched', not 'complete' — with no "collected"
// row to show for it, and the eligibility flags the server computes
// (wrong day, written off at 16:00, inactive centre) never reached
// the screen at all.
//
// LOADED QUANTITY IS THE POINT.
// Stock is deducted at the gate against loaded_quantity — what
// dispatch staff counted into the vehicle — not packed_quantity,
// which is what the packer believed they put on the pallet on
// Monday. The old client sent no line data at all, so every dispatch
// silently deducted the packed figure and the gate re-check counted
// for nothing. recordCollection takes a sparse `lines` array: only
// the lines that differ need to be sent, because the overwhelmingly
// common case is that the count matched.
// ─────────────────────────────────────────────────────────────
import { API_BASE, newIdempotencyKey } from './api';

const BASE_URL = `${API_BASE}/api/dispatch`;

// ── Shared request helper ─────────────────────────────────────
// Mirrors pickingAPI.js so the two modules cannot drift on the two
// things that are easy to forget on a new endpoint:
//
//   credentials: 'include' — auth is an httpOnly cookie. Without it
//     fetch sends nothing and every request 401s while the user is
//     visibly logged in.
//
//   API_BASE — in dev the client is on :5173 and the API on :5000
//     with no Vite proxy, so a bare '/api/dispatch' would hit the
//     Vite dev server and 404.
const request = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return handleResponse(res);
};

// Unwraps the { success, data, message } envelope every dispatch
// endpoint returns, and throws with `.status` attached so callers can
// tell a server refusal (403/409) from a dead connection.
async function handleResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Could not reach the dispatch service (status ${res.status}). Check your connection and try again.`
    );
  }

  const json = await res.json();
  if (!json.success) {
    const err = new Error(json.message || 'Request failed.');
    err.status  = res.status;
    err.payload = json;
    throw err;
  }
  return json.data;
}

// ── Today, in the warehouse's own timezone ────────────────────
// NOT toISOString().slice(0, 10). That formats in UTC, and Cape Town
// is UTC+2 — so between midnight and 02:00 SAST it returns YESTERDAY
// and the gate queue loads the wrong day's pallets. Building the
// string from the local date components gives the date the person
// holding the phone would write down.
export const todayISO = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── Idempotency key ───────────────────────────────────────────
// newIdempotencyKey moved to api.js — receiving needs the same thing
// and the server validates one shape, so there is one generator. It
// is re-exported here so anything importing it from this module
// keeps working.
//
// One key per collection ATTEMPT, reused on every retry of that
// attempt. See PalletCheck.jsx, which holds it in state for the life
// of the screen; a fresh key per tap would defeat the mechanism
// entirely.
export { newIdempotencyKey };

// ── GET /api/dispatch ─────────────────────────────────────────
// The gate board: every packed pallet for the day, plus everything
// already handled today, each row carrying its dispatch status.
//
// Rows are keyed on picking_slip_id, NOT id — the row is a join of a
// picking slip and its dispatch event, and `id` would be ambiguous.
//
// Loading the board may run the 16:00 non-collection sweep as a
// server-side side effect. That is deliberate on the server's part;
// nothing is needed here beyond calling it.
export const getBoard = ({ dispatchDate, cohort, status, scope } = {}) => {
  const params = new URLSearchParams();
  if (dispatchDate) params.set('dispatchDate', dispatchDate);
  if (cohort)       params.set('cohort', cohort);
  if (status)       params.set('status', status);
  if (scope)        params.set('scope', scope);

  const qs = params.toString();
  return request(qs ? `?${qs}` : '');
};

// The gate's board: every pallet still outstanding on ANY date, plus
// whatever was handled today.
//
// This used to default to todayISO(), which hid a pallet staged for
// Tuesday and never fetched — it is still physically in the building
// on Thursday, and the 16:00 sweep marks it not_collected precisely
// because it stays collectable as a late collection. A row nobody can
// see is a row nobody can release.
//
// "Today" is now resolved server-side from todayString(), not from the
// browser clock: a device with the wrong date or a non-SAST timezone
// would otherwise scope the board to the wrong day. Pass an explicit
// dispatchDate only when you actually want one exact day.
export const getGateQueue = (dispatchDate) =>
  dispatchDate
    ? getBoard({ dispatchDate })
    : getBoard({ scope: 'gate' });

// ── GET /api/dispatch/:id ─────────────────────────────────────
// One pallet as the gate sees it: the slip, its lines pre-filled with
// packed_quantity, and the `eligibility` object the server computed.
//
// Read those eligibility flags rather than re-deriving them here.
// They exist precisely so the screen and the collect endpoint cannot
// disagree about whether a pallet needs a manager's authorisation.
export const getGateView = (slipId) => request(`/${slipId}`);

// ── POST /api/dispatch/:id/collect ────────────────────────────
// lines is a SPARSE override map: [{ itemId, loadedQuantity,
// varianceReason }]. Any line not named keeps its packed quantity, so
// staff never have to retype twenty numbers to say "it all matched".
//
// signature is a base64 PNG data URL. It is not optional — BR-13
// makes it the proof of collection that replaces the paper register,
// and the server rejects a collection without one.
export const recordCollection = (
  slipId,
  { driverName, signature, vehicleReg, lines, idempotencyKey, overrideReason } = {}
) =>
  request(`/${slipId}/collect`, {
    method: 'POST',
    body: JSON.stringify({
      driverName,
      signature,
      vehicleReg:     vehicleReg || null,
      lines:          lines || [],
      idempotencyKey: idempotencyKey || null,
      overrideReason: overrideReason || null,
    }),
  });

// ── GET /api/dispatch/notes/:eventId ──────────────────────────
// The proof-of-collection document. Keyed on a dispatch_events id,
// which is a DIFFERENT id space to the picking_slip_id every other
// call in this file takes — pass row.dispatch_event_id, not
// row.picking_slip_id.
export const getDispatchNote = (eventId) => request(`/notes/${eventId}`);

// ── POST /api/dispatch/sweep (manager only) ───────────────────
// Forces the 16:00 non-collection write-off for a date. The board
// already sweeps opportunistically; this is for after a power cut or
// a deploy that landed across the cutoff.
export const runSweep = (dispatchDate) =>
  request('/sweep', {
    method: 'POST',
    body: JSON.stringify(dispatchDate ? { dispatchDate } : {}),
  });

// ── GET /api/dispatch/non-collections (BR-26) ─────────────────
// A centre that repeatedly fails to collect is a pattern, not an
// incident. Manager and finance only.
export const getNonCollectionHistory = ({ ecdId, from, to } = {}) => {
  const params = new URLSearchParams();
  if (ecdId) params.set('ecdId', ecdId);
  if (from)  params.set('from', from);
  if (to)    params.set('to', to);

  const qs = params.toString();
  return request(`/non-collections${qs ? `?${qs}` : ''}`);
};

export default {
  getBoard,
  getGateQueue,
  getGateView,
  recordCollection,
  getDispatchNote,
  runSweep,
  getNonCollectionHistory,
  todayISO,
  newIdempotencyKey,
};
EOF_DISPATCHAPI_JS
echo "  wrote client/src/services/dispatchAPI.js"

mkdir -p client/src/features/dispatch/components
cat > client/src/features/dispatch/components/GateQueue.jsx <<'EOF_GATEQUEUE_JSX'
// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/GateQueue.jsx
//
// The board at the gate, from GET /api/dispatch?scope=gate.
//
// Not just today: every pallet still outstanding on any date, plus
// whatever was handled today. A pallet staged for Tuesday that nobody
// fetched is still in the building on Thursday and has to be
// releasable — the 16:00 sweep marks it not_collected but leaves it
// collectable as a late collection.
//
// WHAT CHANGED
// This used to make two calls to the PICKING endpoints and treat a
// slip with status 'complete' as "waiting" and status 'collected' as
// "done". Neither was right. A pallet's gate state lives in
// dispatch_events, not in picking_slips.status, and 'collected' is
// not a picking slip status at all — the value is 'dispatched' — so
// the "collected today" count was permanently zero and a collected
// pallet just disappeared off the screen with nothing to show for it.
//
// One call now returns the whole day: awaiting, collected, late, and
// written off, each row carrying dispatch_status. Rows are keyed on
// picking_slip_id, not id.
//
// Everything is SHOWN; only awaiting pallets are openable. Staff need
// to see that a centre was written off at 16:00 or that a driver has
// already been, not wonder where the row went. An inactive ECD is the
// one hard block (BR-11), so it is shown greyed with the reason
// spelled out rather than hidden.
//
// BR-12 (wrong collection day) is no longer missing: the server
// computes it per pallet and returns it in the gate view's
// eligibility object, which PalletCheck reads. It is not surfaced on
// the board because a pallet booked for another day should not be in
// this list in the first place — if one appears, opening it
// explains why.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import dispatchAPI from '../../../services/dispatchAPI';
import { Notice } from '../../staff/components/StepPrimitives';

// The four states a row can be in, and how each reads on the floor.
// Kept as one table so the label, the styling and the "can you open
// it?" decision cannot drift apart.
const STATE = {
  awaiting:       { label: 'Waiting for collection', tone: '',           openable: true  },
  collected:      { label: 'Collected',              tone: ' is-static', openable: false },
  late_collected: { label: 'Collected (late)',       tone: ' is-static', openable: false },
  // Openable. The 16:00 sweep records that a day ended without this
  // pallet leaving; it does not put the pallet out of reach. A driver
  // arriving at 16:40 is collecting the same food off the same floor,
  // so the row opens and the collection runs normally — it is filed
  // as 'late_collected' afterwards. Marked warn so it still reads as
  // an exception on the board, but not is-static, which is what made
  // it un-tappable.
  not_collected:  { label: 'Not collected',          tone: ' is-warn',   openable: true  },
  cancelled:      { label: 'Cancelled',              tone: ' is-static', openable: false },
};

const stateOf = (row) => STATE[row.dispatch_status] || STATE.awaiting;

// Time formatted for a glance, not a report.
const timeOf = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
};

export default function GateQueue({ onOpenPallet }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;

    dispatchAPI.getGateQueue()
      .then((board) => { if (!cancelled) setRows(board || []); })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the gate queue.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const done    = rows.filter((r) => ['collected', 'late_collected'].includes(r.dispatch_status));
  const waiting = rows.filter((r) => stateOf(r).openable);

  const summary = rows.length === 0
    ? 'Nothing waiting for collection.'
    : `${done.length} of ${rows.length} collected · ${waiting.length} still waiting`;

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>At the gate</h1>
        <p className="stf-step-sub">{summary}</p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {loading ? (
        <div className="stf-skeleton" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="stf-empty">No pallets are waiting for collection.</div>
      ) : (
        <div className="stf-list">
          {rows.map((row) => {
            const state    = stateOf(row);
            // BR-11 is the one hard block: an inactive centre cannot
            // be released to, so its row cannot be opened whatever
            // its dispatch status says.
            const blocked  = row.ecd_is_active === false;
            const openable = state.openable && !blocked;
            const at       = timeOf(row.collected_at);

            // What the second line says, in order of what matters
            // most to someone standing at a gate.
            let meta;
            if (blocked) {
              meta = 'This centre is not active, so nothing can go out to it today.';
            } else if (row.dispatch_status === 'not_collected') {
              meta = 'Written off at 16:00 — still collectable. It will be recorded as a late collection.';
            } else if (at) {
              meta = `${state.label} at ${at}${row.driver_name ? ` · ${row.driver_name}` : ''}`;
            } else {
              const flags = [];
              if (Number(row.flagged_items) > 0)  flags.push(`${row.flagged_items} flagged`);
              if (Number(row.variance_items) > 0) flags.push(`${row.variance_items} short or over`);
              meta = [`${row.total_items} items`, ...flags].join(' · ');
            }

            const open = () => onOpenPallet(row.picking_slip_id);

            return (
              <div
                key={row.picking_slip_id}
                className={`stf-row${blocked ? ' is-warn is-static' : state.tone}`}
                role={openable ? 'button' : undefined}
                tabIndex={openable ? 0 : undefined}
                onClick={openable ? open : undefined}
                onKeyDown={
                  openable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                      }
                    : undefined
                }
              >
                <span className="stf-row-main">
                  <span className="stf-row-title">
                    {row.ecd_name}
                    {row.pallet_ref ? ` · ${row.pallet_ref}` : ''}
                  </span>
                  <span className="stf-row-meta">{meta}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
EOF_GATEQUEUE_JSX
echo "  wrote client/src/features/dispatch/components/GateQueue.jsx"

mkdir -p client/src/features/dispatch/components
cat > client/src/features/dispatch/components/PalletCheck.jsx <<'EOF_PALLETCHECK_JSX'
// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/GateQueue.jsx
//
// The board at the gate, from GET /api/dispatch?scope=gate.
//
// Not just today: every pallet still outstanding on any date, plus
// whatever was handled today. A pallet staged for Tuesday that nobody
// fetched is still in the building on Thursday and has to be
// releasable — the 16:00 sweep marks it not_collected but leaves it
// collectable as a late collection.
//
// WHAT CHANGED
// This used to make two calls to the PICKING endpoints and treat a
// slip with status 'complete' as "waiting" and status 'collected' as
// "done". Neither was right. A pallet's gate state lives in
// dispatch_events, not in picking_slips.status, and 'collected' is
// not a picking slip status at all — the value is 'dispatched' — so
// the "collected today" count was permanently zero and a collected
// pallet just disappeared off the screen with nothing to show for it.
//
// One call now returns the whole day: awaiting, collected, late, and
// written off, each row carrying dispatch_status. Rows are keyed on
// picking_slip_id, not id.
//
// Everything is SHOWN; only awaiting pallets are openable. Staff need
// to see that a centre was written off at 16:00 or that a driver has
// already been, not wonder where the row went. An inactive ECD is the
// one hard block (BR-11), so it is shown greyed with the reason
// spelled out rather than hidden.
//
// BR-12 (wrong collection day) is no longer missing: the server
// computes it per pallet and returns it in the gate view's
// eligibility object, which PalletCheck reads. It is not surfaced on
// the board because a pallet booked for another day should not be in
// this list in the first place — if one appears, opening it
// explains why.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import dispatchAPI from '../../../services/dispatchAPI';
import { Notice } from '../../staff/components/StepPrimitives';

// The four states a row can be in, and how each reads on the floor.
// Kept as one table so the label, the styling and the "can you open
// it?" decision cannot drift apart.
const STATE = {
  awaiting:       { label: 'Waiting for collection', tone: '',           openable: true  },
  collected:      { label: 'Collected',              tone: ' is-static', openable: false },
  late_collected: { label: 'Collected (late)',       tone: ' is-static', openable: false },
  // Openable. The 16:00 sweep records that a day ended without this
  // pallet leaving; it does not put the pallet out of reach. A driver
  // arriving at 16:40 is collecting the same food off the same floor,
  // so the row opens and the collection runs normally — it is filed
  // as 'late_collected' afterwards. Marked warn so it still reads as
  // an exception on the board, but not is-static, which is what made
  // it un-tappable.
  not_collected:  { label: 'Not collected',          tone: ' is-warn',   openable: true  },
  cancelled:      { label: 'Cancelled',              tone: ' is-static', openable: false },
};

const stateOf = (row) => STATE[row.dispatch_status] || STATE.awaiting;

// Time formatted for a glance, not a report.
const timeOf = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
};

export default function GateQueue({ onOpenPallet }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;

    dispatchAPI.getGateQueue()
      .then((board) => { if (!cancelled) setRows(board || []); })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the gate queue.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const done    = rows.filter((r) => ['collected', 'late_collected'].includes(r.dispatch_status));
  const waiting = rows.filter((r) => stateOf(r).openable);

  const summary = rows.length === 0
    ? 'Nothing waiting for collection.'
    : `${done.length} of ${rows.length} collected · ${waiting.length} still waiting`;

  return (
    <section className="stf-step">
      <div className="stf-step-head">
        <h1 className="stf-step-title" tabIndex={-1}>At the gate</h1>
        <p className="stf-step-sub">{summary}</p>
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {loading ? (
        <div className="stf-skeleton" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <div className="stf-empty">No pallets are waiting for collection.</div>
      ) : (
        <div className="stf-list">
          {rows.map((row) => {
            const state    = stateOf(row);
            // BR-11 is the one hard block: an inactive centre cannot
            // be released to, so its row cannot be opened whatever
            // its dispatch status says.
            const blocked  = row.ecd_is_active === false;
            const openable = state.openable && !blocked;
            const at       = timeOf(row.collected_at);

            // What the second line says, in order of what matters
            // most to someone standing at a gate.
            let meta;
            if (blocked) {
              meta = 'This centre is not active, so nothing can go out to it today.';
            } else if (row.dispatch_status === 'not_collected') {
              meta = 'Written off at 16:00 — still collectable. It will be recorded as a late collection.';
            } else if (at) {
              meta = `${state.label} at ${at}${row.driver_name ? ` · ${row.driver_name}` : ''}`;
            } else {
              const flags = [];
              if (Number(row.flagged_items) > 0)  flags.push(`${row.flagged_items} flagged`);
              if (Number(row.variance_items) > 0) flags.push(`${row.variance_items} short or over`);
              meta = [`${row.total_items} items`, ...flags].join(' · ');
            }

            const open = () => onOpenPallet(row.picking_slip_id);

            return (
              <div
                key={row.picking_slip_id}
                className={`stf-row${blocked ? ' is-warn is-static' : state.tone}`}
                role={openable ? 'button' : undefined}
                tabIndex={openable ? 0 : undefined}
                onClick={openable ? open : undefined}
                onKeyDown={
                  openable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                      }
                    : undefined
                }
              >
                <span className="stf-row-main">
                  <span className="stf-row-title">
                    {row.ecd_name}
                    {row.pallet_ref ? ` · ${row.pallet_ref}` : ''}
                  </span>
                  <span className="stf-row-meta">{meta}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
EOF_PALLETCHECK_JSX
echo "  wrote client/src/features/dispatch/components/PalletCheck.jsx"


echo
echo "Done. Verify with:"
echo "  cd server && npm test"
echo "  cd ../client && npm run lint && npx vite build && npm test"
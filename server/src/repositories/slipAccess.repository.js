// ─────────────────────────────────────────────────────────────
// server/src/repositories/slipAccess.repository.js
//
// How a guest reaches a picking slip: by scanning a QR, by typing a
// short code, or by picking one off a list of today's unclaimed pallets.
//
// Kept apart from picking.repository.js on purpose. That file is the
// staff packing flow and everything in it assumes an authenticated user
// with a role; this one is reached by strangers holding a piece of
// paper, and the difference is worth seeing in the file list.
//
// TWO RULES FOR EVERYTHING IN HERE:
//
//   1. The preview is public. It is returned to anyone who can guess or
//      hold a token, with no session at all, so it carries only what is
//      already printed on a poster taped to a pallet: who the food is
//      for, when it goes out, how many lines, and whether anyone has
//      started. No item list, no stock, no staff names, no ids beyond
//      the slip's own.
//
//   2. Nothing here touches the Love Activism / VMS tables
//      (love_activism_events, event_spaces, event_timeslots,
//      volunteer_bookings, attendance, vms_sync). That stack belongs to
//      another team member and to a partner integration. A guest lives
//      in `volunteers` and nowhere else.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// Exactly the columns a stranger may see. Written once and shared by
// every read in this file so a future edit cannot widen one path and
// leave the others behind — that is how an item list ends up on a
// public endpoint.
//
// beneficiary_name falls back to the ECD's own name: picking_slips
// carries its own denormalised copy, but it is nullable and most rows
// have not got one.
// dispatch_date is cast to text deliberately.
//
// node-postgres turns a `date` into a JS Date at LOCAL midnight, which
// JSON then serialises as UTC: 2026-09-16 goes out as
// "2026-09-15T22:00:00.000Z" from a UTC+2 box. A volunteer reading the
// day off that is reading yesterday. ::text keeps it the calendar day
// the warehouse means, with no timezone attached to be shifted.
const PREVIEW_COLUMNS = `
  ps.id,
  ps.dispatch_date::text AS dispatch_date,
  ps.status,
  ps.beneficiary_kind,
  COALESCE(ps.beneficiary_name, e.name) AS beneficiary_name,
  (SELECT COUNT(*)::int FROM picking_slip_items i WHERE i.picking_slip_id = ps.id) AS item_count,
  (ps.assigned_volunteer_id IS NOT NULL OR ps.assigned_to IS NOT NULL) AS is_claimed`;

// A slip is open to a guest while it is still packable. Mirrors
// CLAIMABLE_STATUSES in picking.repository.js — a completed or
// dispatched pallet is finished and nobody may reopen it by scanning.
const CLAIMABLE_STATUSES = ['pending', 'in_progress'];

// Postgres rejects a malformed uuid with a cast error (22P02) rather
// than returning no rows, which would surface as a 500 on a mistyped
// URL. Checked in JS so a bad token is simply "not found", which is
// also what we want to tell the caller.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

// The short code is the last 6 hex characters of the token, which is
// what gets printed under the QR. A uuid is unusable for typing and a
// proper short-code column would be a schema change we are not making.
const SHORT_CODE_RE = /^[0-9a-f]{6}$/i;
export const isShortCode = (value) => typeof value === 'string' && SHORT_CODE_RE.test(value);

const getPreviewByToken = async (token) => {
  if (!isUuid(token)) return null;

  const { rows } = await pool.query(
    `SELECT ${PREVIEW_COLUMNS}
       FROM picking_slips ps
       JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE ps.public_token = $1::uuid`,
    [token],
  );
  return rows[0] ?? null;
};

// Matching on a suffix cannot use an index, but this table holds tens of
// rows per week and the alternative is a schema change. If it ever grows
// enough to matter, that is the moment to add a real short-code column.
//
// Returns ALL matches. The caller decides what to do about more than
// one — this layer must never pick a winner, because picking one would
// hand a volunteer someone else's pallet with no sign anything was
// ambiguous.
const findPreviewsByShortCode = async (code) => {
  if (!isShortCode(code)) return [];

  const { rows } = await pool.query(
    `SELECT ${PREVIEW_COLUMNS}
       FROM picking_slips ps
       JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE RIGHT(ps.public_token::text, 6) = LOWER($1)
      ORDER BY ps.dispatch_date DESC, ps.id DESC`,
    [code],
  );
  return rows;
};

// Today's unclaimed pallets, for the volunteer who arrived without a QR
// code. Preview detail only: this is a list of things to choose from,
// not a view of the work.
const listUnclaimedForDate = async (dispatchDate) => {
  const { rows } = await pool.query(
    `SELECT ${PREVIEW_COLUMNS}
       FROM picking_slips ps
       JOIN ecd_centres e ON e.id = ps.ecd_id
      WHERE ps.dispatch_date = $1::date
        AND ps.status = ANY($2)
        AND ps.assigned_volunteer_id IS NULL
        AND ps.assigned_to IS NULL
      ORDER BY ps.id ASC`,
    [dispatchDate, CLAIMABLE_STATUSES],
  );
  return rows;
};

// ── Claim ─────────────────────────────────────────────────────
// FOR UPDATE for the same reason the staff claim takes it: two
// volunteers scanning the same poster at the same moment.
//
// Idempotent in the one direction that matters — a volunteer re-scanning
// their own pallet succeeds quietly rather than being told it is taken
// by someone, that someone being themselves.
//
// Does NOT set assigned_to. A guest holds a slip through
// assigned_volunteer_id; writing a volunteer id into assigned_to would
// point an FK at users and name a staff member.
const claimForVolunteer = async ({ slipId, volunteerId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      `SELECT id, status, assigned_to, assigned_volunteer_id
         FROM picking_slips WHERE id = $1 FOR UPDATE`,
      [slipId],
    );
    const slip = current.rows[0];
    if (!slip) { await client.query('ROLLBACK'); return { notFound: true }; }

    if (!CLAIMABLE_STATUSES.includes(slip.status)) {
      await client.query('ROLLBACK');
      return { locked: true, status: slip.status };
    }

    // Held by staff — a guest does not take a pallet off a worker.
    if (slip.assigned_to !== null) {
      await client.query('ROLLBACK');
      return { takenByStaff: true };
    }

    // Held by a different volunteer. String comparison: int8 arrives as
    // text from node-postgres while the JWT id may be either.
    const heldBy = slip.assigned_volunteer_id;
    if (heldBy !== null && String(heldBy) !== String(volunteerId)) {
      await client.query('ROLLBACK');
      return { takenByVolunteer: true };
    }

    const result = await client.query(
      `UPDATE picking_slips
          SET assigned_volunteer_id = $1,
              status     = 'in_progress',
              started_at = COALESCE(started_at, NOW())
        WHERE id = $2
        RETURNING *`,
      [volunteerId, slipId],
    );

    // 'assigned', the same event type staff claims emit, with the
    // volunteer in detail. actor_id stays NULL: it is an int4 FK to
    // users and a volunteer id would name a real staff account.
    await client.query(
      `INSERT INTO picking_events (picking_slip_id, event_type, actor_id, detail)
       VALUES ($1, 'assigned', NULL, $2)`,
      [slipId, { actor_type: 'volunteer', volunteer_id: volunteerId }],
    );

    await client.query('COMMIT');
    return { slip: result.rows[0], alreadyMine: heldBy !== null };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// The slip a volunteer currently holds, if any. Used to answer "what am
// I working on" without the guest ever naming a slip id.
const findSlipIdForVolunteer = async (volunteerId) => {
  const { rows } = await pool.query(
    `SELECT id FROM picking_slips
      WHERE assigned_volunteer_id = $1
        AND status = ANY($2)
      ORDER BY id DESC
      LIMIT 1`,
    [volunteerId, CLAIMABLE_STATUSES],
  );
  return rows[0]?.id ?? null;
};

// Does this volunteer hold this slip? The ownership question on its own,
// for read paths that do not go through the packing repository's
// locked write guards.
const volunteerHoldsSlip = async ({ slipId, volunteerId }) => {
  const { rows } = await pool.query(
    `SELECT assigned_volunteer_id FROM picking_slips WHERE id = $1`,
    [slipId],
  );
  if (!rows[0]) return false;
  const held = rows[0].assigned_volunteer_id;
  return held !== null && String(held) === String(volunteerId);
};

export default {
  CLAIMABLE_STATUSES,
  isUuid,
  isShortCode,
  getPreviewByToken,
  findPreviewsByShortCode,
  listUnclaimedForDate,
  claimForVolunteer,
  findSlipIdForVolunteer,
  volunteerHoldsSlip,
};

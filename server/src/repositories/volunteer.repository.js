// ─────────────────────────────────────────────────────────────
// server/src/repositories/volunteer.repository.js
//
// Reading the guest log, and closing a visit.
//
// The table already existed and has been filling up since guest login
// went in: POST /api/volunteers/sign-in inserts a row per arrival with
// source = 'guest_login' and a signed_in_at from the database default.
// Nothing has ever read it back. This is the read.
//
// signed_out_at HAS NEVER BEEN SET BY ANYTHING.
// Not by /api/login/logout, which only clears the cookie, and not by
// any other path — a grep for the column finds three readers and no
// writer. Two things quietly depend on it:
//
//   reporting.repository.js:604  volunteer hours, which sums
//     signed_out_at - signed_in_at and requires signed_out_at IS NOT
//     NULL. With nothing ever writing it, that metric has always
//     returned an empty series.
//   session.route.js:54  rejects a guest session whose visit has been
//     signed out. A check that can never fire.
//
// signOutVolunteer below is the missing writer.
//
// SAST, NOT UTC.
// Render runs in UTC and Cape Town is UTC+2, so a guest who signs in
// at 09:00 on Tuesday is a Tuesday arrival to the person reading this
// screen and, for two hours either side of midnight, a different day
// to the server. Every date filter goes through
// (... AT TIME ZONE 'Africa/Johannesburg')::date — the same rule
// reporting.repository.js sets out at the top of the file.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const SAST = "AT TIME ZONE 'Africa/Johannesburg'";

const VOLUNTEER_COLUMNS = `
  v.id, v.full_name, v.source, v.signed_in_at, v.signed_out_at,
  CASE
    WHEN v.signed_out_at IS NULL THEN NULL
    ELSE ROUND(EXTRACT(EPOCH FROM (v.signed_out_at - v.signed_in_at)) / 60.0)::int
  END AS minutes_on_site`;

// from/to are inclusive SAST dates; either may be null.
const listGuestLog = async ({ search = null, from = null, to = null, limit = 500 } = {}) => {
  const params = [];
  const where  = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`v.full_name ILIKE $${params.length}`);
  }
  if (from) {
    params.push(from);
    where.push(`(v.signed_in_at ${SAST})::date >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`(v.signed_in_at ${SAST})::date <= $${params.length}::date`);
  }

  // Capped rather than paginated. This table grows by a handful of rows
  // a day and 500 is roughly a year of arrivals; a LIMIT keeps one bad
  // query from pulling the whole table into memory, and the date
  // filters are the real way to narrow it. If it ever outgrows that,
  // the cap is the thing that will say so.
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT ${VOLUNTEER_COLUMNS}
       FROM volunteers v
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY v.signed_in_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
};

// Closing a visit. WHERE signed_out_at IS NULL makes this idempotent
// in the only direction that matters: pressing it twice cannot move a
// sign-out time that has already been recorded, and the volunteer
// hours report is built on the difference between the two stamps.
//
// Returns null when there was nothing open to close, so the caller can
// tell "already signed out" from "no such visit".
const signOutVolunteer = async (id) => {
  const { rows } = await pool.query(
    `UPDATE volunteers
        SET signed_out_at = now()
      WHERE id = $1 AND signed_out_at IS NULL
      RETURNING ${VOLUNTEER_COLUMNS.replace(/v\./g, '')}`,
    [id],
  );
  return rows[0] ?? null;
};

const getVolunteerById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${VOLUNTEER_COLUMNS} FROM volunteers v WHERE v.id = $1`,
    [id],
  );
  return rows[0] ?? null;
};

export default { listGuestLog, signOutVolunteer, getVolunteerById };

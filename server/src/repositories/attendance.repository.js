// ─────────────────────────────────────────────────────────────
// server/src/repositories/attendance.repository.js
//
// All SQL for attendance.
// Database access only — no no-show calculation, no business
// rules about what attendance means. The service layer owns
// those; here we only persist attendance state.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const ATTENDANCE_COLUMNS = `
  attendance_id, booking_id, checked_in, check_in_time, source,
  last_synced_at, created_at, updated_at
`;

// ── Create an attendance record ───────────────────────────────
const createAttendance = async ({
  bookingId,
  checkedIn = false,
  checkInTime = null,
  source = null,
  lastSyncedAt = null,
}, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO public.attendance
       (booking_id, checked_in, check_in_time, source, last_synced_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${ATTENDANCE_COLUMNS}`,
    [bookingId, checkedIn, checkInTime ?? null, source ?? null, lastSyncedAt ?? null]
  );
  return rows[0];
};

// ── One attendance record by id ───────────────────────────────
const findById = async (attendanceId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${ATTENDANCE_COLUMNS} FROM public.attendance
       WHERE attendance_id = $1`,
    [attendanceId]
  );
  return rows[0] ?? null;
};

// ── Attendance for a specific booking ─────────────────────────
const findByBookingId = async (bookingId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${ATTENDANCE_COLUMNS} FROM public.attendance
       WHERE booking_id = $1`,
    [bookingId]
  );
  return rows[0] ?? null;
};

// ── Update only mutable attendance fields ─────────────────────
// attendance_id, booking_id, created_at are intentionally absent.
const UPDATABLE = {
  checkedIn:    'checked_in',
  checkInTime:  'check_in_time',
  source:       'source',
  lastSyncedAt: 'last_synced_at',
};

const updateAttendance = async (attendanceId, changes, client = pool) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
    params.push(changes[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return findById(attendanceId, client);

  params.push(attendanceId);
  const { rows } = await client.query(
    `UPDATE public.attendance
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE attendance_id = $${params.length}
       RETURNING ${ATTENDANCE_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
};

// ── Idempotent attendance upsert by booking ───────────────────
// One logical attendance row per booking. Repeated calls update
// the existing row rather than creating duplicates.
const upsertByBookingId = async (bookingId, data, client = pool) => {
  const {
    checkedIn = false,
    checkInTime = null,
    source = null,
    lastSyncedAt = null,
  } = data;

  const { rows } = await client.query(
    `INSERT INTO public.attendance
       (booking_id, checked_in, check_in_time, source, last_synced_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (booking_id) DO UPDATE SET
       checked_in = EXCLUDED.checked_in,
       check_in_time = EXCLUDED.check_in_time,
       source = EXCLUDED.source,
       last_synced_at = EXCLUDED.last_synced_at,
       updated_at = NOW()
     RETURNING ${ATTENDANCE_COLUMNS}`,
    [bookingId, checkedIn, checkInTime ?? null, source ?? null, lastSyncedAt ?? null]
  );
  return rows[0];
};

// ── Count checked-in attendance for a timeslot ────────────────
// Joins attendance → volunteer_bookings to scope by timeslot.
// Persistence aggregation only — not no-show business logic.
const countCheckedInByTimeslot = async (timeslotId, client = pool) => {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM public.attendance a
       JOIN public.volunteer_bookings vb ON vb.booking_id = a.booking_id
       WHERE vb.timeslot_id = $1 AND a.checked_in = TRUE`,
    [timeslotId]
  );
  return rows[0].count;
};

export default {
  createAttendance,
  findById,
  findByBookingId,
  updateAttendance,
  upsertByBookingId,
  countCheckedInByTimeslot,
};

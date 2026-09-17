// ─────────────────────────────────────────────────────────────
// server/src/repositories/volunteerBooking.repository.js
//
// All SQL for volunteer_bookings.
// Database access only — no source validation, no capacity
// decisions. The service layer owns whether a booking is
// allowed; here we only persist it. External IDs are VARCHAR
// because the real VMS contract is unknown and must not assume
// UUID format.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

const BOOKING_COLUMNS = `
  booking_id, timeslot_id, external_booking_id, external_volunteer_id,
  volunteer_first_name, volunteer_last_name, booking_source,
  booking_status, booked_at, last_synced_at, created_at, updated_at
`;

// ── Create a booking ──────────────────────────────────────────
const createBooking = async ({
  timeslotId,
  externalBookingId = null,
  externalVolunteerId = null,
  volunteerFirstName,
  volunteerLastName = null,
  bookingSource,
  bookingStatus,
  lastSyncedAt = null,
}, client = pool) => {
  const { rows } = await client.query(
    `INSERT INTO public.volunteer_bookings
       (timeslot_id, external_booking_id, external_volunteer_id,
        volunteer_first_name, volunteer_last_name, booking_source,
        booking_status, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${BOOKING_COLUMNS}`,
    [
      timeslotId,
      externalBookingId ?? null,
      externalVolunteerId ?? null,
      volunteerFirstName,
      volunteerLastName ?? null,
      bookingSource,
      bookingStatus,
      lastSyncedAt ?? null,
    ]
  );
  return rows[0];
};

// ── One booking by id ─────────────────────────────────────────
const findById = async (bookingId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${BOOKING_COLUMNS} FROM public.volunteer_bookings
       WHERE booking_id = $1`,
    [bookingId]
  );
  return rows[0] ?? null;
};

// ── All bookings for a timeslot ───────────────────────────────
const findByTimeslotId = async (timeslotId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${BOOKING_COLUMNS} FROM public.volunteer_bookings
       WHERE timeslot_id = $1
       ORDER BY booked_at ASC, created_at ASC`,
    [timeslotId]
  );
  return rows;
};

// ── Lookup by external booking id ─────────────────────────────
const findByExternalBookingId = async (externalBookingId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${BOOKING_COLUMNS} FROM public.volunteer_bookings
       WHERE external_booking_id = $1`,
    [externalBookingId]
  );
  return rows[0] ?? null;
};

// ── Lookup by external volunteer id ───────────────────────────
const findByExternalVolunteerId = async (externalVolunteerId, client = pool) => {
  const { rows } = await client.query(
    `SELECT ${BOOKING_COLUMNS} FROM public.volunteer_bookings
       WHERE external_volunteer_id = $1
       ORDER BY booked_at ASC, created_at ASC`,
    [externalVolunteerId]
  );
  return rows;
};

// ── Update only mutable booking fields ────────────────────────
// booking_id, timeslot_id, created_at are intentionally absent.
const UPDATABLE = {
  externalBookingId:  'external_booking_id',
  externalVolunteerId: 'external_volunteer_id',
  volunteerFirstName: 'volunteer_first_name',
  volunteerLastName:  'volunteer_last_name',
  bookingSource:      'booking_source',
  bookingStatus:      'booking_status',
  lastSyncedAt:       'last_synced_at',
};

const updateBooking = async (bookingId, changes, client = pool) => {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
    params.push(changes[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (!sets.length) return findById(bookingId, client);

  params.push(bookingId);
  const { rows } = await client.query(
    `UPDATE public.volunteer_bookings
         SET ${sets.join(', ')}, updated_at = NOW()
       WHERE booking_id = $${params.length}
       RETURNING ${BOOKING_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
};

// ── Idempotent external booking upsert ────────────────────────
// Repeated external_booking_id must update/reuse the existing
// row, not create a duplicate. Keyed on the unique constraint.
const upsertExternalBooking = async (data, client = pool) => {
  const {
    externalBookingId,
    externalVolunteerId,
    timeslotId,
    volunteerFirstName,
    volunteerLastName = null,
    bookingSource,
    bookingStatus,
    lastSyncedAt = null,
  } = data;

  const { rows } = await client.query(
    `INSERT INTO public.volunteer_bookings
       (external_booking_id, external_volunteer_id, timeslot_id,
        volunteer_first_name, volunteer_last_name, booking_source,
        booking_status, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (external_booking_id) DO UPDATE SET
       external_volunteer_id = EXCLUDED.external_volunteer_id,
       timeslot_id = EXCLUDED.timeslot_id,
       volunteer_first_name = EXCLUDED.volunteer_first_name,
       volunteer_last_name = EXCLUDED.volunteer_last_name,
       booking_source = EXCLUDED.booking_source,
       booking_status = EXCLUDED.booking_status,
       last_synced_at = EXCLUDED.last_synced_at,
       updated_at = NOW()
     RETURNING ${BOOKING_COLUMNS}`,
    [
      externalBookingId,
      externalVolunteerId,
      timeslotId,
      volunteerFirstName,
      volunteerLastName ?? null,
      bookingSource,
      bookingStatus,
      lastSyncedAt ?? null,
    ]
  );
  return rows[0];
};

// ── Count confirmed bookings for a timeslot ───────────────────
// Persistence aggregation only — not capacity business logic.
const countConfirmedByTimeslot = async (timeslotId, client = pool) => {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count FROM public.volunteer_bookings
       WHERE timeslot_id = $1 AND booking_status = 'CONFIRMED'`,
    [timeslotId]
  );
  return rows[0].count;
};

export default {
  createBooking,
  findById,
  findByTimeslotId,
  findByExternalBookingId,
  findByExternalVolunteerId,
  updateBooking,
  upsertExternalBooking,
  countConfirmedByTimeslot,
};

// ─────────────────────────────────────────────────────────────
// server/src/services/attendance.service.js
//
// Business logic for volunteer attendance.
//
// Rules enforced here:
//   - The booking must exist before attendance is recorded.
//   - checked_in=false  => check_in_time must be null.
//   - checked_in=true   => check_in_time is required; when omitted
//                          it is set to the current time.
//   - booked and attended remain separate counts.
//   - attended  = checked-in count for the scope.
//   - noShow     = booked - attended.
//   - Local attendance actions are audited. External attendance
//     sync uses idempotent persistence and is not audited as a
//     local action.
// ─────────────────────────────────────────────────────────────
import attendanceRepo from '../repositories/attendance.repository.js';
import bookingRepo from '../repositories/volunteerBooking.repository.js';
import timeslotRepo from '../repositories/eventTimeslot.repository.js';
import { logAudit } from '../repositories/auditLog.repository.js';
import { withTransaction } from '../utils/transaction.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// Normalise a checked_in / check_in_time pair so it always satisfies
// the schema's consistency CHECK:
//   false => null,  true => a timestamp (defaulting to now).
const normaliseAttendance = (checkedIn, checkInTime) => {
  if (!checkedIn) {
    return { checkedIn: false, checkInTime: null };
  }
  return {
    checkedIn: true,
    checkInTime: checkInTime || new Date().toISOString(),
  };
};

// ── confirmAttendance ─────────────────────────────────────────
// Local check-in. Booking must exist. Enforces check_in_time rules
// and audits the action.
const confirmAttendance = async (bookingId, data, actor) => {
  if (!bookingId) fail(400, 'Booking ID is required.');

  const booking = await bookingRepo.findById(bookingId);
  if (!booking) fail(404, 'Booking not found.');

  const { checkedIn, checkInTime } = normaliseAttendance(
    data?.checkedIn,
    data?.checkInTime
  );

  return withTransaction(async (client) => {
    const attendance = await attendanceRepo.upsertByBookingId(
      bookingId,
      {
        checkedIn,
        checkInTime,
        source: data?.source ?? 'WMS',
        lastSyncedAt: data?.lastSyncedAt ?? null,
      },
      client
    );

    await logAudit(client, {
      entityType: 'attendance', entityId: bookingId,
      action: checkedIn ? 'CHECK_IN' : 'CHECK_OUT',
      actorId: actor ? Number(actor.id) : null,
      after: attendance,
    });

    return attendance;
  });
};

// ── syncExternalAttendance ────────────────────────────────────
// Idempotent external attendance sync. Not audited as a local
// action.
const syncExternalAttendance = async (data) => {
  if (!data || typeof data !== 'object') {
    fail(400, 'Attendance data is required.');
  }
  const { bookingId } = data;
  if (!bookingId) fail(400, 'bookingId is required.');

  const booking = await bookingRepo.findById(bookingId);
  if (!booking) fail(404, 'Booking not found.');

  const { checkedIn, checkInTime } = normaliseAttendance(
    data.checkedIn,
    data.checkInTime
  );

  return attendanceRepo.upsertByBookingId(bookingId, {
    checkedIn,
    checkInTime,
    source: data.source ?? 'VMS',
    lastSyncedAt: data.lastSyncedAt ?? null,
  });
};

// ── getAttendanceForBooking ───────────────────────────────────
const getAttendanceForBooking = async (bookingId) => {
  if (!bookingId) fail(400, 'Booking ID is required.');
  return attendanceRepo.findByBookingId(bookingId);
};

// ── getAttendanceForTimeslot ──────────────────────────────────
const getAttendanceForTimeslot = async (timeslotId) => {
  if (!timeslotId) fail(400, 'Timeslot ID is required.');
  const bookings = await bookingRepo.findByTimeslotId(timeslotId);

  const rows = [];
  for (const b of bookings) {
    const row = await attendanceRepo.findByBookingId(b.booking_id);
    if (row) rows.push(row);
  }
  return rows;
};

// ── getAttendanceForEvent ─────────────────────────────────────
const getAttendanceForEvent = async (eventId) => {
  if (!eventId) fail(400, 'Event ID is required.');
  const timeslots = await timeslotRepo.findByEventId(eventId);

  const rows = [];
  for (const slot of timeslots) {
    const bookings = await bookingRepo.findByTimeslotId(slot.timeslot_id);
    for (const b of bookings) {
      const row = await attendanceRepo.findByBookingId(b.booking_id);
      if (row) rows.push(row);
    }
  }
  return rows;
};

// ── getAttendanceSummary ──────────────────────────────────────
// booked = CONFIRMED bookings; attended = checked-in count;
// noShow = booked - attended.
const getAttendanceSummary = async (timeslotId) => {
  if (!timeslotId) fail(400, 'Timeslot ID is required.');

  const timeslot = await timeslotRepo.findById(timeslotId);
  if (!timeslot) fail(404, 'Timeslot not found.');

  const booked = await bookingRepo.countConfirmedByTimeslot(timeslotId);
  const attended = await attendanceRepo.countCheckedInByTimeslot(timeslotId);

  return {
    timeslotId,
    booked,
    attended,
    noShow: booked - attended,
  };
};

export default {
  confirmAttendance,
  syncExternalAttendance,
  getAttendanceForBooking,
  getAttendanceForTimeslot,
  getAttendanceForEvent,
  getAttendanceSummary,
};

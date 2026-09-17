// ─────────────────────────────────────────────────────────────
// server/src/controllers/attendance.controller.js
//
// Thin HTTP layer for volunteer attendance. All business logic lives
// in attendance.service.js — controllers here only pull data off the
// request, call the service, and shape the response. Errors are
// forwarded to next(err) for the central error handler in
// server/index.js.
// ─────────────────────────────────────────────────────────────
import attendanceService from '../services/attendance.service.js';

// ── PUT /api/love-activism/bookings/:bookingId/attendance ────
const confirmAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.confirmAttendance(
      req.params.bookingId,
      req.body,
      req.user
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/bookings/:bookingId/attendance ────
const getAttendanceForBooking = async (req, res, next) => {
  try {
    const result = await attendanceService.getAttendanceForBooking(req.params.bookingId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/timeslots/:timeslotId/attendance ──
const getAttendanceForTimeslot = async (req, res, next) => {
  try {
    const result = await attendanceService.getAttendanceForTimeslot(req.params.timeslotId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/events/:eventId/attendance ────────
const getAttendanceForEvent = async (req, res, next) => {
  try {
    const result = await attendanceService.getAttendanceForEvent(req.params.eventId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/timeslots/:timeslotId/attendance/summary
const getAttendanceSummary = async (req, res, next) => {
  try {
    const result = await attendanceService.getAttendanceSummary(req.params.timeslotId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export default {
  confirmAttendance,
  getAttendanceForBooking,
  getAttendanceForTimeslot,
  getAttendanceForEvent,
  getAttendanceSummary,
};

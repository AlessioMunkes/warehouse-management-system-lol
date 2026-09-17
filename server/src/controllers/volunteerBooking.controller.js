// ─────────────────────────────────────────────────────────────
// server/src/controllers/volunteerBooking.controller.js
//
// Thin HTTP layer for volunteer bookings (VMS + walk-in guests).
// All business logic lives in volunteerBooking.service.js —
// controllers here only pull data off the request, call the service,
// and shape the response. Errors are forwarded to next(err) for the
// central error handler in server/index.js.
// ─────────────────────────────────────────────────────────────
import volunteerBookingService from '../services/volunteerBooking.service.js';

// ── GET /api/love-activism/bookings/:bookingId ────────────────
const getBooking = async (req, res, next) => {
  try {
    const result = await volunteerBookingService.getBooking(req.params.bookingId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/events/:eventId/bookings ──────────
const getBookingsForEvent = async (req, res, next) => {
  try {
    const result = await volunteerBookingService.getBookingsForEvent(req.params.eventId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/timeslots/:timeslotId/bookings ────
const getBookingsForTimeslot = async (req, res, next) => {
  try {
    const result = await volunteerBookingService.getBookingsForTimeslot(req.params.timeslotId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/love-activism/timeslots/:timeslotId/guests ─────
const createWalkIn = async (req, res, next) => {
  try {
    const result = await volunteerBookingService.createWalkIn(
      req.params.timeslotId,
      req.body,
      req.user
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/love-activism/bookings/:bookingId/cancel ──────
const cancelGuestBooking = async (req, res, next) => {
  try {
    const result = await volunteerBookingService.cancelGuestBooking(req.params.bookingId, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export default {
  getBooking,
  getBookingsForEvent,
  getBookingsForTimeslot,
  createWalkIn,
  cancelGuestBooking,
};

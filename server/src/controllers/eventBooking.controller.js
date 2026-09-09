// ─────────────────────────────────────────────────────────────
// server/src/controllers/eventBooking.controller.js
//
// Thin HTTP layer for event space / timeslot booking. All business
// logic lives in eventBooking.service.js — controllers here only pull
// data off the request, call the service, and shape the response.
// Errors are forwarded to next(err) for the central error handler in
// server/index.js.
//
// NOTE on updateEventBooking: the route surface is
//   PATCH /api/love-activism/events/:eventId/booking
// (booking configuration belonging to its parent eventId). The service
// signature is updateEventBooking(eventId, changes, actor) where
// changes.timeslotId selects the timeslot within that event; the
// controller forwards req.params.eventId as the first argument and
// req.body (including timeslotId) as changes.
// ─────────────────────────────────────────────────────────────
import eventBookingService from '../services/eventBooking.service.js';

// ── POST /api/love-activism/events/:eventId/booking ──────────
const bookEventSpaceAndTimeslots = async (req, res, next) => {
  try {
    const result = await eventBookingService.bookEventSpaceAndTimeslots(
      req.params.eventId,
      req.body,
      req.user
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/love-activism/events/:eventId/booking ─────────
const updateEventBooking = async (req, res, next) => {
  try {
    const result = await eventBookingService.updateEventBooking(
      req.params.eventId,
      req.body,
      req.user
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/events/:eventId/booking ───────────
const getEventBooking = async (req, res, next) => {
  try {
    const result = await eventBookingService.getEventBooking(req.params.eventId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/events/:eventId/timeslots ─────────
const getTimeslotsForEvent = async (req, res, next) => {
  try {
    const result = await eventBookingService.getTimeslotsForEvent(req.params.eventId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/love-activism/timeslots/:timeslotId/close ─────
const closeTimeslot = async (req, res, next) => {
  try {
    const result = await eventBookingService.closeTimeslot(req.params.timeslotId, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/love-activism/timeslots/:timeslotId/cancel ────
const cancelTimeslot = async (req, res, next) => {
  try {
    const result = await eventBookingService.cancelTimeslot(req.params.timeslotId, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/timeslots/:timeslotId/capacity ────
const getCapacitySummary = async (req, res, next) => {
  try {
    const result = await eventBookingService.getCapacitySummary(req.params.timeslotId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export default {
  bookEventSpaceAndTimeslots,
  updateEventBooking,
  getEventBooking,
  getTimeslotsForEvent,
  closeTimeslot,
  cancelTimeslot,
  getCapacitySummary,
};

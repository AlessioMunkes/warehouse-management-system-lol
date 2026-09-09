// ─────────────────────────────────────────────────────────────
// server/src/controllers/loveActivismEvent.controller.js
//
// Thin HTTP layer for Love Activism events. All business logic and
// validation lives in loveActivismEvent.service.js — controllers here
// only pull data off the request, call the service, and shape the
// response. Errors are forwarded to next(err) for the central error
// handler in server/index.js (which reads err.status, same convention
// as picking/donation/dispatch controllers).
// ─────────────────────────────────────────────────────────────
import loveActivismEventService from '../services/loveActivismEvent.service.js';

// ── POST /api/love-activism/events ────────────────────────────
const createEvent = async (req, res, next) => {
  try {
    const result = await loveActivismEventService.createEvent(req.body, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/events ─────────────────────────────
const listEvents = async (req, res, next) => {
  try {
    const result = await loveActivismEventService.listEvents(req.query);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/love-activism/events/:eventId ────────────────────
const getEvent = async (req, res, next) => {
  try {
    const result = await loveActivismEventService.getEvent(req.params.eventId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/love-activism/events/:eventId ──────────────────
const updateEvent = async (req, res, next) => {
  try {
    const result = await loveActivismEventService.updateEvent(req.params.eventId, req.body, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/love-activism/events/:eventId/cancel ───────────
const cancelEvent = async (req, res, next) => {
  try {
    const result = await loveActivismEventService.cancelEvent(req.params.eventId, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/love-activism/events/:eventId/complete ─────────
const completeEvent = async (req, res, next) => {
  try {
    const result = await loveActivismEventService.completeEvent(req.params.eventId, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export default {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  cancelEvent,
  completeEvent,
};

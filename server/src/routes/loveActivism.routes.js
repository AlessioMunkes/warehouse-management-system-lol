// ─────────────────────────────────────────────────────────────
// server/src/routes/loveActivism.routes.js
//
// Volunteer (Love Activism) HTTP surface mounted at
// /api/love-activism in server/index.js.
//
// Flow per route: auth → requireRole(...) → controller → service.
// requireRole IS the project's ProtectedRoleBasedAccess middleware
// (see src/middleware/auth.middleware.js) — the spec name
// "ProtectedRoleBasedAccess" does not exist as a separate export in
// this repo, so it is not invented here.
//
// RBAC mapping uses ONLY existing ROLES (warehouse_worker, manager,
// admin, finance, guest). There is no Love Activism Coordinator role
// in code/config/DB, so Coordinator mapping is DEFERRED (see below).
// No new roles are added.
//
// ID validation: event/timeslot/booking ids in this domain are NOT
// plain integers in Phase 1–4 tests/services (e.g. 'e1', 't1', 'b1'),
// so validateIntParam MUST NOT be applied here — it would 400 every
// legitimate id. Services own id presence checks (fail 400) and
// existence checks (fail 404).
// ─────────────────────────────────────────────────────────────
import express from 'express';
import auth, { requireRole, ROLES } from '../middleware/auth.middleware.js';
import loveActivismEventController from '../controllers/loveActivismEvent.controller.js';
import eventBookingController from '../controllers/eventBooking.controller.js';
import volunteerBookingController from '../controllers/volunteerBooking.controller.js';
import attendanceController from '../controllers/attendance.controller.js';
import vmsSyncController from '../controllers/vmsSync.controller.js';
import eventSpaceController from '../controllers/eventSpace.controller.js';

const router = express.Router();

// ── Role groups (existing roles only) ─────────────────────────
// DEFERRED: Love Activism Coordinator role mapping. No coordinator
// role exists in auth.middleware.js ROLES, users table, or config.
// If/when it is introduced, add it to MANAGERS_UP / STAFF_UP below.
const ALL_ROLES = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];
const STAFF_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

// ── Event spaces (read-only) ─────────────────────────────────
router.get('/spaces', auth, requireRole(...MANAGERS_UP), eventSpaceController.listActiveSpaces);
router.post('/spaces', auth, requireRole(...MANAGERS_UP), eventSpaceController.createSpace);

// ── Events ────────────────────────────────────────────────────
router.post('/events', auth, requireRole(...MANAGERS_UP), loveActivismEventController.createEvent);
router.get('/events', auth, requireRole(...ALL_ROLES), loveActivismEventController.listEvents);
router.get('/events/:eventId', auth, requireRole(...ALL_ROLES), loveActivismEventController.getEvent);
router.patch('/events/:eventId', auth, requireRole(...MANAGERS_UP), loveActivismEventController.updateEvent);
router.patch('/events/:eventId/cancel', auth, requireRole(...MANAGERS_UP), loveActivismEventController.cancelEvent);
router.patch('/events/:eventId/complete', auth, requireRole(...MANAGERS_UP), loveActivismEventController.completeEvent);

// ── Booking / timeslots ───────────────────────────────────────
router.post('/events/:eventId/booking', auth, requireRole(...MANAGERS_UP), eventBookingController.bookEventSpaceAndTimeslots);
router.get('/events/:eventId/booking', auth, requireRole(...ALL_ROLES), eventBookingController.getEventBooking);
router.patch('/events/:eventId/booking', auth, requireRole(...MANAGERS_UP), eventBookingController.updateEventBooking);
router.get('/events/:eventId/timeslots', auth, requireRole(...ALL_ROLES), eventBookingController.getTimeslotsForEvent);
router.patch('/timeslots/:timeslotId/close', auth, requireRole(...MANAGERS_UP), eventBookingController.closeTimeslot);
router.patch('/timeslots/:timeslotId/cancel', auth, requireRole(...MANAGERS_UP), eventBookingController.cancelTimeslot);
router.get('/timeslots/:timeslotId/capacity', auth, requireRole(...ALL_ROLES), eventBookingController.getCapacitySummary);

// ── Volunteer bookings ────────────────────────────────────────
router.get('/events/:eventId/bookings', auth, requireRole(...ALL_ROLES), volunteerBookingController.getBookingsForEvent);
router.get('/timeslots/:timeslotId/bookings', auth, requireRole(...ALL_ROLES), volunteerBookingController.getBookingsForTimeslot);
router.post('/timeslots/:timeslotId/guests', auth, requireRole(...STAFF_UP), volunteerBookingController.createWalkIn);
router.get('/bookings/:bookingId', auth, requireRole(...ALL_ROLES), volunteerBookingController.getBooking);
router.patch('/bookings/:bookingId/cancel', auth, requireRole(...STAFF_UP), volunteerBookingController.cancelGuestBooking);

// ── Attendance ────────────────────────────────────────────────
// Warehouse Staff attendance permission uses the existing
// warehouse_worker role via STAFF_UP — no new role introduced.
// PUT (upsert check-in) is a write; GETs are reads.
router.put('/bookings/:bookingId/attendance', auth, requireRole(...STAFF_UP), attendanceController.confirmAttendance);
router.get('/bookings/:bookingId/attendance', auth, requireRole(...ALL_ROLES), attendanceController.getAttendanceForBooking);
router.get('/timeslots/:timeslotId/attendance/summary', auth, requireRole(...ALL_ROLES), attendanceController.getAttendanceSummary);
router.get('/timeslots/:timeslotId/attendance', auth, requireRole(...ALL_ROLES), attendanceController.getAttendanceForTimeslot);
router.get('/events/:eventId/attendance', auth, requireRole(...ALL_ROLES), attendanceController.getAttendanceForEvent);

// ── Sync ──────────────────────────────────────────────────────
router.get('/sync/:entityType/:entityId', auth, requireRole(...MANAGERS_UP), vmsSyncController.getSyncStatus);
router.post('/sync/:entityType/:entityId/retry', auth, requireRole(...MANAGERS_UP), vmsSyncController.retrySync);

export default router;

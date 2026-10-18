// ─────────────────────────────────────────────────────────────
// server/src/integrations/mockVMS.adapter.js
//
// Code-only simulator for the external Volunteer Management System.
// No DB tables, no HTTP, no persistence — it only simulates the
// transport boundary so Phase 4 sync logic can be exercised.
//
// Behaviours simulated:
// - successful publish (deterministic fake external IDs)
// - VMS unavailable / failure
// - retry success (fail N times, then succeed)
// - optional forced failure mode for tests
// ─────────────────────────────────────────────────────────────

let forceFail = false;
let failNextCount = 0;

const fail = (message) => {
  const err = new Error(message);
  err.code = 'VMS_UNAVAILABLE';
  throw err;
};

// Deterministic fake external ID — same input always yields the
// same output, so retries and assertions are stable.
const buildExternalId = (data = {}) => {
  const entityType = data.entityType ?? data.entity_type ?? 'event_booking';
  const entityId = data.entityId ?? data.entity_id ?? data.eventId ?? data.event_id ?? 'unknown';
  return `VMS-${String(entityType).toUpperCase()}-${String(entityId)}`;
};

const publishEventBooking = async (data) => {
  if (!data || typeof data !== 'object') fail('VMS publish requires a payload.');
  // Per-call opt-in failure (useful for targeted tests).
  if (data.forceFail === true) fail('VMS unavailable (forced failure).');
  if (forceFail) fail('VMS unavailable (forced failure).');
  if (failNextCount > 0) {
    failNextCount -= 1;
    fail('VMS unavailable (transient failure).');
  }
  return {
    externalId: buildExternalId(data),
    publishedAt: new Date().toISOString(),
  };
};

const publishEvent = async (event) => publishEventBooking({
  ...event,
  entityType: 'event_booking',
  entityId: event?.externalEventId ?? event?.eventId ?? event?.event_id,
});

const updateTimeslotCapacity = async (externalTimeslotId, capacity) => {
  if (!externalTimeslotId) fail('VMS capacity update requires a timeslot ID.');
  if (!Number.isInteger(capacity) || capacity <= 0) fail('VMS capacity update requires a positive capacity.');
  if (forceFail) fail('VMS unavailable (forced failure).');
  if (failNextCount > 0) {
    failNextCount -= 1;
    fail('VMS unavailable (transient failure).');
  }
  return {
    externalTimeslotId: String(externalTimeslotId),
    capacity,
    updatedAt: new Date().toISOString(),
  };
};

const getEventBookings = async (externalEventId) => {
  if (!externalEventId) fail('VMS booking snapshot requires an event ID.');
  if (forceFail) fail('VMS unavailable (forced failure).');
  if (failNextCount > 0) {
    failNextCount -= 1;
    fail('VMS unavailable (transient failure).');
  }
  return {
    externalEventId: String(externalEventId),
    bookingCount: 0,
    capacityTotal: 0,
    timeslots: [],
    bookings: [],
  };
};

const sendAttendance = async (attendance) => {
  if (!attendance?.vmsBookingId && !attendance?.externalBookingId) {
    fail('VMS attendance send requires a booking ID.');
  }
  if (forceFail) fail('VMS unavailable (forced failure).');
  if (failNextCount > 0) {
    failNextCount -= 1;
    fail('VMS unavailable (transient failure).');
  }
  return {
    vmsBookingId: String(attendance.vmsBookingId ?? attendance.externalBookingId),
    attendanceStatus: attendance.attendanceStatus ?? (attendance.checkedIn ? 'attended' : 'not_attended'),
    source: 'wms',
    recordedAt: attendance.recordedAt ?? attendance.checkInTime ?? new Date().toISOString(),
  };
};

// ── Test controls (code-only, no persistence) ──────────────────
const setForceFail = (value) => {
  forceFail = value === true;
};

const failNext = (count = 1) => {
  failNextCount = Number(count) > 0 ? Number(count) : 0;
};

const resetMockVMS = () => {
  forceFail = false;
  failNextCount = 0;
};

export default {
  publishEvent,
  publishEventBooking,
  getEventBookings,
  updateTimeslotCapacity,
  sendAttendance,
  setForceFail,
  failNext,
  resetMockVMS,
};

export { publishEvent, publishEventBooking, getEventBookings, updateTimeslotCapacity, sendAttendance, setForceFail, failNext, resetMockVMS };

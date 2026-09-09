// server/src/services/volunteerBooking.service.js
import bookingRepo from '../repositories/volunteerBooking.repository.js';
import timeslotRepo from '../repositories/eventTimeslot.repository.js';
import { logAudit } from '../repositories/auditLog.repository.js';
import { withTransaction } from '../utils/transaction.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const syncExternalBooking = async (data) => {
  if (!data || typeof data !== 'object') fail(400, 'Booking data is required.');
  const { externalBookingId, externalVolunteerId, timeslotId, volunteerFirstName, volunteerLastName = null, bookingStatus = 'CONFIRMED', lastSyncedAt = null } = data;
  if (!externalBookingId) fail(400, 'VMS bookings require an external booking ID.');
  if (!externalVolunteerId) fail(400, 'VMS bookings require an external volunteer ID.');
  if (!timeslotId) fail(400, 'timeslotId is required.');
  if (!volunteerFirstName || !String(volunteerFirstName).trim()) fail(400, 'volunteerFirstName is required.');
  const timeslot = await timeslotRepo.findById(timeslotId);
  if (!timeslot) fail(404, 'Timeslot not found.');
  return bookingRepo.upsertExternalBooking({
    externalBookingId, externalVolunteerId, timeslotId,
    volunteerFirstName: String(volunteerFirstName).trim(),
    volunteerLastName: volunteerLastName ?? null,
    bookingSource: 'VMS', bookingStatus, lastSyncedAt,
  });
};

const syncExternalBookings = async (timeslotId, bookings) => {
  if (!timeslotId) fail(400, 'Timeslot ID is required.');
  if (!Array.isArray(bookings)) fail(400, 'bookings must be an array.');
  const timeslot = await timeslotRepo.findById(timeslotId);
  if (!timeslot) fail(404, 'Timeslot not found.');
  const results = [];
  for (const booking of bookings) {
    results.push(await syncExternalBooking({ ...booking, timeslotId }));
  }
  return results;
};

const createWalkIn = async (timeslotId, guestData, actor) => {
  if (!timeslotId) fail(400, 'Timeslot ID is required.');
  const { volunteerFirstName, volunteerLastName = null } = guestData || {};
  if (!volunteerFirstName || !String(volunteerFirstName).trim()) fail(400, 'A first name is required for a walk-in booking.');
  const timeslot = await timeslotRepo.findById(timeslotId);
  if (!timeslot) fail(404, 'Timeslot not found.');
  if (timeslot.status !== 'OPEN') fail(409, 'Walk-ins are only allowed on OPEN timeslots.');
  const booked = await bookingRepo.countConfirmedByTimeslot(timeslotId);
  if (booked >= timeslot.capacity) fail(409, 'Timeslot is at full capacity.');

  return withTransaction(async (client) => {
    const booking = await bookingRepo.createBooking(
      { timeslotId, externalBookingId: null, externalVolunteerId: null, volunteerFirstName: String(volunteerFirstName).trim(), volunteerLastName: volunteerLastName ?? null, bookingSource: 'WMS_GUEST', bookingStatus: 'CONFIRMED' },
      client
    );
    await logAudit(client, { entityType: 'volunteer_booking', entityId: booking.booking_id, action: 'WALK_IN', actorId: actor ? Number(actor.id) : null, after: booking });
    return booking;
  });
};

const cancelGuestBooking = async (bookingId, actor) => {
  if (!bookingId) fail(400, 'Booking ID is required.');
  const existing = await bookingRepo.findById(bookingId);
  if (!existing) fail(404, 'Booking not found.');
  if (existing.booking_source !== 'WMS_GUEST') fail(409, 'Only walk-in (WMS_GUEST) bookings can be cancelled here.');
  if (existing.booking_status === 'CANCELLED') fail(409, 'Booking is already cancelled.');

  return withTransaction(async (client) => {
    const updated = await bookingRepo.updateBooking(bookingId, { bookingStatus: 'CANCELLED' }, client);
    await logAudit(client, { entityType: 'volunteer_booking', entityId: bookingId, action: 'CANCEL', actorId: actor ? Number(actor.id) : null, before: existing, after: updated });
    return updated;
  });
};

const getBooking = async (bookingId) => {
  if (!bookingId) fail(400, 'Booking ID is required.');
  const booking = await bookingRepo.findById(bookingId);
  if (!booking) fail(404, 'Booking not found.');
  return booking;
};

const getBookingsForTimeslot = async (timeslotId) => {
  if (!timeslotId) fail(400, 'Timeslot ID is required.');
  return bookingRepo.findByTimeslotId(timeslotId);
};

const getBookingsForEvent = async (eventId) => {
  if (!eventId) fail(400, 'Event ID is required.');
  const timeslots = await timeslotRepo.findByEventId(eventId);
  const bookings = [];
  for (const slot of timeslots) {
    const rows = await bookingRepo.findByTimeslotId(slot.timeslot_id);
    bookings.push(...rows);
  }
  return bookings;
};

export default {
  syncExternalBooking,
  syncExternalBookings,
  createWalkIn,
  cancelGuestBooking,
  getBooking,
  getBookingsForTimeslot,
  getBookingsForEvent,
};

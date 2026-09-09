// server/src/services/eventBooking.service.js
import eventRepo from '../repositories/loveActivismEvent.repository.js';
import spaceRepo from '../repositories/eventSpace.repository.js';
import timeslotRepo from '../repositories/eventTimeslot.repository.js';
import bookingRepo from '../repositories/volunteerBooking.repository.js';
import { logAudit } from '../repositories/auditLog.repository.js';
import { withTransaction } from '../utils/transaction.js';
import vmsSyncService from './vmsSync.service.js';

// Injectable seam for tests. Defaults to the real VMSSyncService.
// Post-commit failures never undo the local commit (see triggerPostCommitSync).
let syncServiceOverride = null;
const getSyncService = () => syncServiceOverride ?? vmsSyncService;
const setSyncService = (svc) => {
  syncServiceOverride = svc ?? null;
};

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

export const TIMESLOT_STATUSES = ['OPEN', 'CLOSED', 'CANCELLED'];

// ── Post-commit VMS trigger ─────────────────────────────────────
// Runs ONLY after COMMIT + client release. Never inside the
// transaction. External failure must not undo the local commit,
// so errors are swallowed after the sync row records FAILED
// (VMSSyncService persists that state itself).
const triggerPostCommitSync = (entityType, entityId) => {
  const svc = getSyncService();
  if (!svc || typeof svc.syncEntity !== 'function') return Promise.resolve(null);
  return svc.syncEntity(entityType, entityId).catch(() => null);
};

const bookEventSpaceAndTimeslots = async (eventId, bookingData, actor) => {
  if (!eventId) fail(400, 'Event ID is required.');
  const { spaceId, timeslots } = bookingData || {};
  if (!spaceId) fail(400, 'Space ID is required.');
  if (!Array.isArray(timeslots) || timeslots.length === 0) fail(400, 'At least one timeslot is required.');
  const event = await eventRepo.findById(eventId);
  if (!event) fail(404, 'Event not found.');
  const space = await spaceRepo.findById(spaceId);
  if (!space) fail(404, 'Event space not found.');
  if (!space.is_active) fail(409, 'Cannot book an inactive event space.');
  const validated = timeslots.map((slot, index) => {
    const prefix = 'Timeslot ' + (index + 1);
    if (!slot.startTime || !slot.endTime) fail(400, prefix + ': startTime and endTime are required.');
    const start = new Date(slot.startTime);
    const end = new Date(slot.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) fail(400, prefix + ': invalid timestamps.');
    if (end <= start) fail(400, prefix + ': endTime must be after startTime.');
    const capacity = Number(slot.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) fail(400, prefix + ': capacity must be a positive integer.');
    return { start: start.toISOString(), end: end.toISOString(), capacity };
  });
  return withTransaction(async (client) => {
    const created = [];
    for (const slot of validated) {
      const overlaps = await timeslotRepo.findPotentialOverlaps(eventId, spaceId, slot.start, slot.end, null, client);
      if (overlaps.length > 0) fail(409, 'One or more timeslots overlap an existing booking.');
      const row = await timeslotRepo.createTimeslot(
        { eventId, spaceId, startTime: slot.start, endTime: slot.end, capacity: slot.capacity, status: 'OPEN' }, client
      );
      created.push(row);
    }
        await logAudit(client, { entityType: 'event_timeslot', entityId: eventId, action: 'BOOK_SPACE', actorId: actor ? Number(actor.id) : null, after: { eventId, spaceId, timeslots: created } });
    // Queue VMS sync intention in the SAME transaction (PENDING only, no external call).
    await getSyncService().queueSync('event_booking', eventId, client);
    return created;
  }).then(async (created) => {
    // Post-commit only: client already released by withTransaction.
    await triggerPostCommitSync('event_booking', eventId);
    return created;
  });
};

const updateEventBooking = async (eventId, changes, actor) => {
  if (!eventId) fail(400, 'Event ID is required.');
  if (!changes || typeof changes !== 'object') fail(400, 'Changes are required.');
  const { timeslotId } = changes;
  if (!timeslotId) fail(400, 'Timeslot ID is required.');
  const event = await eventRepo.findById(eventId);
  if (!event) fail(404, 'Event not found.');
  const existing = await timeslotRepo.findById(timeslotId);
  if (!existing) fail(404, 'Timeslot not found.');
  if (existing.event_id !== eventId) fail(404, 'Timeslot not found for this event.');
  const nextStart = changes.startTime ? new Date(changes.startTime).toISOString() : existing.start_time;
  const nextEnd = changes.endTime ? new Date(changes.endTime).toISOString() : existing.end_time;
  if (new Date(nextEnd) <= new Date(nextStart)) fail(400, 'endTime must be after startTime.');
  if (changes.capacity !== undefined) {
    const capacity = Number(changes.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) fail(400, 'capacity must be a positive integer.');
  }
  const nextCapacity = changes.capacity !== undefined ? Number(changes.capacity) : existing.capacity;
  return withTransaction(async (client) => {
    const overlaps = await timeslotRepo.findPotentialOverlaps(existing.event_id, existing.space_id, nextStart, nextEnd, timeslotId, client);
    if (overlaps.length > 0) fail(409, 'Updated timeslot overlaps an existing booking.');
    const mutable = {};
    if (changes.startTime !== undefined) mutable.startTime = nextStart;
    if (changes.endTime !== undefined) mutable.endTime = nextEnd;
    if (changes.capacity !== undefined) mutable.capacity = nextCapacity;
    if (changes.status !== undefined) {
      if (!TIMESLOT_STATUSES.includes(changes.status)) fail(400, 'status must be one of: ' + TIMESLOT_STATUSES.join(', ') + '.');
      mutable.status = changes.status;
    }
    const updated = await timeslotRepo.updateTimeslot(timeslotId, mutable, client);
    await logAudit(client, { entityType: 'event_timeslot', entityId: timeslotId, action: 'UPDATE', actorId: actor ? Number(actor.id) : null, before: existing, after: updated });
    await getSyncService().queueSync('event_booking', existing.event_id, client);
    return updated;
  }).then(async (updated) => {
    await triggerPostCommitSync('event_booking', updated.event_id ?? existing.event_id);
    return updated;
  });
};

const getEventBooking = async (eventId) => {
  if (!eventId) fail(400, 'Event ID is required.');
  const event = await eventRepo.findById(eventId);
  if (!event) fail(404, 'Event not found.');
  const timeslots = await timeslotRepo.findByEventId(eventId);
  return { event, timeslots };
};

const getTimeslotsForEvent = async (eventId) => {
  if (!eventId) fail(400, 'Event ID is required.');
  return timeslotRepo.findByEventId(eventId);
};

const closeTimeslot = async (timeslotId, actor) => {
  if (!timeslotId) fail(400, 'Timeslot ID is required.');
  const existing = await timeslotRepo.findById(timeslotId);
  if (!existing) fail(404, 'Timeslot not found.');
  if (existing.status === 'CLOSED') fail(409, 'Timeslot is already closed.');
  if (existing.status === 'CANCELLED') fail(409, 'A cancelled timeslot cannot be closed.');
  return withTransaction(async (client) => {
    const updated = await timeslotRepo.updateTimeslot(timeslotId, { status: 'CLOSED' }, client);
    await logAudit(client, { entityType: 'event_timeslot', entityId: timeslotId, action: 'CLOSE', actorId: actor ? Number(actor.id) : null, before: existing, after: updated });
    await getSyncService().queueSync('event_booking', existing.event_id, client);
    return updated;
  }).then(async (updated) => {
    await triggerPostCommitSync('event_booking', updated.event_id ?? existing.event_id);
    return updated;
  });
};

const cancelTimeslot = async (timeslotId, actor) => {
  if (!timeslotId) fail(400, 'Timeslot ID is required.');
  const existing = await timeslotRepo.findById(timeslotId);
  if (!existing) fail(404, 'Timeslot not found.');
  if (existing.status === 'CANCELLED') fail(409, 'Timeslot is already cancelled.');
  return withTransaction(async (client) => {
    const updated = await timeslotRepo.updateTimeslot(timeslotId, { status: 'CANCELLED' }, client);
    await logAudit(client, { entityType: 'event_timeslot', entityId: timeslotId, action: 'CANCEL', actorId: actor ? Number(actor.id) : null, before: existing, after: updated });
    await getSyncService().queueSync('event_booking', existing.event_id, client);
    return updated;
  }).then(async (updated) => {
    await triggerPostCommitSync('event_booking', updated.event_id ?? existing.event_id);
    return updated;
  });
};

const getCapacitySummary = async (timeslotId) => {
  if (!timeslotId) fail(400, 'Timeslot ID is required.');
  const timeslot = await timeslotRepo.findById(timeslotId);
  if (!timeslot) fail(404, 'Timeslot not found.');
  const booked = await bookingRepo.countConfirmedByTimeslot(timeslotId);
  const remaining = timeslot.capacity - booked;
  return { timeslotId, capacity: timeslot.capacity, booked, remaining, isFull: remaining <= 0 };
};

export default {
  bookEventSpaceAndTimeslots,
  updateEventBooking,
  getEventBooking,
  getTimeslotsForEvent,
  closeTimeslot,
  cancelTimeslot,
  getCapacitySummary,
  setSyncService,
};


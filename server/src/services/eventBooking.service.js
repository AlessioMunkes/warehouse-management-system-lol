// server/src/services/eventBooking.service.js
import eventRepo from '../repositories/loveActivismEvent.repository.js';
import spaceRepo from '../repositories/eventSpace.repository.js';
import timeslotRepo from '../repositories/eventTimeslot.repository.js';
import bookingRepo from '../repositories/volunteerBooking.repository.js';
import { logAudit } from '../repositories/auditLog.repository.js';
import { withTransaction } from '../utils/transaction.js';
import { isValidDateString } from '../utils/validation.js';
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

const datePart = (value) => String(value ?? '').slice(0, 10);

const parseTimestamp = (value, label) => {
  if (!value) fail(400, label + ' is required.');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) fail(400, label + ' must be a valid timestamp.');
  return parsed;
};

const ensureSameEventDate = (eventDate, start, end) => {
  if (start.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10)) {
    fail(400, 'Timeslot startTime and endTime must belong to the same date.');
  }
};

const validateTimeslotWindow = ({ eventDate, startTime, endTime, prefix = 'Timeslot' }) => {
  const start = parseTimestamp(startTime, prefix + ': startTime');
  const end = parseTimestamp(endTime, prefix + ': endTime');
  if (end <= start) fail(400, prefix + ': endTime must be after startTime.');
  ensureSameEventDate(eventDate, start, end);
  return { start: start.toISOString(), end: end.toISOString() };
};

const validateCapacity = (capacityValue, prefix = 'Timeslot') => {
  const capacity = Number(capacityValue);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    fail(400, prefix + ': capacity must be a positive integer.');
  }
  return capacity;
};

const validateInitialEventData = (data, actor) => {
  const { eventName, description, eventDate, venueName, address } = data || {};
  if (!eventName || !String(eventName).trim()) fail(400, 'Event name is required.');
  if (String(eventName).trim().length > 200) fail(400, 'Event name must be 200 characters or fewer.');
  if (!description || !String(description).trim()) fail(400, 'Description is required.');
  if (!eventDate || !isValidDateString(eventDate)) fail(400, 'A valid event date is required (YYYY-MM-DD).');
  if (!venueName || !String(venueName).trim()) fail(400, 'Venue is required.');
  if (!address || !String(address).trim()) fail(400, 'Address is required.');
  if (!actor || !actor.id) fail(400, 'An actor is required to create an event.');
  return {
    eventName: String(eventName).trim(),
    description: String(description).trim(),
    eventDate,
    venueName: String(venueName).trim(),
    address: String(address).trim(),
    status: 'DRAFT',
    createdBy: Number(actor.id),
  };
};

const loadActiveSpace = async (spaceId) => {
  if (!spaceId) fail(400, 'Space ID is required.');
  const space = await spaceRepo.findById(spaceId);
  if (!space) fail(404, 'Event space not found.');
  if (!space.is_active) fail(409, 'Cannot book an inactive event space.');
  return space;
};

const loadActiveSpaceForClient = async (spaceId, client) => {
  if (!spaceId) fail(400, 'Space ID is required.');
  const space = await spaceRepo.findById(spaceId, client);
  if (!space) fail(404, 'Event space not found.');
  if (!space.is_active) fail(409, 'Cannot book an inactive event space.');
  return space;
};

const validateNewSpaceData = (space = {}) => {
  const spaceName = String(space.spaceName ?? '').trim();
  const location = String(space.location ?? '').trim();
  if (!spaceName) fail(400, 'Space name is required.');
  if (spaceName.length > 200 || location.length > 255) {
    fail(400, 'Space name or location is too long.');
  }
  return { spaceName, location: location || null };
};

const normalizeSpaceRequest = (data = {}) => {
  if (data.space && typeof data.space === 'object') {
    const mode = data.space.mode ?? (data.space.spaceId ? 'existing' : 'new');
    if (mode === 'existing') return { mode, spaceId: data.space.spaceId };
    if (mode === 'new') return { mode, ...validateNewSpaceData(data.space) };
    fail(400, 'space.mode must be existing or new.');
  }
  return { mode: 'existing', spaceId: data.spaceId };
};

const normalizeTimeslots = (data = {}, eventDate, { requireCapacity = true } = {}) => {
  const rawTimeslots = Array.isArray(data.timeslots) && data.timeslots.length > 0
    ? data.timeslots
    : [{ startTime: data.startTime, endTime: data.endTime, capacity: data.capacity }];
  if (!Array.isArray(rawTimeslots) || rawTimeslots.length === 0) fail(400, 'At least one timeslot is required.');
  return rawTimeslots.map((slot, index) => {
    const prefix = 'Timeslot ' + (index + 1);
    const window = validateTimeslotWindow({
      eventDate,
      startTime: slot?.startTime,
      endTime: slot?.endTime,
      prefix,
    });
    return {
      ...window,
      capacity: requireCapacity ? validateCapacity(slot?.capacity, prefix) : slot?.capacity,
      index,
    };
  });
};

const findSubmittedTimeslotConflicts = (timeslots) => {
  const conflicts = [];
  for (let i = 0; i < timeslots.length; i += 1) {
    for (let j = i + 1; j < timeslots.length; j += 1) {
      if (timeslots[i].start < timeslots[j].end && timeslots[i].end > timeslots[j].start) {
        conflicts.push({
          type: 'FORM_OVERLAP',
          index: j,
          message: 'Timeslot ' + (j + 1) + ' overlaps another proposed timeslot.',
        });
      }
    }
  }
  return conflicts;
};

const findAvailabilityConflicts = async ({ spaceId, start, end, excludeTimeslotId = null, client = undefined }) => {
  const overlaps = await timeslotRepo.findPotentialOverlaps(null, spaceId, start, end, excludeTimeslotId, client);
  if (overlaps.length === 0) return [];
  return [{
    type: 'TIMESLOT_OVERLAP',
    message: 'The selected space is already booked during this time.',
  }];
};

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
  if (!Array.isArray(timeslots) || timeslots.length === 0) fail(400, 'At least one timeslot is required.');
  const event = await eventRepo.findById(eventId);
  if (!event) fail(404, 'Event not found.');
  await loadActiveSpace(spaceId);
  const validated = timeslots.map((slot, index) => {
    const prefix = 'Timeslot ' + (index + 1);
    const window = validateTimeslotWindow({ eventDate: event.event_date, startTime: slot.startTime, endTime: slot.endTime, prefix });
    return { ...window, capacity: validateCapacity(slot.capacity, prefix) };
  });
  if (findSubmittedTimeslotConflicts(validated).length > 0) fail(409, 'One or more submitted timeslots overlap.');
  return withTransaction(async (client) => {
    const created = [];
    for (const slot of validated) {
      const conflicts = await findAvailabilityConflicts({ spaceId, start: slot.start, end: slot.end, client });
      if (conflicts.length > 0) fail(409, 'One or more timeslots overlap an existing booking.');
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
  const nextWindow = validateTimeslotWindow({
    eventDate: event.event_date,
    startTime: changes.startTime ?? existing.start_time,
    endTime: changes.endTime ?? existing.end_time,
    prefix: 'Timeslot',
  });
  const nextStart = nextWindow.start;
  const nextEnd = nextWindow.end;
  if (changes.capacity !== undefined) {
    validateCapacity(changes.capacity, 'Timeslot');
  }
  const nextCapacity = changes.capacity !== undefined ? Number(changes.capacity) : existing.capacity;
  return withTransaction(async (client) => {
    const conflicts = await findAvailabilityConflicts({ spaceId: existing.space_id, start: nextStart, end: nextEnd, excludeTimeslotId: timeslotId, client });
    if (conflicts.length > 0) fail(409, 'Updated timeslot overlaps an existing booking.');
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

const createEventWithInitialTimeslot = async (data, actor) => {
  const eventData = validateInitialEventData(data, actor);
  const spaceRequest = normalizeSpaceRequest(data);
  const slotData = normalizeTimeslots(data, eventData.eventDate);
  const formConflicts = findSubmittedTimeslotConflicts(slotData);
  if (formConflicts.length > 0) fail(409, 'One or more submitted timeslots overlap.');

  return withTransaction(async (client) => {
    let spaceId = spaceRequest.spaceId;
    if (spaceRequest.mode === 'new') {
      const existing = await spaceRepo.findByName(spaceRequest.spaceName, client);
      if (existing) fail(409, 'An event space with this name already exists.');
      const space = await spaceRepo.createSpace({
        spaceName: spaceRequest.spaceName,
        location: spaceRequest.location,
        description: null,
        is_active: true,
      }, client);
      spaceId = space.space_id;
    } else {
      await loadActiveSpaceForClient(spaceId, client);
    }

    const event = await eventRepo.createEvent(eventData, client);
    await logAudit(client, {
      entityType: 'love_activism_event',
      entityId: event.event_id,
      action: 'CREATE',
      actorId: eventData.createdBy,
      after: event,
    });

    const timeslots = [];
    for (const slot of slotData) {
      const conflicts = await findAvailabilityConflicts({
        spaceId,
        start: slot.start,
        end: slot.end,
        client,
      });
      if (conflicts.length > 0) fail(409, 'One or more timeslots overlap an existing booking.');

      const timeslot = await timeslotRepo.createTimeslot(
        {
          eventId: event.event_id,
          spaceId,
          startTime: slot.start,
          endTime: slot.end,
          capacity: slot.capacity,
          status: 'OPEN',
        },
        client
      );
      timeslots.push(timeslot);
    }
    await logAudit(client, {
      entityType: 'event_timeslot',
      entityId: event.event_id,
      action: 'BOOK_SPACE',
      actorId: eventData.createdBy,
      after: { eventId: event.event_id, spaceId, timeslots },
    });
    await getSyncService().queueSync('event_booking', event.event_id, client);
    return { event, timeslots };
  }).then(async (result) => {
    await triggerPostCommitSync('event_booking', result.event.event_id);
    return result;
  });
};

const validateTimeslotAvailability = async (data = {}) => {
  const { eventDate, spaceId, excludeTimeslotId = null } = data;
  if (!eventDate) fail(400, 'eventDate is required.');
  const eventDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  const parsedEventDate = new Date(`${eventDate}T00:00:00.000Z`);
  if (
    !eventDatePattern.test(String(eventDate))
    || Number.isNaN(parsedEventDate.getTime())
    || parsedEventDate.toISOString().slice(0, 10) !== eventDate
  ) {
    fail(400, 'eventDate must be a valid date (YYYY-MM-DD).');
  }
  // spaceId is absent when the space is being created (mode=new). In that case
  // the space doesn't exist yet, so no overlap check is possible or required.
  if (spaceId) {
    await loadActiveSpace(spaceId);
  }
  const multi = Array.isArray(data.timeslots);
  const timeslots = normalizeTimeslots(data, eventDate, { requireCapacity: false });
  const conflicts = findSubmittedTimeslotConflicts(timeslots);
  if (spaceId) {
    for (const slot of timeslots) {
      const dbConflicts = await findAvailabilityConflicts({ spaceId, start: slot.start, end: slot.end, excludeTimeslotId });
      conflicts.push(...dbConflicts.map((conflict) => (multi ? { ...conflict, index: slot.index } : conflict)));
    }
  }
  return { available: conflicts.length === 0, conflicts };
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
  createEventWithInitialTimeslot,
  updateEventBooking,
  getEventBooking,
  getTimeslotsForEvent,
  validateTimeslotAvailability,
  closeTimeslot,
  cancelTimeslot,
  getCapacitySummary,
  setSyncService,
};


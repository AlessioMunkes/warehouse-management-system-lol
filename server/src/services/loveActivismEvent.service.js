// server/src/services/loveActivismEvent.service.js
import eventRepo from '../repositories/loveActivismEvent.repository.js';
import { logAudit } from '../repositories/auditLog.repository.js';
import { withTransaction } from '../utils/transaction.js';
import { isValidDateString } from '../utils/validation.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

export const EVENT_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'COMPLETED', 'CANCELLED'];
const MUTABLE_FIELDS = ['eventName', 'description', 'eventDate', 'venueName', 'address'];

const createEvent = async (data, actor) => {
  const { eventName, description, eventDate, venueName, address, status } = data || {};
  if (!eventName || !String(eventName).trim()) fail(400, 'Event name is required.');
  if (String(eventName).trim().length > 200) fail(400, 'Event name must be 200 characters or fewer.');
  if (!eventDate || !isValidDateString(eventDate)) fail(400, 'A valid event date is required (YYYY-MM-DD).');
  if (status !== undefined && status !== null && !EVENT_STATUSES.includes(status)) fail(400, 'Status must be one of: ' + EVENT_STATUSES.join(', ') + '.');
  if (!actor || !actor.id) fail(400, 'An actor is required to create an event.');

  const createdBy = Number(actor.id);
  const initialStatus = status || 'DRAFT';

  return withTransaction(async (client) => {
    const event = await eventRepo.createEvent(
      { eventName: String(eventName).trim(), description: description ?? null, eventDate, venueName: venueName?.trim() || null, address: address?.trim() || null, status: initialStatus, createdBy },
      client
    );
    await logAudit(client, {
      entityType: 'love_activism_event', entityId: event.event_id,
      action: 'CREATE', actorId: createdBy, after: event,
    });
    return event;
  });
};

const getEvent = async (eventId) => {
  if (!eventId) fail(400, 'Event ID is required.');
  const event = await eventRepo.findById(eventId);
  if (!event) fail(404, 'Event not found.');
  return event;
};

const listEvents = async (filters = {}) => {
  if (filters.status && !EVENT_STATUSES.includes(filters.status)) fail(400, 'Status filter must be one of: ' + EVENT_STATUSES.join(', ') + '.');
  if (filters.eventDate && !isValidDateString(filters.eventDate)) fail(400, 'eventDate filter must be a valid date (YYYY-MM-DD).');
  return eventRepo.findAll(filters);
};

const updateEvent = async (eventId, changes, actor) => {
  if (!eventId) fail(400, 'Event ID is required.');
  if (!changes || typeof changes !== 'object') fail(400, 'Changes are required.');
  const existing = await eventRepo.findById(eventId);
  if (!existing) fail(404, 'Event not found.');

  const mutable = {};
  for (const key of MUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) mutable[key] = changes[key];
  }
  if (mutable.eventDate !== undefined && !isValidDateString(mutable.eventDate)) fail(400, 'eventDate must be a valid date (YYYY-MM-DD).');
  if (mutable.eventName !== undefined) {
    const trimmed = String(mutable.eventName).trim();
    if (!trimmed) fail(400, 'Event name cannot be blank.');
    if (trimmed.length > 200) fail(400, 'Event name must be 200 characters or fewer.');
    mutable.eventName = trimmed;
  }
  if (Object.keys(mutable).length === 0) return existing;

  return withTransaction(async (client) => {
    const updated = await eventRepo.updateEvent(eventId, mutable, client);
    await logAudit(client, { entityType: 'love_activism_event', entityId: eventId, action: 'UPDATE', actorId: actor ? Number(actor.id) : null, before: existing, after: updated });
    return updated;
  });
};

const cancelEvent = async (eventId, actor) => {
  if (!eventId) fail(400, 'Event ID is required.');
  const existing = await eventRepo.findById(eventId);
  if (!existing) fail(404, 'Event not found.');
  if (existing.status === 'CANCELLED') fail(409, 'Event is already cancelled.');
  if (existing.status === 'COMPLETED') fail(409, 'A completed event cannot be cancelled.');

  return withTransaction(async (client) => {
    const updated = await eventRepo.updateEvent(eventId, { status: 'CANCELLED' }, client);
    await logAudit(client, { entityType: 'love_activism_event', entityId: eventId, action: 'CANCEL', actorId: actor ? Number(actor.id) : null, before: existing, after: updated });
    return updated;
  });
};

const completeEvent = async (eventId, actor) => {
  if (!eventId) fail(400, 'Event ID is required.');
  const existing = await eventRepo.findById(eventId);
  if (!existing) fail(404, 'Event not found.');
  if (existing.status === 'COMPLETED') fail(409, 'Event is already completed.');
  if (existing.status === 'CANCELLED') fail(409, 'A cancelled event cannot be completed.');

  return withTransaction(async (client) => {
    const updated = await eventRepo.updateEvent(eventId, { status: 'COMPLETED' }, client);
    await logAudit(client, { entityType: 'love_activism_event', entityId: eventId, action: 'COMPLETE', actorId: actor ? Number(actor.id) : null, before: existing, after: updated });
    return updated;
  });
};

export default { createEvent, getEvent, listEvents, updateEvent, cancelEvent, completeEvent };
export { MUTABLE_FIELDS };

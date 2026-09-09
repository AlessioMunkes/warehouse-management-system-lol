import { apiGet, apiPatch, apiPost, apiPut } from './api';

const BASE = '/api/love-activism';

export const EVENT_STATUS_LABELS = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const toVolunteerEvent = (row = {}) => ({
  id: row.event_id,
  name: row.event_name ?? '',
  description: row.description ?? '',
  eventDate: row.event_date ?? '',
  venueName: row.venue_name ?? '',
  address: row.address ?? '',
  status: row.status,
  statusLabel: EVENT_STATUS_LABELS[row.status] ?? row.status,
  createdBy: row.created_by,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
});

const unwrap = (body) => toVolunteerEvent(body.data ?? {});

export const toTimeslot = (row = {}) => ({
  id: row.timeslot_id,
  eventId: row.event_id,
  spaceId: row.space_id,
  startTime: row.start_time ?? '',
  endTime: row.end_time ?? '',
  capacity: Number(row.capacity ?? 0),
  status: row.status,
});

export const toBooking = (row = {}) => ({
  id: row.booking_id,
  timeslotId: row.timeslot_id,
  firstName: row.volunteer_first_name ?? '',
  lastName: row.volunteer_last_name ?? '',
  source: row.booking_source,
  status: row.booking_status,
  bookedAt: row.booked_at ?? null,
});

export const toAttendance = (row = {}) => ({
  id: row.attendance_id,
  bookingId: row.booking_id,
  checkedIn: Boolean(row.checked_in),
  checkInTime: row.check_in_time ?? null,
  source: row.source,
});

export const toSync = (row = {}) => ({
  id: row.sync_id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  externalId: row.external_id ?? null,
  status: row.sync_status,
  lastAttemptAt: row.last_attempt_at ?? null,
  lastSuccessAt: row.last_success_at ?? null,
  errorMessage: row.error_message ?? '',
});

export const toEventSpace = (row = {}) => ({
  id: row.space_id,
  name: row.space_name ?? '',
  description: row.description ?? '',
  location: row.location ?? '',
  isActive: Boolean(row.is_active),
});

export const getEvents = async ({ status = '', eventDate = '' } = {}) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (eventDate) params.set('eventDate', eventDate);
  const query = params.toString();
  const body = await apiGet(`${BASE}/events${query ? `?${query}` : ''}`);
  return (body.data ?? []).map(toVolunteerEvent);
};

export const getEvent = async (eventId) => unwrap(
  await apiGet(`${BASE}/events/${eventId}`)
);

export const createEvent = async (payload) => unwrap(
  await apiPost(`${BASE}/events`, payload)
);

export const updateEvent = async (eventId, payload) => unwrap(
  await apiPatch(`${BASE}/events/${eventId}`, payload)
);

export const cancelEvent = async (eventId) => unwrap(
  await apiPatch(`${BASE}/events/${eventId}/cancel`)
);

export const completeEvent = async (eventId) => unwrap(
  await apiPatch(`${BASE}/events/${eventId}/complete`)
);

export const getSpaces = async () => {
  const body = await apiGet(`${BASE}/spaces`);
  return (body.data ?? []).map(toEventSpace);
};

export const createSpace = async (payload) => toEventSpace(
  (await apiPost(`${BASE}/spaces`, payload)).data ?? {}
);

export const getEventBooking = async (eventId) => {
  const body = await apiGet(`${BASE}/events/${eventId}/booking`);
  return {
    event: toVolunteerEvent(body.data?.event ?? {}),
    timeslots: (body.data?.timeslots ?? []).map(toTimeslot),
  };
};

export const createEventBooking = async (eventId, payload) => {
  const body = await apiPost(`${BASE}/events/${eventId}/booking`, payload);
  return (body.data ?? []).map(toTimeslot);
};

export const updateTimeslot = async (eventId, timeslotId, changes) => {
  const body = await apiPatch(`${BASE}/events/${eventId}/booking`, { timeslotId, ...changes });
  return toTimeslot(body.data ?? {});
};

export const closeTimeslot = async (timeslotId) => toTimeslot(
  (await apiPatch(`${BASE}/timeslots/${timeslotId}/close`)).data ?? {}
);

export const cancelTimeslot = async (timeslotId) => toTimeslot(
  (await apiPatch(`${BASE}/timeslots/${timeslotId}/cancel`)).data ?? {}
);

export const getCapacity = async (timeslotId) => {
  const body = await apiGet(`${BASE}/timeslots/${timeslotId}/capacity`);
  const row = body.data ?? {};
  return {
    timeslotId: row.timeslotId,
    capacity: Number(row.capacity ?? 0),
    booked: Number(row.booked ?? 0),
    remaining: Number(row.remaining ?? 0),
    isFull: Boolean(row.isFull),
  };
};

export const getEventBookings = async (eventId) => {
  const body = await apiGet(`${BASE}/events/${eventId}/bookings`);
  return (body.data ?? []).map(toBooking);
};

export const getTimeslotBookings = async (timeslotId) => {
  const body = await apiGet(`${BASE}/timeslots/${timeslotId}/bookings`);
  return (body.data ?? []).map(toBooking);
};

export const createWalkIn = async (timeslotId, payload) => toBooking(
  (await apiPost(`${BASE}/timeslots/${timeslotId}/guests`, payload)).data ?? {}
);

export const confirmAttendance = async (bookingId, checkedIn) => toAttendance(
  (await apiPut(`${BASE}/bookings/${bookingId}/attendance`, { checkedIn })).data ?? {}
);

export const getEventAttendance = async (eventId) => {
  const body = await apiGet(`${BASE}/events/${eventId}/attendance`);
  return (body.data ?? []).map(toAttendance);
};

export const getAttendanceSummary = async (timeslotId) => {
  const row = (await apiGet(`${BASE}/timeslots/${timeslotId}/attendance/summary`)).data ?? {};
  return { timeslotId: row.timeslotId, booked: Number(row.booked ?? 0), attended: Number(row.attended ?? 0), noShow: Number(row.noShow ?? 0) };
};

export const getSyncStatus = async (eventId) => {
  try {
    return toSync((await apiGet(`${BASE}/sync/event_booking/${eventId}`)).data ?? {});
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
};

export const retrySync = async (eventId) => toSync(
  (await apiPost(`${BASE}/sync/event_booking/${eventId}/retry`, {})).data ?? {}
);

export default {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  cancelEvent,
  completeEvent,
  getSpaces,
  createSpace,
  getEventBooking,
  createEventBooking,
  updateTimeslot,
  closeTimeslot,
  cancelTimeslot,
  getCapacity,
  getEventBookings,
  getTimeslotBookings,
  createWalkIn,
  confirmAttendance,
  getEventAttendance,
  getAttendanceSummary,
  getSyncStatus,
  retrySync,
};

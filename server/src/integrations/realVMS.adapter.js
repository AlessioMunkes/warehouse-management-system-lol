// server/src/integrations/realVMS.adapter.js
//
// HTTP adapter skeleton for the external Volunteer Management System.
// Not wired into business flows yet.
import { requireVmsConfig } from '../config/vms.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const EVENT_CATEGORY = 'warehouse';
const ATTENDANCE_STATUSES = ['attended', 'not_attended', 'unknown'];

const joinUrl = (baseUrl, path) => `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

const vmsError = (message, extras = {}) => {
  const err = new Error(message);
  Object.assign(err, extras);
  return err;
};

const parseJsonResponse = async (response, path) => {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw vmsError(`VMS returned invalid JSON for ${path}.`, {
      code: 'VMS_INVALID_JSON',
      status: response.status,
    });
  }
};

const createTimeoutSignal = (timeoutMs) => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
};

const request = async (path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) => {
  const { baseUrl, apiToken } = requireVmsConfig();

  if (typeof fetchImpl !== 'function') {
    throw vmsError('VMS fetch implementation is not available.', { code: 'VMS_FETCH_UNAVAILABLE' });
  }

  let response;
  try {
    response = await fetchImpl(joinUrl(baseUrl, path), {
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: createTimeoutSignal(timeoutMs),
    });
  } catch (err) {
    throw vmsError('VMS request failed before a response was received.', {
      code: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'VMS_TIMEOUT' : 'VMS_NETWORK_ERROR',
    });
  }

  const data = await parseJsonResponse(response, path);

  if (response.status === 401 || response.status === 403) {
    throw vmsError('VMS authentication failed.', {
      code: 'VMS_AUTH_ERROR',
      status: response.status,
      body: data,
    });
  }

  if (!response.ok) {
    throw vmsError(`VMS request failed with status ${response.status}.`, {
      code: 'VMS_HTTP_ERROR',
      status: response.status,
      body: data,
    });
  }

  return data;
};

const firstValue = (source, keys) => {
  for (const key of keys) {
    if (source?.[key] !== undefined) return source[key];
  }
  return undefined;
};

const dateOnly = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined) return value;
  return String(value).slice(0, 10);
};

const timeOnly = (value) => {
  if (value === null || value === undefined) return value;
  const text = String(value);
  return text.length >= 5 ? text.slice(0, 5) : text;
};

const nullableString = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};

const optionalString = (value) => {
  if (value === undefined || value === null) return value;
  return String(value);
};

const normalizeEventStatus = (status) => {
  const normalized = String(status || 'scheduled').trim().toLowerCase();
  if (normalized === 'published') return 'scheduled';
  return normalized || 'scheduled';
};

export const mapEventPayload = (event = {}) => {
  const externalEventId = firstValue(event, ['externalEventId', 'external_event_id', 'eventId', 'event_id', 'id']);
  const timeslots = firstValue(event, ['timeslots', 'timeSlots', 'event_timeslots']) || [];

  return {
    externalEventId: optionalString(externalEventId),
    title: firstValue(event, ['title', 'eventName', 'event_name', 'name']),
    eventDate: dateOnly(firstValue(event, ['eventDate', 'event_date', 'date'])),
    locationName: nullableString(firstValue(event, ['locationName', 'venueName', 'venue_name', 'spaceName', 'space_name', 'location'])),
    status: normalizeEventStatus(firstValue(event, ['status'])),
    description: nullableString(firstValue(event, ['description'])),
    category: firstValue(event, ['category']) || EVENT_CATEGORY,
    locationUrl: nullableString(firstValue(event, ['locationUrl', 'location_url'])),
    timeslots: timeslots.map((timeslot) => ({
      externalTimeslotId: optionalString(firstValue(timeslot, ['externalTimeslotId', 'external_timeslot_id', 'timeslotId', 'timeslot_id', 'id'])),
      startTime: timeOnly(firstValue(timeslot, ['startTime', 'start_time'])),
      endTime: timeOnly(firstValue(timeslot, ['endTime', 'end_time'])),
      capacity: firstValue(timeslot, ['capacity']),
    })),
  };
};

const assertExternalId = (value, label) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw vmsError(`${label} is required for VMS request.`, { code: 'VMS_INVALID_PAYLOAD', status: 400 });
  }
};

const assertPositiveInteger = (value, label) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw vmsError(`${label} must be a positive integer.`, { code: 'VMS_INVALID_PAYLOAD', status: 400 });
  }
};

const invalidResponse = (message) => vmsError(message, { code: 'VMS_INVALID_RESPONSE', status: 502 });

const assertObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidResponse(`${label} must be an object.`);
  }
};

const assertArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw invalidResponse(`${label} must be an array.`);
  }
};

const assertPresent = (value, label) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw invalidResponse(`${label} is required.`);
  }
};

const splitVolunteerName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
};

export const parseEventBookingsResponse = (data) => {
  assertObject(data, 'VMS booking response');
  assertPresent(data.externalEventId, 'externalEventId');
  assertArray(data.timeslots, 'timeslots');
  assertArray(data.bookings, 'bookings');
  for (const key of ['bookingCount', 'capacityTotal']) {
    if (!Number.isInteger(data[key]) || data[key] < 0) {
      throw invalidResponse(`${key} must be a non-negative integer.`);
    }
  }

  const timeslots = data.timeslots.map((timeslot, index) => {
    assertObject(timeslot, `timeslots[${index}]`);
    assertPresent(timeslot.vmsTimeslotId, `timeslots[${index}].vmsTimeslotId`);
    assertPresent(timeslot.externalTimeslotId, `timeslots[${index}].externalTimeslotId`);

    for (const key of ['capacity', 'remaining', 'bookingCount']) {
      if (!Number.isInteger(timeslot[key]) || timeslot[key] < 0) {
        throw invalidResponse(`timeslots[${index}].${key} must be a non-negative integer.`);
      }
    }

    return {
      vmsTimeslotId: timeslot.vmsTimeslotId,
      externalTimeslotId: String(timeslot.externalTimeslotId),
      capacity: timeslot.capacity,
      remaining: timeslot.remaining,
      bookingCount: timeslot.bookingCount,
    };
  });

  const bookings = data.bookings.map((booking, index) => {
    assertObject(booking, `bookings[${index}]`);
    assertPresent(booking.vmsBookingId, `bookings[${index}].vmsBookingId`);
    assertPresent(booking.externalTimeslotId, `bookings[${index}].externalTimeslotId`);
    assertPresent(booking.status, `bookings[${index}].status`);
    assertObject(booking.volunteer, `bookings[${index}].volunteer`);
    assertPresent(booking.volunteer.vmsVolunteerId, `bookings[${index}].volunteer.vmsVolunteerId`);
    assertPresent(booking.volunteer.name, `bookings[${index}].volunteer.name`);

    const volunteerName = splitVolunteerName(booking.volunteer.name);

    return {
      externalBookingId: String(booking.vmsBookingId),
      externalVolunteerId: String(booking.volunteer.vmsVolunteerId),
      externalTimeslotId: String(booking.externalTimeslotId),
      bookingSource: 'VMS',
      bookingStatus: String(booking.status).trim().toUpperCase(),
      vmsStatus: booking.vmsStatus ?? null,
      volunteerFirstName: volunteerName.firstName,
      volunteerLastName: volunteerName.lastName,
      volunteer: {
        vmsVolunteerId: String(booking.volunteer.vmsVolunteerId),
        name: booking.volunteer.name,
        email: booking.volunteer.email ?? null,
        phone: booking.volunteer.phone ?? null,
      },
      raw: booking,
    };
  });

  return {
    externalEventId: String(data.externalEventId),
    bookingCount: data.bookingCount,
    capacityTotal: data.capacityTotal,
    timeslots,
    bookings,
    raw: data,
  };
};

const normalizeAttendanceStatus = (attendance) => {
  const hasExplicit = Object.prototype.hasOwnProperty.call(attendance, 'attendanceStatus')
    || Object.prototype.hasOwnProperty.call(attendance, 'attendance_status');
  if (hasExplicit) {
    const explicit = firstValue(attendance, ['attendanceStatus', 'attendance_status']);
    return String(explicit).trim();
  }

  const checkedIn = firstValue(attendance, ['checkedIn', 'checked_in']);
  if (checkedIn === true) return 'attended';
  if (checkedIn === false) return 'not_attended';
  return 'unknown';
};

const normalizeIsoTimestamp = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw vmsError('recordedAt must be an ISO timestamp.', { code: 'VMS_INVALID_PAYLOAD', status: 400 });
  }
  return value;
};

export const mapAttendancePayload = (attendance = {}) => {
  const booking = firstValue(attendance, ['booking']) || {};
  const vmsBookingId = firstValue(attendance, [
    'vmsBookingId',
    'vms_booking_id',
    'externalBookingId',
    'external_booking_id',
  ]) ?? firstValue(booking, ['vmsBookingId', 'vms_booking_id', 'externalBookingId', 'external_booking_id']);
  const attendanceStatus = normalizeAttendanceStatus(attendance);

  if (!ATTENDANCE_STATUSES.includes(attendanceStatus)) {
    throw vmsError('attendanceStatus must be one of: attended, not_attended, unknown.', {
      code: 'VMS_INVALID_PAYLOAD',
      status: 400,
    });
  }

  assertExternalId(vmsBookingId, 'vmsBookingId');

  const recordedAt = normalizeIsoTimestamp(firstValue(attendance, [
    'recordedAt',
    'recorded_at',
    'checkInTime',
    'check_in_time',
    'updated_at',
    'created_at',
  ]));

  return {
    vmsBookingId,
    attendanceStatus,
    source: 'wms',
    recordedAt,
  };
};

export const createRealVMSAdapter = ({ fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => ({
  healthCheck: () => request('/health', { fetchImpl, timeoutMs }),
  publishEvent: (event) => {
    const payload = mapEventPayload(event);
    assertExternalId(payload.externalEventId, 'externalEventId');
    return request(`/api/integrations/wms/v1/events/${encodeURIComponent(payload.externalEventId)}`, {
      method: 'PUT',
      body: payload,
      fetchImpl,
      timeoutMs,
    });
  },
  getEventBookings: async (externalEventId) => {
    assertExternalId(externalEventId, 'externalEventId');
    const data = await request(`/api/integrations/wms/v1/events/${encodeURIComponent(externalEventId)}/bookings`, {
      fetchImpl,
      timeoutMs,
    });
    return parseEventBookingsResponse(data);
  },
  updateTimeslotCapacity: (externalTimeslotId, capacity) => {
    assertExternalId(externalTimeslotId, 'externalTimeslotId');
    assertPositiveInteger(capacity, 'capacity');
    return request(`/api/integrations/wms/v1/timeslots/${encodeURIComponent(externalTimeslotId)}/capacity`, {
      method: 'PATCH',
      body: { capacity },
      fetchImpl,
      timeoutMs,
    });
  },
  sendAttendance: (attendance) => request('/api/integrations/wms/v1/attendance', {
    method: 'POST',
    body: mapAttendancePayload(attendance),
    fetchImpl,
    timeoutMs,
  }),
});

const realVMSAdapter = createRealVMSAdapter();

export default realVMSAdapter;

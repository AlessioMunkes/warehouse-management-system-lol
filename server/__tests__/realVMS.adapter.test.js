import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRealVMSAdapter } from '../src/integrations/realVMS.adapter.js';

const original = {
  VMS_BASE_URL: process.env.VMS_BASE_URL,
  VMS_API_TOKEN: process.env.VMS_API_TOKEN,
};

const jsonResponse = (body, init = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  text: vi.fn(async () => JSON.stringify(body)),
});

const bookingResponse = (overrides = {}) => ({
  externalEventId: 'wms-event-123',
  bookingCount: 1,
  capacityTotal: 20,
  timeslots: [
    {
      vmsTimeslotId: 456,
      externalTimeslotId: 'wms-slot-456',
      capacity: 20,
      remaining: 19,
      bookingCount: 1,
    },
  ],
  bookings: [
    {
      vmsBookingId: 789,
      externalTimeslotId: 'wms-slot-456',
      status: 'CONFIRMED',
      vmsStatus: 'Confirmed',
      volunteer: {
        vmsVolunteerId: 'supabase-user-uuid',
        name: 'Volunteer Name',
        email: 'volunteer@example.com',
        phone: '+27821234567',
      },
    },
  ],
  ...overrides,
});

beforeEach(() => {
  process.env.VMS_BASE_URL = 'https://vms.example.test';
  process.env.VMS_API_TOKEN = 'secret-token';
});

afterEach(() => {
  vi.restoreAllMocks();

  if (original.VMS_BASE_URL === undefined) delete process.env.VMS_BASE_URL;
  else process.env.VMS_BASE_URL = original.VMS_BASE_URL;

  if (original.VMS_API_TOKEN === undefined) delete process.env.VMS_API_TOKEN;
  else process.env.VMS_API_TOKEN = original.VMS_API_TOKEN;
});

describe('RealVMSAdapter requests', () => {
  it('sends required auth and JSON headers on every request method', async () => {
    const fetchImpl = vi.fn(async (url) => jsonResponse(url.includes('/bookings') ? bookingResponse() : { ok: true }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await adapter.healthCheck();
    await adapter.publishEvent({ event_id: 'event-1', event_name: 'Pack day', timeslots: [] });
    await adapter.getEventBookings('event 1');
    await adapter.updateTimeslotCapacity('slot 1', 20);
    await adapter.sendAttendance({
      externalBookingId: 'booking-1',
      checkedIn: true,
      checkInTime: '2026-10-01T10:30:00+02:00',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    for (const call of fetchImpl.mock.calls) {
      expect(call[1].headers).toEqual({
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json',
      });
    }

    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ['https://vms.example.test/health', 'GET'],
      ['https://vms.example.test/api/integrations/wms/v1/events/event-1', 'PUT'],
      ['https://vms.example.test/api/integrations/wms/v1/events/event%201/bookings', 'GET'],
      ['https://vms.example.test/api/integrations/wms/v1/timeslots/slot%201/capacity', 'PATCH'],
      ['https://vms.example.test/api/integrations/wms/v1/attendance', 'POST'],
    ]);
    expect(fetchImpl.mock.calls[3][1].body).toBe(JSON.stringify({ capacity: 20 }));
  });

  it('publishes an event to the exact VMS event endpoint with mapped WMS fields', async () => {
    process.env.VMS_BASE_URL = 'https://vms.example.test';
    const fetchImpl = vi.fn(async () => jsonResponse({ accepted: true }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await adapter.publishEvent({
      event_id: 'wms-event-123',
      event_name: 'Warehouse packing',
      event_date: '2026-10-01',
      venue_name: 'Warehouse HQ',
      status: 'SCHEDULED',
      description: 'Packing session',
      timeslots: [
        {
          timeslot_id: 'wms-slot-456',
          start_time: '08:00:00',
          end_time: '10:00:00',
          capacity: 20,
        },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://vms.example.test/api/integrations/wms/v1/events/wms-event-123',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          externalEventId: 'wms-event-123',
          title: 'Warehouse packing',
          eventDate: '2026-10-01',
          locationName: 'Warehouse HQ',
          status: 'scheduled',
          description: 'Packing session',
          category: 'warehouse',
          locationUrl: null,
          timeslots: [
            {
              externalTimeslotId: 'wms-slot-456',
              startTime: '08:00',
              endTime: '10:00',
              capacity: 20,
            },
          ],
        }),
      })
    );
  });

  it('maps existing WMS IDs across multiple timeslots', async () => {
    process.env.VMS_BASE_URL = 'https://vms.example.test';
    const fetchImpl = vi.fn(async () => jsonResponse({ accepted: true }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await adapter.publishEvent({
      eventId: 123,
      eventName: 'Warehouse packing',
      eventDate: new Date('2026-10-01T12:00:00.000Z'),
      venueName: 'Warehouse HQ',
      status: 'PUBLISHED',
      description: 'Packing session',
      timeslots: [
        { timeslotId: 456, startTime: '08:00', endTime: '10:00', capacity: 20 },
        { timeslot_id: 'slot-789', start_time: '10:30:00', end_time: '12:00:00', capacity: 15 },
      ],
    });

    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://vms.example.test/api/integrations/wms/v1/events/123');
    expect(payload.externalEventId).toBe('123');
    expect(payload.status).toBe('scheduled');
    expect(payload.timeslots).toEqual([
      { externalTimeslotId: '456', startTime: '08:00', endTime: '10:00', capacity: 20 },
      { externalTimeslotId: 'slot-789', startTime: '10:30', endTime: '12:00', capacity: 15 },
    ]);
  });

  it('maps optional empty fields to nulls', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ accepted: true }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await adapter.publishEvent({
      event_id: 'event-optional',
      event_name: 'Warehouse packing',
      event_date: '2026-10-01',
      venue_name: '',
      description: '',
      location_url: '',
      timeslots: [],
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      locationName: null,
      description: null,
      locationUrl: null,
    });
  });

  it('sends capacity updates to the exact VMS capacity endpoint and payload', async () => {
    process.env.VMS_BASE_URL = 'https://vms.example.test';
    const fetchImpl = vi.fn(async () => jsonResponse({ accepted: true }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await adapter.updateTimeslotCapacity('wms-slot-456', 25);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://vms.example.test/api/integrations/wms/v1/timeslots/wms-slot-456/capacity',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ capacity: 25 }),
      })
    );
  });

  it('fetches bookings from the exact VMS booking endpoint and parses a valid response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(bookingResponse()));
    const adapter = createRealVMSAdapter({ fetchImpl });

    const result = await adapter.getEventBookings('wms-event-123');

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://vms.example.test/api/integrations/wms/v1/events/wms-event-123/bookings',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toMatchObject({
      externalEventId: 'wms-event-123',
      bookingCount: 1,
      capacityTotal: 20,
      timeslots: [
        {
          vmsTimeslotId: 456,
          externalTimeslotId: 'wms-slot-456',
          capacity: 20,
          remaining: 19,
          bookingCount: 1,
        },
      ],
      bookings: [
        {
          externalBookingId: '789',
          externalVolunteerId: 'supabase-user-uuid',
          externalTimeslotId: 'wms-slot-456',
          bookingSource: 'VMS',
          bookingStatus: 'CONFIRMED',
          vmsStatus: 'Confirmed',
          volunteerFirstName: 'Volunteer',
          volunteerLastName: 'Name',
        },
      ],
    });
  });

  it('parses multiple VMS timeslots and bookings', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(bookingResponse({
      bookingCount: 2,
      capacityTotal: 35,
      timeslots: [
        { vmsTimeslotId: 456, externalTimeslotId: 'wms-slot-456', capacity: 20, remaining: 12, bookingCount: 8 },
        { vmsTimeslotId: 457, externalTimeslotId: 'wms-slot-457', capacity: 15, remaining: 14, bookingCount: 1 },
      ],
      bookings: [
        {
          vmsBookingId: 789,
          externalTimeslotId: 'wms-slot-456',
          status: 'CONFIRMED',
          vmsStatus: 'Confirmed',
          volunteer: { vmsVolunteerId: 'vol-1', name: 'One Person', email: 'one@example.com', phone: '+2701' },
        },
        {
          vmsBookingId: 790,
          externalTimeslotId: 'wms-slot-457',
          status: 'WAITLISTED',
          vmsStatus: 'Waitlisted',
          volunteer: { vmsVolunteerId: 'vol-2', name: 'Two Person', email: 'two@example.com', phone: '+2702' },
        },
      ],
    })));
    const adapter = createRealVMSAdapter({ fetchImpl });

    const result = await adapter.getEventBookings('wms-event-123');

    expect(result.timeslots).toHaveLength(2);
    expect(result.bookings).toHaveLength(2);
    expect(result.bookings.map((booking) => booking.externalBookingId)).toEqual(['789', '790']);
    expect(result.bookings.map((booking) => booking.externalTimeslotId)).toEqual(['wms-slot-456', 'wms-slot-457']);
  });

  it('preserves volunteer identity from VMS bookings', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(bookingResponse()));
    const adapter = createRealVMSAdapter({ fetchImpl });

    const result = await adapter.getEventBookings('wms-event-123');

    expect(result.bookings[0].volunteer).toEqual({
      vmsVolunteerId: 'supabase-user-uuid',
      name: 'Volunteer Name',
      email: 'volunteer@example.com',
      phone: '+27821234567',
    });
  });

  it('sends attendance to the exact VMS attendance endpoint with mapped WMS fields', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ accepted: true }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await adapter.sendAttendance({
      booking: { external_booking_id: 789 },
      checked_in: true,
      check_in_time: '2026-10-01T10:30:00+02:00',
      worked_minutes: 120,
      contributionHours: 2,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://vms.example.test/api/integrations/wms/v1/attendance',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          vmsBookingId: 789,
          attendanceStatus: 'attended',
          source: 'wms',
          recordedAt: '2026-10-01T10:30:00+02:00',
        }),
      })
    );
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload).not.toHaveProperty('worked_minutes');
    expect(payload).not.toHaveProperty('workedMinutes');
    expect(payload).not.toHaveProperty('contributionHours');
    expect(payload).not.toHaveProperty('contribution_hours');
  });
});

describe('RealVMSAdapter error handling', () => {
  it('fails on missing config before making a request', async () => {
    delete process.env.VMS_API_TOKEN;
    const fetchImpl = vi.fn();
    const adapter = createRealVMSAdapter({ fetchImpl });

    await expect(adapter.healthCheck()).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps network errors without exposing the token', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED secret-token');
    });
    const adapter = createRealVMSAdapter({ fetchImpl });

    await expect(adapter.healthCheck()).rejects.toMatchObject({ code: 'VMS_NETWORK_ERROR' });
    await expect(adapter.healthCheck()).rejects.not.toThrow(/secret-token/);
  });

  it.each([401, 403])('maps %s auth failures', async (status) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'nope' }, { ok: false, status }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await expect(adapter.healthCheck()).rejects.toMatchObject({
      code: 'VMS_AUTH_ERROR',
      status,
    });
  });

  it('maps non-2xx responses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'bad gateway' }, { ok: false, status: 502 }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await expect(adapter.publishEvent({ event_id: 'event-1', event_name: 'Pack day' })).rejects.toMatchObject({
      code: 'VMS_HTTP_ERROR',
      status: 502,
    });
  });

  it('maps invalid JSON responses', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: vi.fn(async () => '<html>not json</html>'),
    }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await expect(adapter.getEventBookings('event-1')).rejects.toMatchObject({
      code: 'VMS_INVALID_JSON',
      status: 200,
    });
  });

  it('rejects invalid booking responses cleanly', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      externalEventId: 'wms-event-123',
      bookingCount: 1,
      capacityTotal: 20,
      timeslots: [{ externalTimeslotId: 'wms-slot-456', capacity: 20, remaining: 12, bookingCount: 8 }],
      bookings: [],
    }));
    const adapter = createRealVMSAdapter({ fetchImpl });

    await expect(adapter.getEventBookings('wms-event-123')).rejects.toMatchObject({
      code: 'VMS_INVALID_RESPONSE',
      status: 502,
    });
  });

  it.each([0, -1, 1.5, '25', null])('rejects invalid capacity %s before making a request', async (capacity) => {
    const fetchImpl = vi.fn();
    const adapter = createRealVMSAdapter({ fetchImpl });

    expect(() => adapter.updateTimeslotCapacity('wms-slot-456', capacity)).toThrow(/positive integer/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['present', 'absent', '', null])('rejects invalid attendanceStatus %s before making a request', async (attendanceStatus) => {
    const fetchImpl = vi.fn();
    const adapter = createRealVMSAdapter({ fetchImpl });

    expect(() => adapter.sendAttendance({
      vmsBookingId: 789,
      attendanceStatus,
      recordedAt: '2026-10-01T10:30:00+02:00',
    })).toThrow(/attendanceStatus/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

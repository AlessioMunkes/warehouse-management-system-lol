// server/__tests__/vmsIntegration.service.test.js
// Phase 4 targeted tests: VMSIntegrationService delegates to the adapter only.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const publishMock = vi.fn();
const selectedAdapter = { publishEvent: publishMock };
vi.mock('../src/integrations/vms.adapter.js', () => ({
  getVMSAdapter: () => selectedAdapter,
}));

const mod = await import('../src/services/vmsIntegration.service.js');
const svc = mod.default;

beforeEach(() => {
  vi.clearAllMocks();
  svc.setAdapter({ publishEvent: publishMock });
});

describe('VMSIntegrationService adapter delegation', () => {
  it('delegates event publishing to the selected adapter', async () => {
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    const payload = { externalEventId: 'e1' };
    const result = await svc.publishEvent(payload);
    expect(result).toEqual({ externalId: 'VMS-EVENT_BOOKING-e1' });
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(payload);
    expect(Object.keys(svc).sort()).toEqual([
      'getAdapter',
      'getEventBookings',
      'publishEvent',
      'publishEventBooking',
      'sendAttendance',
      'setAdapter',
      'updateTimeslotCapacity',
    ].sort());
  });

  it('keeps legacy publishEventBooking compatibility for mock-style adapters', async () => {
    svc.setAdapter({ publishEventBooking: publishMock });
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    const payload = { entityType: 'event_booking', entityId: 'e1' };
    const result = await svc.publishEvent(payload);
    expect(result).toEqual({ externalId: 'VMS-EVENT_BOOKING-e1' });
    expect(publishMock).toHaveBeenCalledWith(payload);
  });

  it('delegates timeslot capacity updates to the selected adapter', async () => {
    const updateTimeslotCapacity = vi.fn().mockResolvedValueOnce({ externalTimeslotId: 't1', capacity: 25 });
    svc.setAdapter({ publishEvent: publishMock, updateTimeslotCapacity });

    const result = await svc.updateTimeslotCapacity('t1', 25);

    expect(result).toEqual({ externalTimeslotId: 't1', capacity: 25 });
    expect(updateTimeslotCapacity).toHaveBeenCalledTimes(1);
    expect(updateTimeslotCapacity).toHaveBeenCalledWith('t1', 25);
  });

  it('delegates booking snapshot retrieval to the selected adapter', async () => {
    const getEventBookings = vi.fn().mockResolvedValueOnce({ externalEventId: 'e1', bookings: [] });
    svc.setAdapter({ publishEvent: publishMock, getEventBookings });

    const result = await svc.getEventBookings('e1');

    expect(result).toEqual({ externalEventId: 'e1', bookings: [] });
    expect(getEventBookings).toHaveBeenCalledTimes(1);
    expect(getEventBookings).toHaveBeenCalledWith('e1');
  });

  it('delegates attendance sends to the selected adapter', async () => {
    const sendAttendance = vi.fn().mockResolvedValueOnce({ ok: true });
    svc.setAdapter({ publishEvent: publishMock, sendAttendance });
    const payload = {
      vmsBookingId: 'VMS-B-100',
      attendanceStatus: 'attended',
      source: 'wms',
      recordedAt: '2026-10-01T09:05:00.000Z',
    };

    const result = await svc.sendAttendance(payload);

    expect(result).toEqual({ ok: true });
    expect(sendAttendance).toHaveBeenCalledWith(payload);
  });
});

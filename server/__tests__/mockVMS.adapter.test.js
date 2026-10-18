// server/__tests__/mockVMS.adapter.test.js
// Phase 4 targeted tests: MockVMSAdapter simulator only.
import { describe, it, expect, beforeEach } from 'vitest';
import mockAdapter from '../src/integrations/mockVMS.adapter.js';

beforeEach(() => {
  mockAdapter.resetMockVMS();
});

describe('MockVMSAdapter success', () => {
  it('publishes successfully with a deterministic fake external ID', async () => {
    const first = await mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' });
    const second = await mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' });
    expect(first.externalId).toBe('VMS-EVENT_BOOKING-e1');
    expect(second.externalId).toBe(first.externalId);
    expect(first.publishedAt).toBeTruthy();
  });

  it('updates timeslot capacity successfully', async () => {
    const result = await mockAdapter.updateTimeslotCapacity('t1', 25);

    expect(result).toMatchObject({
      externalTimeslotId: 't1',
      capacity: 25,
    });
    expect(result.updatedAt).toBeTruthy();
  });

  it('returns an empty booking snapshot for compatibility', async () => {
    const result = await mockAdapter.getEventBookings('e1');

    expect(result).toEqual({
      externalEventId: 'e1',
      bookingCount: 0,
      capacityTotal: 0,
      timeslots: [],
      bookings: [],
    });
  });

  it('sends attendance successfully for compatibility', async () => {
    const result = await mockAdapter.sendAttendance({
      vmsBookingId: 'VMS-B-100',
      attendanceStatus: 'attended',
      source: 'wms',
      recordedAt: '2026-10-01T09:05:00.000Z',
    });

    expect(result).toEqual({
      vmsBookingId: 'VMS-B-100',
      attendanceStatus: 'attended',
      source: 'wms',
      recordedAt: '2026-10-01T09:05:00.000Z',
    });
  });
});

describe('MockVMSAdapter failure', () => {
  it('fails when forced failure mode is on', async () => {
    mockAdapter.setForceFail(true);
    await expect(mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' })).rejects.toThrow(
      /VMS unavailable/
    );
  });

  it('fails transiently via failNext then recovers (retry success)', async () => {
    mockAdapter.failNext(1);
    await expect(mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' })).rejects.toThrow(
      /transient/
    );
    const ok = await mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1' });
    expect(ok.externalId).toBe('VMS-EVENT_BOOKING-e1');
  });

  it('supports per-call forced failure for tests', async () => {
    await expect(
      mockAdapter.publishEventBooking({ entityType: 'event_booking', entityId: 'e1', forceFail: true })
    ).rejects.toThrow(/forced/);
  });
});

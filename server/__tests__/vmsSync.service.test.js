// server/__tests__/vmsSync.service.test.js (part 1)
import { describe, it, expect, beforeEach, vi } from 'vitest';
const syncRepoMock = { findByEntity: vi.fn(), upsertSyncRecord: vi.fn(), updateSyncStatus: vi.fn(), findFailed: vi.fn() };
const eventRepoMock = { findById: vi.fn(), updateEvent: vi.fn() };
const timeslotRepoMock = { findByEventId: vi.fn() };
const publishMock = vi.fn();
const updateCapacityMock = vi.fn();
vi.mock('../src/repositories/vmsSync.repository.js', () => ({ default: syncRepoMock }));
vi.mock('../src/repositories/loveActivismEvent.repository.js', () => ({ default: eventRepoMock }));
vi.mock('../src/repositories/eventTimeslot.repository.js', () => ({ default: timeslotRepoMock }));
vi.mock('../src/services/vmsIntegration.service.js', () => ({
  default: { publishEvent: publishMock, updateTimeslotCapacity: updateCapacityMock },
}));
const mod = await import('../src/services/vmsSync.service.js');
const svc = mod.default;
const EVENT = {
  event_id: 'e1',
  event_name: 'Warehouse Pack Day',
  event_date: '2026-10-01',
  venue_name: 'Warehouse HQ',
  status: 'DRAFT',
  description: 'Pack food boxes',
  location_url: 'https://example.test/location',
};
const SLOTS = [
  {
    timeslot_id: 't1',
    start_time: '2026-10-01T06:00:00.000Z',
    end_time: '2026-10-01T08:00:00.000Z',
    capacity: 20,
  },
  {
    timeslot_id: 't2',
    start_time: '2026-10-01T08:30:00.000Z',
    end_time: '2026-10-01T10:00:00.000Z',
    capacity: 15,
  },
];
const PENDING = { entity_type: 'event_booking', entity_id: 'e1', sync_status: 'PENDING', external_id: null };
const FAILED = { ...PENDING, sync_status: 'FAILED', error_message: 'VMS unavailable' };
beforeEach(() => { vi.clearAllMocks(); eventRepoMock.findById.mockResolvedValue(EVENT); timeslotRepoMock.findByEventId.mockResolvedValue(SLOTS); });
describe('queueSync stores PENDING only', () => {
  it('upserts PENDING with no external call', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce(null);
    syncRepoMock.upsertSyncRecord.mockResolvedValueOnce({ ...PENDING });
    const row = await svc.queueSync('event_booking', 'e1');
    expect(row.sync_status).toBe('PENDING');
    expect(publishMock).not.toHaveBeenCalled();
    expect(syncRepoMock.upsertSyncRecord).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'event_booking', entityId: 'e1', syncStatus: 'PENDING' }));
  });
});
describe('sync success => SYNCED + external ID + last success', () => {
  it('publishes then marks SYNCED and may transition event to PUBLISHED', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce(PENDING);
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED' });
    const row = await svc.syncEntity('event_booking', 'e1');
    expect(row.sync_status).toBe('SYNCED');
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith({
      externalEventId: 'e1',
      title: 'Warehouse Pack Day',
      eventDate: '2026-10-01',
      locationName: 'Warehouse HQ',
      status: 'scheduled',
      description: 'Pack food boxes',
      locationUrl: 'https://example.test/location',
      timeslots: [
        {
          externalTimeslotId: 't1',
          startTime: '08:00',
          endTime: '10:00',
          capacity: 20,
        },
        {
          externalTimeslotId: 't2',
          startTime: '10:30',
          endTime: '12:00',
          capacity: 15,
        },
      ],
    });
    expect(syncRepoMock.updateSyncStatus).toHaveBeenCalledWith('event_booking', 'e1', expect.objectContaining({ syncStatus: 'SYNCED', externalId: 'VMS-EVENT_BOOKING-e1' }));
    expect(eventRepoMock.updateEvent).toHaveBeenCalledWith('e1', { status: 'PUBLISHED' });
  });

  it('publishes PUBLISHED local events as scheduled for the VMS contract', async () => {
    eventRepoMock.findById.mockResolvedValueOnce({ ...EVENT, status: 'PUBLISHED' });
    syncRepoMock.findByEntity.mockResolvedValueOnce(PENDING);
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED' });

    await svc.syncEntity('event_booking', 'e1');

    expect(publishMock.mock.calls[0][0]).toMatchObject({ status: 'scheduled' });
  });

  it('keeps date-only strings as the exact calendar date', async () => {
    eventRepoMock.findById.mockResolvedValueOnce({ ...EVENT, event_date: '2026-11-15' });
    syncRepoMock.findByEntity.mockResolvedValueOnce(PENDING);
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED' });

    await svc.syncEntity('event_booking', 'e1');

    expect(publishMock.mock.calls[0][0].eventDate).toBe('2026-11-15');
  });

  it('formats Date objects without UTC timezone day shifting', async () => {
    eventRepoMock.findById.mockResolvedValueOnce({ ...EVENT, event_date: new Date(2026, 10, 15) });
    syncRepoMock.findByEntity.mockResolvedValueOnce(PENDING);
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED' });

    await svc.syncEntity('event_booking', 'e1');

    expect(publishMock.mock.calls[0][0].eventDate).toBe('2026-11-15');
  });


  it('publishes stored UTC instants as Johannesburg wall-clock HH:mm values', async () => {
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([
      {
        timeslot_id: 't1',
        start_time: '2026-11-15T07:15:00.000Z',
        end_time: '2026-11-15T08:15:00.000Z',
        capacity: 25,
      },
    ]);
    syncRepoMock.findByEntity.mockResolvedValueOnce(PENDING);
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED' });

    await svc.syncEntity('event_booking', 'e1');

    expect(publishMock.mock.calls[0][0].timeslots[0]).toMatchObject({
      startTime: '09:15',
      endTime: '10:15',
    });
  });

  it('formats timestamp timeslots as VMS time-only values without changing ids or capacity', async () => {
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([
      {
        timeslot_id: 't1',
        start_time: new Date(Date.UTC(2026, 10, 15, 7, 0)),
        end_time: new Date(Date.UTC(2026, 10, 15, 8, 30)),
        capacity: 25,
      },
    ]);
    syncRepoMock.findByEntity.mockResolvedValueOnce(PENDING);
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED' });

    await svc.syncEntity('event_booking', 'e1');

    expect(publishMock.mock.calls[0][0].timeslots).toEqual([
      {
        externalTimeslotId: 't1',
        startTime: '09:00',
        endTime: '10:30',
        capacity: 25,
      },
    ]);
  });
});
describe('sync failure => FAILED + error', () => {
  it('keeps local rows and records FAILED with the error', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce(PENDING);
    publishMock.mockRejectedValueOnce(new Error('VMS unavailable'));
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...FAILED });
    const row = await svc.syncEntity('event_booking', 'e1');
    expect(row.sync_status).toBe('FAILED');
    expect(syncRepoMock.updateSyncStatus).toHaveBeenCalledWith('event_booking', 'e1', expect.objectContaining({ syncStatus: 'FAILED', errorMessage: 'VMS unavailable' }));
    expect(eventRepoMock.updateEvent).not.toHaveBeenCalled();
  });
});
describe('timeslot capacity sync', () => {
  it('marks SYNCED when VMS returns the requested capacity', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED', external_id: '42' });
    updateCapacityMock.mockResolvedValueOnce({ externalTimeslotId: 't1', capacity: 25 });
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED', external_id: '42' });
    eventRepoMock.findById.mockResolvedValueOnce({ ...EVENT, status: 'PUBLISHED' });

    const row = await svc.syncTimeslotCapacity('event_booking', 'e1', 't1', 25);

    expect(row.sync_status).toBe('SYNCED');
    expect(updateCapacityMock).toHaveBeenCalledTimes(1);
    expect(updateCapacityMock).toHaveBeenCalledWith('t1', 25);
    expect(syncRepoMock.updateSyncStatus).toHaveBeenCalledWith('event_booking', 'e1', expect.objectContaining({ syncStatus: 'SYNCED', externalId: '42' }));
  });

  it('records FAILED when VMS returns HTTP success with a mismatched capacity', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED', external_id: '42' });
    updateCapacityMock.mockResolvedValueOnce({ externalTimeslotId: 't1', capacity: 5 });
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({
      ...FAILED,
      error_message: 'VMS capacity verification failed: requested 25, returned 5',
    });

    const row = await svc.syncTimeslotCapacity('event_booking', 'e1', 't1', 25);

    expect(row.sync_status).toBe('FAILED');
    expect(updateCapacityMock).toHaveBeenCalledWith('t1', 25);
    expect(syncRepoMock.updateSyncStatus).toHaveBeenCalledWith('event_booking', 'e1', expect.objectContaining({
      syncStatus: 'FAILED',
      errorMessage: 'VMS capacity verification failed: requested 25, returned 5',
    }));
    expect(eventRepoMock.updateEvent).not.toHaveBeenCalled();
  });

  it('skips VMS capacity update when the event is not already synced', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce({ ...PENDING, sync_status: 'PENDING' });

    const row = await svc.syncTimeslotCapacity('event_booking', 'e1', 't1', 25);

    expect(row).toBeNull();
    expect(updateCapacityMock).not.toHaveBeenCalled();
    expect(syncRepoMock.updateSyncStatus).not.toHaveBeenCalled();
  });

  it('records FAILED when VMS capacity update fails', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED', external_id: '42' });
    updateCapacityMock.mockRejectedValueOnce(new Error('VMS unavailable'));
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...FAILED });

    const row = await svc.syncTimeslotCapacity('event_booking', 'e1', 't1', 25);

    expect(row.sync_status).toBe('FAILED');
    expect(syncRepoMock.updateSyncStatus).toHaveBeenCalledWith('event_booking', 'e1', expect.objectContaining({ syncStatus: 'FAILED', errorMessage: 'VMS unavailable' }));
    expect(eventRepoMock.updateEvent).not.toHaveBeenCalled();
  });
});

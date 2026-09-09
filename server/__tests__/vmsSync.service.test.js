// server/__tests__/vmsSync.service.test.js (part 1)
import { describe, it, expect, beforeEach, vi } from 'vitest';
const syncRepoMock = { findByEntity: vi.fn(), upsertSyncRecord: vi.fn(), updateSyncStatus: vi.fn(), findFailed: vi.fn() };
const eventRepoMock = { findById: vi.fn(), updateEvent: vi.fn() };
const timeslotRepoMock = { findByEventId: vi.fn() };
const publishMock = vi.fn();
vi.mock('../src/repositories/vmsSync.repository.js', () => ({ default: syncRepoMock }));
vi.mock('../src/repositories/loveActivismEvent.repository.js', () => ({ default: eventRepoMock }));
vi.mock('../src/repositories/eventTimeslot.repository.js', () => ({ default: timeslotRepoMock }));
vi.mock('../src/services/vmsIntegration.service.js', () => ({ default: { publishEventBooking: publishMock } }));
const mod = await import('../src/services/vmsSync.service.js');
const svc = mod.default;
const EVENT = { event_id: 'e1', status: 'SCHEDULED' };
const SLOTS = [{ timeslot_id: 't1' }];
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
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({ event: EVENT, timeslots: SLOTS }));
    expect(syncRepoMock.updateSyncStatus).toHaveBeenCalledWith('event_booking', 'e1', expect.objectContaining({ syncStatus: 'SYNCED', externalId: 'VMS-EVENT_BOOKING-e1' }));
    expect(eventRepoMock.updateEvent).toHaveBeenCalledWith('e1', { status: 'PUBLISHED' });
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

// server/__tests__/vmsSync.retry.test.js
// Phase 4 targeted tests: retry + status reads.
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
const PENDING = { entity_type: 'event_booking', entity_id: 'e1', sync_status: 'PENDING', external_id: null };
const FAILED = { ...PENDING, sync_status: 'FAILED', error_message: 'VMS unavailable' };
beforeEach(() => { vi.clearAllMocks(); eventRepoMock.findById.mockResolvedValue(EVENT); timeslotRepoMock.findByEventId.mockResolvedValue([]); });
describe('retry FAILED => PENDING => success/failure', () => {
  it('retries to success', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce(FAILED).mockResolvedValueOnce(PENDING);
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING }).mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED' });
    publishMock.mockResolvedValueOnce({ externalId: 'VMS-EVENT_BOOKING-e1' });
    const row = await svc.retrySync('event_booking', 'e1');
    expect(row.sync_status).toBe('SYNCED');
    expect(syncRepoMock.updateSyncStatus).toHaveBeenCalledWith('event_booking', 'e1', expect.objectContaining({ syncStatus: 'PENDING', errorMessage: null }));
  });
  it('retries to failure', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce(FAILED).mockResolvedValueOnce(PENDING);
    syncRepoMock.updateSyncStatus.mockResolvedValueOnce({ ...PENDING }).mockResolvedValueOnce({ ...FAILED });
    publishMock.mockRejectedValueOnce(new Error('still down'));
    const row = await svc.retrySync('event_booking', 'e1');
    expect(row.sync_status).toBe('FAILED');
  });
  it('rejects retry when not FAILED', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce(PENDING);
    await expect(svc.retrySync('event_booking', 'e1')).rejects.toMatchObject({ status: 409 });
    expect(publishMock).not.toHaveBeenCalled();
  });
});
describe('retryFailedSyncs', () => {
  it('retries every FAILED record without recreating source rows', async () => {
    syncRepoMock.findFailed.mockResolvedValueOnce([FAILED]);
    syncRepoMock.findByEntity.mockResolvedValueOnce(FAILED).mockResolvedValueOnce(PENDING);
    syncRepoMock.updateSyncStatus.mockResolvedValue({ ...PENDING, sync_status: 'SYNCED' });
    publishMock.mockResolvedValue({ externalId: 'VMS-EVENT_BOOKING-e1' });
    const rows = await svc.retryFailedSyncs();
    expect(rows).toHaveLength(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });
});
describe('getSyncStatus', () => {
  it('returns the stored record', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce({ ...PENDING, sync_status: 'SYNCED' });
    expect((await svc.getSyncStatus('event_booking', 'e1')).sync_status).toBe('SYNCED');
  });
  it('404s when no sync record exists', async () => {
    syncRepoMock.findByEntity.mockResolvedValueOnce(null);
    await expect(svc.getSyncStatus('event_booking', 'x')).rejects.toMatchObject({ status: 404 });
  });
});

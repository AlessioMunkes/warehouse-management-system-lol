// server/__tests__/eventBooking.vmsSync.test.js
// Phase 4 targeted tests: EventBookingService post-commit wiring.
import { describe, it, expect, beforeEach, vi } from 'vitest';
const eventRepoMock = { findById: vi.fn() };
const spaceRepoMock = { findById: vi.fn() };
const slotMock = { findById: vi.fn(), findByEventId: vi.fn(), createTimeslot: vi.fn(), updateTimeslot: vi.fn(), findPotentialOverlaps: vi.fn() };
const bookMock = { countConfirmedByTimeslot: vi.fn() };
const auditMock = vi.fn();
const queueSyncMock = vi.fn();
const syncEntityMock = vi.fn();
vi.mock('../src/repositories/loveActivismEvent.repository.js', () => ({ default: eventRepoMock }));
vi.mock('../src/repositories/eventSpace.repository.js', () => ({ default: spaceRepoMock }));
vi.mock('../src/repositories/eventTimeslot.repository.js', () => ({ default: slotMock }));
vi.mock('../src/repositories/volunteerBooking.repository.js', () => ({ default: bookMock }));
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit: auditMock }));
vi.mock('../src/services/vmsSync.service.js', () => ({ default: { queueSync: queueSyncMock, syncEntity: syncEntityMock } }));
const makeClient = () => ({ query: vi.fn(async (s) => { if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') order.push(s); return { rows: [] }; }), release: vi.fn(() => { released = true; }) });
let order = []; let released = false;
const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const mod = await import('../src/services/eventBooking.service.js');
const svc = mod.default;
const ACTOR = { id: 5 };
const EVENT = { event_id: 'e1' };
const SPACE = { space_id: 's1', is_active: true };
const SLOT = { timeslot_id: 't1', event_id: 'e1', space_id: 's1', start_time: '2026-10-01T09:00:00Z', end_time: '2026-10-01T10:00:00Z', capacity: 10, status: 'OPEN' };
beforeEach(() => { vi.clearAllMocks(); order = []; released = false; poolMock.connect.mockImplementation(async () => makeClient()); queueSyncMock.mockResolvedValue({ sync_status: 'PENDING' }); syncEntityMock.mockResolvedValue({ sync_status: 'SYNCED' }); });
describe('no external call before commit', () => {
  it('queues PENDING in-txn then syncs post-commit after release', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    slotMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    slotMock.createTimeslot.mockResolvedValueOnce(SLOT);
    let syncAtCall = null;
    syncEntityMock.mockImplementationOnce(async () => { syncAtCall = { order: [...order], released }; return { sync_status: 'SYNCED' }; });
    const result = await svc.bookEventSpaceAndTimeslots('e1', { spaceId: 's1', timeslots: [{ startTime: SLOT.start_time, endTime: SLOT.end_time, capacity: 10 }] }, ACTOR);
    expect(result).toHaveLength(1);
    expect(queueSyncMock).toHaveBeenCalledWith('event_booking', 'e1', expect.anything());
    expect(syncEntityMock).toHaveBeenCalledWith('event_booking', 'e1');
    expect(syncAtCall.order).toContain('COMMIT');
    expect(syncAtCall.released).toBe(true);
  });
});
describe('local transaction rollback => no VMS call', () => {
  it('rolls back on overlap and never syncs', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    slotMock.findPotentialOverlaps.mockResolvedValueOnce([SLOT]);
    await expect(svc.bookEventSpaceAndTimeslots('e1', { spaceId: 's1', timeslots: [{ startTime: SLOT.start_time, endTime: SLOT.end_time, capacity: 10 }] }, ACTOR)).rejects.toMatchObject({ status: 409 });
    expect(queueSyncMock).not.toHaveBeenCalled();
    expect(syncEntityMock).not.toHaveBeenCalled();
    expect(slotMock.createTimeslot).not.toHaveBeenCalled();
  });
});
describe('post-commit VMS failure preserves local records', () => {
  it('returns local rows even when sync fails', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    slotMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    slotMock.createTimeslot.mockResolvedValueOnce(SLOT);
    syncEntityMock.mockResolvedValueOnce({ sync_status: 'FAILED' });
    const result = await svc.bookEventSpaceAndTimeslots('e1', { spaceId: 's1', timeslots: [{ startTime: SLOT.start_time, endTime: SLOT.end_time, capacity: 10 }] }, ACTOR);
    expect(result).toHaveLength(1);
    expect(syncEntityMock).toHaveBeenCalled();
  });
  it('retries do not recreate source records', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    slotMock.findById.mockResolvedValueOnce(SLOT);
    slotMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    slotMock.updateTimeslot.mockResolvedValueOnce({ ...SLOT, capacity: 20 });
    await svc.updateEventBooking('e1', { timeslotId: 't1', capacity: 20 }, ACTOR);
    expect(slotMock.createTimeslot).not.toHaveBeenCalled();
    expect(queueSyncMock).toHaveBeenCalledWith('event_booking', 'e1', expect.anything());
    expect(syncEntityMock).toHaveBeenCalledWith('event_booking', 'e1');
  });
});

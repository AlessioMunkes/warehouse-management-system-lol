// ─────────────────────────────────────────────────────────────
// server/__tests__/loveActivism.controllersB.test.js
// Phase 5 targeted controller tests: volunteer + attendance + sync.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
const volSvc = { getBooking: vi.fn(), getBookingsForTimeslot: vi.fn(), getBookingsForEvent: vi.fn(), createWalkIn: vi.fn(), cancelGuestBooking: vi.fn() };
const attSvc = { confirmAttendance: vi.fn(), getAttendanceForBooking: vi.fn(), getAttendanceForTimeslot: vi.fn(), getAttendanceForEvent: vi.fn(), getAttendanceSummary: vi.fn() };
const syncSvc = { getSyncStatus: vi.fn(), retrySync: vi.fn() };
vi.mock('../src/services/volunteerBooking.service.js', () => ({ default: volSvc }));
vi.mock('../src/services/attendance.service.js', () => ({ default: attSvc }));
vi.mock('../src/services/vmsSync.service.js', () => ({ default: syncSvc }));
const volC = (await import('../src/controllers/volunteerBooking.controller.js')).default;
const attC = (await import('../src/controllers/attendance.controller.js')).default;
const syncC = (await import('../src/controllers/vmsSync.controller.js')).default;
const ACTOR = { id: 7, role: 'manager' };
const R = () => { const r = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };
beforeEach(() => { vi.clearAllMocks(); });
const fwd = async (fn, call) => { const e = Object.assign(new Error('boom'), { status: 404 }); fn.mockRejectedValueOnce(e); const n = vi.fn(); await call(n); expect(n).toHaveBeenCalledWith(e); };
describe('volunteerBooking.controller', () => {
  it('reads pass ids; walk-in 201; cancel passes actor', async () => {
    volSvc.getBooking.mockResolvedValueOnce({}); volSvc.getBookingsForTimeslot.mockResolvedValueOnce([]);
    volSvc.getBookingsForEvent.mockResolvedValueOnce([]); volSvc.createWalkIn.mockResolvedValueOnce({}); volSvc.cancelGuestBooking.mockResolvedValueOnce({});
    const wr = R();
    await volC.getBooking({ params: { bookingId: 'b1' } }, R(), vi.fn());
    await volC.getBookingsForTimeslot({ params: { timeslotId: 't1' } }, R(), vi.fn());
    await volC.getBookingsForEvent({ params: { eventId: 'e1' } }, R(), vi.fn());
    await volC.createWalkIn({ params: { timeslotId: 't1' }, body: { volunteerFirstName: 'J' }, user: ACTOR }, wr, vi.fn());
    await volC.cancelGuestBooking({ params: { bookingId: 'b1' }, user: ACTOR }, R(), vi.fn());
    expect(volSvc.getBooking).toHaveBeenCalledWith('b1');
    expect(volSvc.getBookingsForTimeslot).toHaveBeenCalledWith('t1');
    expect(volSvc.getBookingsForEvent).toHaveBeenCalledWith('e1');
    expect(volSvc.createWalkIn).toHaveBeenCalledWith('t1', { volunteerFirstName: 'J' }, ACTOR);
    expect(wr.status).toHaveBeenCalledWith(201);
    expect(volSvc.cancelGuestBooking).toHaveBeenCalledWith('b1', ACTOR);
  });
  it('forwards errors to next', async () => {
    await fwd(volSvc.getBooking, (n) => volC.getBooking({ params: { bookingId: 'b1' } }, R(), n));
    await fwd(volSvc.createWalkIn, (n) => volC.createWalkIn({ params: { timeslotId: 't1' }, body: {}, user: ACTOR }, R(), n));
    await fwd(volSvc.cancelGuestBooking, (n) => volC.cancelGuestBooking({ params: { bookingId: 'b1' }, user: ACTOR }, R(), n));
  });
});
describe('attendance.controller', () => {
  it('confirm passes (bookingId, body, actor); reads pass ids', async () => {
    attSvc.confirmAttendance.mockResolvedValueOnce({}); attSvc.getAttendanceForBooking.mockResolvedValueOnce(null);
    attSvc.getAttendanceForTimeslot.mockResolvedValueOnce([]); attSvc.getAttendanceForEvent.mockResolvedValueOnce([]);
    attSvc.getAttendanceSummary.mockResolvedValueOnce({});
    await attC.confirmAttendance({ params: { bookingId: 'b1' }, body: { checkedIn: true }, user: ACTOR }, R(), vi.fn());
    await attC.getAttendanceForBooking({ params: { bookingId: 'b1' } }, R(), vi.fn());
    await attC.getAttendanceForTimeslot({ params: { timeslotId: 't1' } }, R(), vi.fn());
    await attC.getAttendanceForEvent({ params: { eventId: 'e1' } }, R(), vi.fn());
    await attC.getAttendanceSummary({ params: { timeslotId: 't1' } }, R(), vi.fn());
    expect(attSvc.confirmAttendance).toHaveBeenCalledWith('b1', { checkedIn: true }, ACTOR);
    expect(attSvc.getAttendanceForBooking).toHaveBeenCalledWith('b1');
    expect(attSvc.getAttendanceForTimeslot).toHaveBeenCalledWith('t1');
    expect(attSvc.getAttendanceForEvent).toHaveBeenCalledWith('e1');
    expect(attSvc.getAttendanceSummary).toHaveBeenCalledWith('t1');
  });
  it('forwards errors to next', async () => {
    await fwd(attSvc.confirmAttendance, (n) => attC.confirmAttendance({ params: { bookingId: 'b1' }, body: {}, user: ACTOR }, R(), n));
    await fwd(attSvc.getAttendanceSummary, (n) => attC.getAttendanceSummary({ params: { timeslotId: 't1' } }, R(), n));
  });
});
describe('vmsSync.controller', () => {
  it('passes (entityType, entityId), 200', async () => {
    syncSvc.getSyncStatus.mockResolvedValueOnce({}); syncSvc.retrySync.mockResolvedValueOnce({});
    await syncC.getSyncStatus({ params: { entityType: 'event_booking', entityId: 'e1' } }, R(), vi.fn());
    await syncC.retrySync({ params: { entityType: 'event_booking', entityId: 'e1' } }, R(), vi.fn());
    expect(syncSvc.getSyncStatus).toHaveBeenCalledWith('event_booking', 'e1');
    expect(syncSvc.retrySync).toHaveBeenCalledWith('event_booking', 'e1');
  });
  it('forwards errors to next', async () => {
    await fwd(syncSvc.getSyncStatus, (n) => syncC.getSyncStatus({ params: { entityType: 'x', entityId: 'y' } }, R(), n));
    await fwd(syncSvc.retrySync, (n) => syncC.retrySync({ params: { entityType: 'x', entityId: 'y' } }, R(), n));
  });
});

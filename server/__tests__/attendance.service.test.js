import { describe, it, expect, beforeEach, vi } from 'vitest';
const attendanceRepoMock = { upsertByBookingId: vi.fn(), findByBookingId: vi.fn(), countCheckedInByTimeslot: vi.fn() };
const bookingRepoMock = { findById: vi.fn(), findByTimeslotId: vi.fn(), countConfirmedByTimeslot: vi.fn() };
const timeslotRepoMock = { findById: vi.fn(), findByEventId: vi.fn() };
const auditMock = vi.fn();
vi.mock('../src/repositories/attendance.repository.js', () => ({ default: attendanceRepoMock }));
vi.mock('../src/repositories/volunteerBooking.repository.js', () => ({ default: bookingRepoMock }));
vi.mock('../src/repositories/eventTimeslot.repository.js', () => ({ default: timeslotRepoMock }));
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit: auditMock }));
const makeClient = () => ({ sql: [], query: vi.fn(async () => ({ rows: [] })), release: vi.fn() });
const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const mod = await import('../src/services/attendance.service.js');
const svc = mod.default;
const ACTOR = { id: 5 };
const BOOKING = { booking_id: 'b1', timeslot_id: 't1', booking_status: 'CONFIRMED' };
const ATTENDANCE = { attendance_id: 'a1', booking_id: 'b1', checked_in: true, check_in_time: '2026-10-01T09:05:00.000Z', source: 'WMS' };
beforeEach(() => { vi.clearAllMocks(); poolMock.connect.mockResolvedValue(makeClient()); });

describe('confirmAttendance', () => {
  it('checks in with explicit timestamp and audits CHECK_IN', async () => {
    bookingRepoMock.findById.mockResolvedValueOnce(BOOKING);
    attendanceRepoMock.upsertByBookingId.mockResolvedValueOnce(ATTENDANCE);
    const result = await svc.confirmAttendance('b1', { checkedIn: true, checkInTime: '2026-10-01T09:05:00.000Z' }, ACTOR);
    expect(result).toEqual(ATTENDANCE);
    expect(attendanceRepoMock.upsertByBookingId).toHaveBeenCalledWith('b1', expect.objectContaining({ checkedIn: true, checkInTime: '2026-10-01T09:05:00.000Z', source: 'WMS' }), expect.anything());
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'attendance', entityId: 'b1', action: 'CHECK_IN', actorId: 5 }));
  });
  it('defaults checkInTime to now when checkedIn true without timestamp', async () => {
    bookingRepoMock.findById.mockResolvedValueOnce(BOOKING);
    attendanceRepoMock.upsertByBookingId.mockImplementationOnce(async (id, data) => ({ attendance_id: 'a1', booking_id: id, checked_in: data.checkedIn, check_in_time: data.checkInTime, source: data.source }));
    const result = await svc.confirmAttendance('b1', { checkedIn: true }, ACTOR);
    expect(result.checked_in).toBe(true);
    expect(new Date(result.check_in_time).toString()).not.toBe('Invalid Date');
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CHECK_IN' }));
  });
  it('forces checkInTime null when checkedIn false and audits CHECK_OUT', async () => {
    bookingRepoMock.findById.mockResolvedValueOnce(BOOKING);
    attendanceRepoMock.upsertByBookingId.mockResolvedValueOnce({ attendance_id: 'a1', booking_id: 'b1', checked_in: false, check_in_time: null, source: 'WMS' });
    const result = await svc.confirmAttendance('b1', { checkedIn: false, checkInTime: '2026-10-01T09:05:00.000Z' }, ACTOR);
    expect(result.check_in_time).toBeNull();
    expect(attendanceRepoMock.upsertByBookingId).toHaveBeenCalledWith('b1', expect.objectContaining({ checkedIn: false, checkInTime: null }), expect.anything());
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CHECK_OUT' }));
  });
  it('rejects when booking not found', async () => {
    bookingRepoMock.findById.mockResolvedValueOnce(null);
    await expect(svc.confirmAttendance('missing', { checkedIn: true }, ACTOR)).rejects.toMatchObject({ status: 404 });
    expect(attendanceRepoMock.upsertByBookingId).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
  it('propagates repository errors', async () => {
    bookingRepoMock.findById.mockResolvedValueOnce(BOOKING);
    attendanceRepoMock.upsertByBookingId.mockRejectedValueOnce(new Error('DB error'));
    await expect(svc.confirmAttendance('b1', { checkedIn: true }, ACTOR)).rejects.toThrow('DB error');
  });
});

describe('syncExternalAttendance', () => {
  it('persists via upsert with VMS default and no audit', async () => {
    bookingRepoMock.findById.mockResolvedValueOnce(BOOKING);
    attendanceRepoMock.upsertByBookingId.mockResolvedValueOnce({ ...ATTENDANCE, source: 'VMS' });
    const result = await svc.syncExternalAttendance({ bookingId: 'b1', checkedIn: true, checkInTime: '2026-10-01T09:05:00.000Z' });
    expect(result.source).toBe('VMS');
    expect(attendanceRepoMock.upsertByBookingId).toHaveBeenCalledWith('b1', expect.objectContaining({ checkedIn: true, source: 'VMS' }));
    expect(auditMock).not.toHaveBeenCalled();
  });
  it('forces checkInTime null when checkedIn false', async () => {
    bookingRepoMock.findById.mockResolvedValueOnce(BOOKING);
    attendanceRepoMock.upsertByBookingId.mockResolvedValueOnce({ attendance_id: 'a1', booking_id: 'b1', checked_in: false, check_in_time: null, source: 'VMS' });
    await svc.syncExternalAttendance({ bookingId: 'b1', checkedIn: false, checkInTime: '2026-10-01T09:05:00.000Z' });
    expect(attendanceRepoMock.upsertByBookingId).toHaveBeenCalledWith('b1', expect.objectContaining({ checkedIn: false, checkInTime: null }));
  });
  it('rejects when booking not found', async () => {
    bookingRepoMock.findById.mockResolvedValueOnce(null);
    await expect(svc.syncExternalAttendance({ bookingId: 'x', checkedIn: true })).rejects.toMatchObject({ status: 404 });
    expect(attendanceRepoMock.upsertByBookingId).not.toHaveBeenCalled();
  });
  it('rejects missing bookingId', async () => {
    await expect(svc.syncExternalAttendance({ checkedIn: true })).rejects.toMatchObject({ status: 400 });
  });
});
describe('getAttendanceForBooking', () => {
  it('returns attendance by booking', async () => {
    attendanceRepoMock.findByBookingId.mockResolvedValueOnce(ATTENDANCE);
    expect(await svc.getAttendanceForBooking('b1')).toEqual(ATTENDANCE);
    expect(attendanceRepoMock.findByBookingId).toHaveBeenCalledWith('b1');
  });
  it('rejects missing bookingId', async () => {
    await expect(svc.getAttendanceForBooking(null)).rejects.toMatchObject({ status: 400 });
  });
});
describe('getAttendanceForTimeslot', () => {
  it('returns rows for bookings with attendance, skipping missing', async () => {
    bookingRepoMock.findByTimeslotId.mockResolvedValueOnce([{ booking_id: 'b1' }, { booking_id: 'b2' }]);
    attendanceRepoMock.findByBookingId.mockResolvedValueOnce(ATTENDANCE);
    attendanceRepoMock.findByBookingId.mockResolvedValueOnce(null);
    expect(await svc.getAttendanceForTimeslot('t1')).toEqual([ATTENDANCE]);
  });
  it('rejects missing timeslotId', async () => {
    await expect(svc.getAttendanceForTimeslot(null)).rejects.toMatchObject({ status: 400 });
  });
  it('propagates repository errors', async () => {
    bookingRepoMock.findByTimeslotId.mockRejectedValueOnce(new Error('DB error'));
    await expect(svc.getAttendanceForTimeslot('t1')).rejects.toThrow('DB error');
  });
});
describe('getAttendanceForEvent', () => {
  it('aggregates attendance across timeslots and bookings', async () => {
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([{ timeslot_id: 't1' }, { timeslot_id: 't2' }]);
    bookingRepoMock.findByTimeslotId.mockResolvedValueOnce([{ booking_id: 'b1' }]);
    bookingRepoMock.findByTimeslotId.mockResolvedValueOnce([{ booking_id: 'b2' }]);
    attendanceRepoMock.findByBookingId.mockResolvedValueOnce(ATTENDANCE);
    attendanceRepoMock.findByBookingId.mockResolvedValueOnce({ ...ATTENDANCE, attendance_id: 'a2', booking_id: 'b2' });
    expect(await svc.getAttendanceForEvent('e1')).toHaveLength(2);
    expect(timeslotRepoMock.findByEventId).toHaveBeenCalledWith('e1');
  });
  it('rejects missing eventId', async () => {
    await expect(svc.getAttendanceForEvent(null)).rejects.toMatchObject({ status: 400 });
  });
});
describe('getAttendanceSummary', () => {
  it('computes booked/attended/noShow', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce({ timeslot_id: 't1' });
    bookingRepoMock.countConfirmedByTimeslot.mockResolvedValueOnce(10);
    attendanceRepoMock.countCheckedInByTimeslot.mockResolvedValueOnce(7);
    expect(await svc.getAttendanceSummary('t1')).toEqual({ timeslotId: 't1', booked: 10, attended: 7, noShow: 3 });
  });
  it('computes zero noShow when all attended', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce({ timeslot_id: 't1' });
    bookingRepoMock.countConfirmedByTimeslot.mockResolvedValueOnce(5);
    attendanceRepoMock.countCheckedInByTimeslot.mockResolvedValueOnce(5);
    expect((await svc.getAttendanceSummary('t1')).noShow).toBe(0);
  });
  it('rejects when timeslot not found', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(null);
    await expect(svc.getAttendanceSummary('x')).rejects.toMatchObject({ status: 404 });
  });
  it('rejects missing timeslotId', async () => {
    await expect(svc.getAttendanceSummary(null)).rejects.toMatchObject({ status: 400 });
  });
});


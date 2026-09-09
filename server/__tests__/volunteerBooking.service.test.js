import { describe, it, expect, beforeEach, vi } from 'vitest';
const bookingRepoMock = { createBooking: vi.fn(), findById: vi.fn(), findByTimeslotId: vi.fn(), updateBooking: vi.fn(), upsertExternalBooking: vi.fn(), countConfirmedByTimeslot: vi.fn() };
const timeslotRepoMock = { findById: vi.fn(), findByEventId: vi.fn() };
const auditMock = vi.fn();
vi.mock('../src/repositories/volunteerBooking.repository.js', () => ({ default: bookingRepoMock }));
vi.mock('../src/repositories/eventTimeslot.repository.js', () => ({ default: timeslotRepoMock }));
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit: auditMock }));
const makeClient = () => ({ sql: [], query: vi.fn(async () => ({ rows: [] })), release: vi.fn() });
const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const mod = await import('../src/services/volunteerBooking.service.js');
const svc = mod.default;
const ACTOR = { id: 5 };
const TIMESLOT = { timeslot_id: 't1', event_id: 'e1', capacity: 10, status: 'OPEN' };
const VMS = { booking_id: 'b1', timeslot_id: 't1', external_booking_id: 'VMS-B-100', external_volunteer_id: 'VMS-V-100', volunteer_first_name: 'Jane', booking_source: 'VMS', booking_status: 'CONFIRMED' };
beforeEach(() => { vi.clearAllMocks(); poolMock.connect.mockResolvedValue(makeClient()); });

describe('syncExternalBooking', () => {
  it('upserts a VMS booking idempotently', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    bookingRepoMock.upsertExternalBooking.mockResolvedValueOnce(VMS);
    const result = await svc.syncExternalBooking({ externalBookingId: 'VMS-B-100', externalVolunteerId: 'VMS-V-100', timeslotId: 't1', volunteerFirstName: 'Jane' });
    expect(result).toEqual(VMS);
    expect(bookingRepoMock.upsertExternalBooking).toHaveBeenCalledWith(expect.objectContaining({ externalBookingId: 'VMS-B-100', bookingSource: 'VMS' }));
    expect(auditMock).not.toHaveBeenCalled();
  });
  it('rejects a VMS booking without external IDs', async () => {
    await expect(svc.syncExternalBooking({ timeslotId: 't1', volunteerFirstName: 'Jane' })).rejects.toMatchObject({ status: 400 });
    expect(bookingRepoMock.upsertExternalBooking).not.toHaveBeenCalled();
  });
  it('rejects when the timeslot does not exist', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(null);
    await expect(svc.syncExternalBooking({ externalBookingId: 'X', externalVolunteerId: 'Y', timeslotId: 't1', volunteerFirstName: 'Jane' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('syncExternalBookings', () => {
  it('syncs many bookings for a timeslot', async () => {
    timeslotRepoMock.findById.mockResolvedValue(TIMESLOT);
    bookingRepoMock.upsertExternalBooking.mockResolvedValue(VMS);
    const results = await svc.syncExternalBookings('t1', [
      { externalBookingId: 'B1', externalVolunteerId: 'V1', volunteerFirstName: 'A' },
      { externalBookingId: 'B2', externalVolunteerId: 'V2', volunteerFirstName: 'B' },
    ]);
    expect(results).toHaveLength(2);
    expect(bookingRepoMock.upsertExternalBooking).toHaveBeenCalledTimes(2);
  });
});

describe('createWalkIn', () => {
  it('creates a WMS_GUEST booking and audits', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    bookingRepoMock.countConfirmedByTimeslot.mockResolvedValueOnce(2);
    bookingRepoMock.createBooking.mockResolvedValueOnce({ booking_id: 'b2', booking_source: 'WMS_GUEST', external_booking_id: null });
    const result = await svc.createWalkIn('t1', { volunteerFirstName: 'John', volunteerLastName: 'Doe' }, ACTOR);
    expect(result.booking_source).toBe('WMS_GUEST');
    expect(bookingRepoMock.createBooking).toHaveBeenCalledWith(expect.objectContaining({ timeslotId: 't1', externalBookingId: null, externalVolunteerId: null, bookingSource: 'WMS_GUEST', volunteerFirstName: 'John' }), expect.anything());
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'WALK_IN', actorId: 5 }));
  });
  it('rejects a walk-in without a first name', async () => {
    await expect(svc.createWalkIn('t1', { volunteerLastName: 'Doe' }, ACTOR)).rejects.toMatchObject({ status: 400 });
    expect(bookingRepoMock.createBooking).not.toHaveBeenCalled();
  });
  it('rejects a walk-in on a non-OPEN timeslot', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce({ ...TIMESLOT, status: 'CLOSED' });
    await expect(svc.createWalkIn('t1', { volunteerFirstName: 'John' }, ACTOR)).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a walk-in when full', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    bookingRepoMock.countConfirmedByTimeslot.mockResolvedValueOnce(10);
    await expect(svc.createWalkIn('t1', { volunteerFirstName: 'John' }, ACTOR)).rejects.toMatchObject({ status: 409 });
    expect(bookingRepoMock.createBooking).not.toHaveBeenCalled();
  });
});

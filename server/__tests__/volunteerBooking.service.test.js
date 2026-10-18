import { describe, it, expect, beforeEach, vi } from 'vitest';
const bookingRepoMock = { createBooking: vi.fn(), findById: vi.fn(), findByTimeslotId: vi.fn(), updateBooking: vi.fn(), upsertExternalBooking: vi.fn(), cancelMissingExternalBookings: vi.fn(), countConfirmedByTimeslot: vi.fn() };
const timeslotRepoMock = { findById: vi.fn(), findByEventId: vi.fn() };
const vmsSyncRepoMock = { findByEntity: vi.fn(), updateSyncStatus: vi.fn() };
const vmsIntegrationMock = { getEventBookings: vi.fn() };
const auditMock = vi.fn();
vi.mock('../src/repositories/volunteerBooking.repository.js', () => ({ default: bookingRepoMock }));
vi.mock('../src/repositories/eventTimeslot.repository.js', () => ({ default: timeslotRepoMock }));
vi.mock('../src/repositories/vmsSync.repository.js', () => ({ default: vmsSyncRepoMock }));
vi.mock('../src/services/vmsIntegration.service.js', () => ({ default: vmsIntegrationMock }));
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit: auditMock }));
const makeClient = () => ({ sql: [], query: vi.fn(async () => ({ rows: [] })), release: vi.fn() });
const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const mod = await import('../src/services/volunteerBooking.service.js');
const svc = mod.default;
const ACTOR = { id: 5 };
const TIMESLOT = { timeslot_id: 't1', event_id: 'e1', capacity: 10, status: 'OPEN' };
const TIMESLOT_2 = { timeslot_id: 't2', event_id: 'e1', capacity: 5, status: 'OPEN' };
const VMS = { booking_id: 'b1', timeslot_id: 't1', external_booking_id: 'VMS-B-100', external_volunteer_id: 'VMS-V-100', volunteer_first_name: 'Jane', booking_source: 'VMS', booking_status: 'CONFIRMED' };
const SYNCED = { entity_type: 'event_booking', entity_id: 'e1', sync_status: 'SYNCED', external_id: 'e1' };
const SNAPSHOT = {
  externalEventId: 'e1',
  bookingCount: 1,
  capacityTotal: 10,
  timeslots: [{ externalTimeslotId: 't1' }],
  bookings: [
    {
      externalBookingId: 'VMS-B-100',
      externalVolunteerId: 'VMS-V-100',
      externalTimeslotId: 't1',
      bookingStatus: 'ACTIVE',
      vmsStatus: 'Confirmed',
      volunteer: { name: 'Jane Doe', email: 'jane@example.test', phone: '+2701' },
    },
  ],
};
beforeEach(() => { vi.clearAllMocks(); poolMock.connect.mockResolvedValue(makeClient()); bookingRepoMock.cancelMissingExternalBookings.mockResolvedValue([]); vmsSyncRepoMock.updateSyncStatus.mockResolvedValue(SYNCED); });

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

describe('syncBookingsForEvent', () => {
  it('inserts a new external booking from the VMS snapshot', async () => {
    vmsSyncRepoMock.findByEntity.mockResolvedValueOnce(SYNCED);
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([TIMESLOT]);
    vmsIntegrationMock.getEventBookings.mockResolvedValueOnce(SNAPSHOT);
    bookingRepoMock.upsertExternalBooking.mockResolvedValueOnce(VMS);

    const result = await svc.syncBookingsForEvent('e1');

    expect(vmsIntegrationMock.getEventBookings).toHaveBeenCalledWith('e1');
    expect(bookingRepoMock.upsertExternalBooking).toHaveBeenCalledWith(expect.objectContaining({
      externalBookingId: 'VMS-B-100',
      externalVolunteerId: 'VMS-V-100',
      timeslotId: 't1',
      volunteerFirstName: 'Jane',
      volunteerLastName: 'Doe',
      volunteerEmail: 'jane@example.test',
      volunteerPhone: '+2701',
      bookingSource: 'VMS',
      bookingStatus: 'CONFIRMED',
    }), expect.anything());
    expect(result.upsertedCount).toBe(1);
  });

  it('updates an existing external booking through the same upsert key', async () => {
    vmsSyncRepoMock.findByEntity.mockResolvedValueOnce(SYNCED);
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([TIMESLOT_2]);
    vmsIntegrationMock.getEventBookings.mockResolvedValueOnce({
      ...SNAPSHOT,
      bookings: [{ ...SNAPSHOT.bookings[0], externalTimeslotId: 't2', volunteer: { name: 'Jane Smith' } }],
    });
    bookingRepoMock.upsertExternalBooking.mockResolvedValueOnce({ ...VMS, timeslot_id: 't2', volunteer_last_name: 'Smith' });

    await svc.syncBookingsForEvent('e1');

    expect(bookingRepoMock.upsertExternalBooking).toHaveBeenCalledWith(expect.objectContaining({
      externalBookingId: 'VMS-B-100',
      timeslotId: 't2',
      volunteerLastName: 'Smith',
    }), expect.anything());
  });

  it('repeated snapshot uses the same external booking key and creates no explicit duplicates', async () => {
    vmsSyncRepoMock.findByEntity.mockResolvedValueOnce(SYNCED);
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([TIMESLOT]);
    vmsIntegrationMock.getEventBookings.mockResolvedValueOnce(SNAPSHOT);
    bookingRepoMock.upsertExternalBooking.mockResolvedValueOnce(VMS);

    await svc.syncBookingsForEvent('e1');

    expect(bookingRepoMock.upsertExternalBooking).toHaveBeenCalledTimes(1);
    expect(bookingRepoMock.upsertExternalBooking.mock.calls[0][0].externalBookingId).toBe('VMS-B-100');
  });

  it('marks previously synced external bookings missing from the full snapshot as CANCELLED', async () => {
    vmsSyncRepoMock.findByEntity.mockResolvedValueOnce(SYNCED);
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([TIMESLOT]);
    vmsIntegrationMock.getEventBookings.mockResolvedValueOnce({ ...SNAPSHOT, bookings: [] });
    bookingRepoMock.cancelMissingExternalBookings.mockResolvedValueOnce([{ ...VMS, booking_status: 'CANCELLED' }]);

    const result = await svc.syncBookingsForEvent('e1');

    expect(bookingRepoMock.cancelMissingExternalBookings).toHaveBeenCalledWith(expect.objectContaining({
      timeslotIds: ['t1'],
      presentExternalBookingIds: [],
    }), expect.anything());
    expect(result.cancelledCount).toBe(1);
  });

  it('preserves local walk-ins by cancelling only VMS external bookings', async () => {
    vmsSyncRepoMock.findByEntity.mockResolvedValueOnce(SYNCED);
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([TIMESLOT]);
    vmsIntegrationMock.getEventBookings.mockResolvedValueOnce({ ...SNAPSHOT, bookings: [] });

    await svc.syncBookingsForEvent('e1');

    expect(bookingRepoMock.cancelMissingExternalBookings).toHaveBeenCalledWith(expect.objectContaining({
      timeslotIds: ['t1'],
      presentExternalBookingIds: [],
    }), expect.anything());
    expect(bookingRepoMock.updateBooking).not.toHaveBeenCalled();
  });

  it('does not touch attendance during booking reconciliation', async () => {
    vmsSyncRepoMock.findByEntity.mockResolvedValueOnce(SYNCED);
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([TIMESLOT]);
    vmsIntegrationMock.getEventBookings.mockResolvedValueOnce(SNAPSHOT);
    bookingRepoMock.upsertExternalBooking.mockResolvedValueOnce(VMS);

    await svc.syncBookingsForEvent('e1');

    expect(auditMock).not.toHaveBeenCalled();
  });

  it('leaves local bookings unchanged when VMS snapshot fetch fails', async () => {
    vmsSyncRepoMock.findByEntity.mockResolvedValueOnce(SYNCED);
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([TIMESLOT]);
    vmsIntegrationMock.getEventBookings.mockRejectedValueOnce(new Error('VMS unavailable'));

    await expect(svc.syncBookingsForEvent('e1')).rejects.toThrow('VMS unavailable');

    expect(bookingRepoMock.upsertExternalBooking).not.toHaveBeenCalled();
    expect(bookingRepoMock.cancelMissingExternalBookings).not.toHaveBeenCalled();
    expect(poolMock.connect).not.toHaveBeenCalled();
    expect(vmsSyncRepoMock.updateSyncStatus).toHaveBeenCalledWith('event_booking', 'e1', expect.objectContaining({
      syncStatus: 'FAILED',
      errorMessage: 'VMS unavailable',
    }));
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

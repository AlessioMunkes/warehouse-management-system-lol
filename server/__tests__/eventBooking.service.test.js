import { describe, it, expect, beforeEach, vi } from 'vitest';
const eventRepoMock = { findById: vi.fn() };
const spaceRepoMock = { findById: vi.fn() };
const timeslotRepoMock = { findById: vi.fn(), findByEventId: vi.fn(), createTimeslot: vi.fn(), updateTimeslot: vi.fn(), findPotentialOverlaps: vi.fn() };
const bookingRepoMock = { countConfirmedByTimeslot: vi.fn() };
const auditMock = vi.fn();
vi.mock('../src/repositories/loveActivismEvent.repository.js', () => ({ default: eventRepoMock }));
vi.mock('../src/repositories/eventSpace.repository.js', () => ({ default: spaceRepoMock }));
vi.mock('../src/repositories/eventTimeslot.repository.js', () => ({ default: timeslotRepoMock }));
vi.mock('../src/repositories/volunteerBooking.repository.js', () => ({ default: bookingRepoMock }));
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit: auditMock }));
const makeClient = () => ({ sql: [], query: vi.fn(async () => ({ rows: [] })), release: vi.fn() });
const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const mod = await import('../src/services/eventBooking.service.js');
const svc = mod.default;
const ACTOR = { id: 5 };
const EVENT = { event_id: 'e1', event_name: 'Drive' };
const SPACE = { space_id: 's1', is_active: true };
const TIMESLOT = { timeslot_id: 't1', event_id: 'e1', space_id: 's1', start_time: '2026-10-01T09:00:00Z', end_time: '2026-10-01T10:00:00Z', capacity: 10, status: 'OPEN' };
beforeEach(() => { vi.clearAllMocks(); poolMock.connect.mockResolvedValue(makeClient()); });

describe('bookEventSpaceAndTimeslots', () => {
  const vb = { spaceId: 's1', timeslots: [{ startTime: '2026-10-01T09:00:00Z', endTime: '2026-10-01T10:00:00Z', capacity: 10 }] };
  it('creates timeslots and audits', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    timeslotRepoMock.createTimeslot.mockResolvedValueOnce(TIMESLOT);
    const result = await svc.bookEventSpaceAndTimeslots('e1', vb, ACTOR);
    expect(result).toHaveLength(1);
    expect(timeslotRepoMock.createTimeslot).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1', spaceId: 's1', status: 'OPEN' }), expect.anything());
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'BOOK_SPACE' }));
  });
  it('rejects when event not found', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(null);
    await expect(svc.bookEventSpaceAndTimeslots('x', vb, ACTOR)).rejects.toMatchObject({ status: 404 });
  });
  it('rejects inactive space', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce({ ...SPACE, is_active: false });
    await expect(svc.bookEventSpaceAndTimeslots('e1', vb, ACTOR)).rejects.toMatchObject({ status: 409 });
  });
  it('rejects non-positive capacity', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.bookEventSpaceAndTimeslots('e1', { spaceId: 's1', timeslots: [{ startTime: '2026-10-01T09:00:00Z', endTime: '2026-10-01T10:00:00Z', capacity: 0 }] }, ACTOR)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects endTime <= startTime', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.bookEventSpaceAndTimeslots('e1', { spaceId: 's1', timeslots: [{ startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T09:00:00Z', capacity: 5 }] }, ACTOR)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects overlapping timeslots', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([TIMESLOT]);
    await expect(svc.bookEventSpaceAndTimeslots('e1', vb, ACTOR)).rejects.toMatchObject({ status: 409 });
    expect(timeslotRepoMock.createTimeslot).not.toHaveBeenCalled();
  });
});

describe('updateEventBooking', () => {
  it('updates and audits', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    timeslotRepoMock.updateTimeslot.mockResolvedValueOnce({ ...TIMESLOT, capacity: 20 });
    const result = await svc.updateEventBooking('e1', { timeslotId: 't1', capacity: 20 }, ACTOR);
    expect(result.capacity).toBe(20);
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'UPDATE' }));
  });
  it('rejects overlapping update', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([TIMESLOT]);
        await expect(svc.updateEventBooking('e1', { timeslotId: 't1', capacity: 20 }, ACTOR)).rejects.toMatchObject({ status: 409 });
  });
  it('rejects when event not found', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(null);
    await expect(svc.updateEventBooking('e1', { timeslotId: 't1', capacity: 20 }, ACTOR)).rejects.toMatchObject({ status: 404 });
  });
  it('rejects a timeslot from another event', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findById.mockResolvedValueOnce({ ...TIMESLOT, event_id: 'other' });
    await expect(svc.updateEventBooking('e1', { timeslotId: 't1', capacity: 20 }, ACTOR)).rejects.toMatchObject({ status: 404 });
    expect(timeslotRepoMock.updateTimeslot).not.toHaveBeenCalled();
  });
});

describe('getEventBooking', () => {
  it('returns the event with its timeslots', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findByEventId.mockResolvedValueOnce([TIMESLOT]);
    const result = await svc.getEventBooking('e1');
    expect(result.event).toEqual(EVENT);
    expect(result.timeslots).toEqual([TIMESLOT]);
  });
});

describe('closeTimeslot', () => {
  it('closes an OPEN timeslot and audits', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    timeslotRepoMock.updateTimeslot.mockResolvedValueOnce({ ...TIMESLOT, status: 'CLOSED' });
    const result = await svc.closeTimeslot('t1', ACTOR);
    expect(result.status).toBe('CLOSED');
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CLOSE' }));
  });
  it('rejects closing a cancelled timeslot', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce({ ...TIMESLOT, status: 'CANCELLED' });
    await expect(svc.closeTimeslot('t1', ACTOR)).rejects.toMatchObject({ status: 409 });
  });
});

describe('cancelTimeslot', () => {
  it('cancels a timeslot and audits', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    timeslotRepoMock.updateTimeslot.mockResolvedValueOnce({ ...TIMESLOT, status: 'CANCELLED' });
    const result = await svc.cancelTimeslot('t1', ACTOR);
    expect(result.status).toBe('CANCELLED');
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CANCEL' }));
  });
});

describe('getCapacitySummary', () => {
  it('computes booked/remaining/isFull', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    bookingRepoMock.countConfirmedByTimeslot.mockResolvedValueOnce(7);
    const result = await svc.getCapacitySummary('t1');
    expect(result).toEqual({ timeslotId: 't1', capacity: 10, booked: 7, remaining: 3, isFull: false });
  });
  it('flags isFull when remaining is 0', async () => {
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    bookingRepoMock.countConfirmedByTimeslot.mockResolvedValueOnce(10);
    const result = await svc.getCapacitySummary('t1');
    expect(result.isFull).toBe(true);
    expect(result.remaining).toBe(0);
  });
});


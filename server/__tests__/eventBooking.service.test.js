import { describe, it, expect, beforeEach, vi } from 'vitest';
const eventRepoMock = { findById: vi.fn(), createEvent: vi.fn() };
const spaceRepoMock = { findById: vi.fn(), findByName: vi.fn(), createSpace: vi.fn() };
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
const EVENT = { event_id: 'e1', event_name: 'Drive', event_date: '2026-10-01' };
const SPACE = { space_id: 's1', is_active: true };
const NEW_SPACE = { space_id: 's2', space_name: 'Kitchen', is_active: true };
const TIMESLOT = { timeslot_id: 't1', event_id: 'e1', space_id: 's1', start_time: '2026-10-01T09:00:00Z', end_time: '2026-10-01T10:00:00Z', capacity: 10, status: 'OPEN' };
const TIMESLOT_2 = { timeslot_id: 't2', event_id: 'e1', space_id: 's1', start_time: '2026-10-01T10:30:00Z', end_time: '2026-10-01T11:30:00Z', capacity: 12, status: 'OPEN' };
beforeEach(() => { vi.resetAllMocks(); poolMock.connect.mockResolvedValue(makeClient()); });

describe('createEventWithInitialTimeslot', () => {
  const payload = {
    eventName: 'Drive',
    description: 'Pack food boxes',
    eventDate: '2026-10-01',
    venueName: 'Warehouse',
    address: '1 Main Road',
    spaceId: 's1',
    startTime: '2026-10-01T09:00:00Z',
    endTime: '2026-10-01T10:00:00Z',
    capacity: 10,
  };

  it('creates an event and initial timeslot atomically', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    eventRepoMock.createEvent.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    timeslotRepoMock.createTimeslot.mockResolvedValueOnce(TIMESLOT);
    const result = await svc.createEventWithInitialTimeslot(payload, ACTOR);
    expect(result).toEqual({ event: EVENT, timeslots: [TIMESLOT] });
    expect(eventRepoMock.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Drive',
      description: 'Pack food boxes',
      eventDate: '2026-10-01',
      venueName: 'Warehouse',
      address: '1 Main Road',
      status: 'DRAFT',
      createdBy: 5,
    }), expect.anything());
    expect(timeslotRepoMock.createTimeslot).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1', spaceId: 's1', status: 'OPEN' }), expect.anything());
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'love_activism_event', action: 'CREATE' }));
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'event_timeslot', action: 'BOOK_SPACE' }));
  });

  it('creates an event with an existing space and multiple timeslots atomically', async () => {
    spaceRepoMock.findById.mockResolvedValue(SPACE);
    eventRepoMock.createEvent.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    timeslotRepoMock.createTimeslot.mockResolvedValueOnce(TIMESLOT).mockResolvedValueOnce(TIMESLOT_2);
    const result = await svc.createEventWithInitialTimeslot({
      eventName: 'Drive',
      description: 'Pack food boxes',
      eventDate: '2026-10-01',
      venueName: 'Warehouse',
      address: '1 Main Road',
      space: { mode: 'existing', spaceId: 's1' },
      timeslots: [
        { startTime: '2026-10-01T09:00:00Z', endTime: '2026-10-01T10:00:00Z', capacity: 10 },
        { startTime: '2026-10-01T10:30:00Z', endTime: '2026-10-01T11:30:00Z', capacity: 12 },
      ],
    }, ACTOR);
    expect(result).toEqual({ event: EVENT, timeslots: [TIMESLOT, TIMESLOT_2] });
    expect(timeslotRepoMock.createTimeslot).toHaveBeenCalledTimes(2);
    expect(spaceRepoMock.createSpace).not.toHaveBeenCalled();
  });

  it('creates a new space inside the combined transaction', async () => {
    spaceRepoMock.findByName.mockResolvedValueOnce(null);
    spaceRepoMock.createSpace.mockResolvedValueOnce(NEW_SPACE);
    eventRepoMock.createEvent.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    timeslotRepoMock.createTimeslot.mockResolvedValueOnce({ ...TIMESLOT, space_id: 's2' });
    const result = await svc.createEventWithInitialTimeslot({
      eventName: 'Drive',
      description: 'Pack food boxes',
      eventDate: '2026-10-01',
      venueName: 'Warehouse',
      address: '1 Main Road',
      space: { mode: 'new', spaceName: 'Kitchen', location: 'Warehouse' },
      timeslots: [{ startTime: '2026-10-01T09:00:00Z', endTime: '2026-10-01T10:00:00Z', capacity: 10 }],
    }, ACTOR);
    expect(result.timeslots).toHaveLength(1);
    expect(spaceRepoMock.createSpace).toHaveBeenCalledWith(expect.objectContaining({ spaceName: 'Kitchen', is_active: true }), expect.anything());
    expect(timeslotRepoMock.createTimeslot).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 's2' }), expect.anything());
  });

  it('requires every combined form field', async () => {
    await expect(svc.createEventWithInitialTimeslot({ ...payload, description: '' }, ACTOR)).rejects.toMatchObject({ status: 400 });
    await expect(svc.createEventWithInitialTimeslot({ ...payload, capacity: '' }, ACTOR)).rejects.toMatchObject({ status: 400 });
    expect(eventRepoMock.createEvent).not.toHaveBeenCalled();
  });

  it('rejects inactive spaces and invalid timeslot windows before creating records', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce({ ...SPACE, is_active: false });
    await expect(svc.createEventWithInitialTimeslot(payload, ACTOR)).rejects.toMatchObject({ status: 409 });
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.createEventWithInitialTimeslot({ ...payload, endTime: '2026-10-01T08:00:00Z' }, ACTOR)).rejects.toMatchObject({ status: 400 });
    expect(eventRepoMock.createEvent).not.toHaveBeenCalled();
  });

  it('rejects date mismatches before creating records', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.createEventWithInitialTimeslot({ ...payload, startTime: '2026-10-02T09:00:00Z', endTime: '2026-10-02T10:00:00Z' }, ACTOR)).rejects.toMatchObject({ status: 400 });
    expect(eventRepoMock.createEvent).not.toHaveBeenCalled();
  });

  it('rolls back the event if initial timeslot overlaps', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    eventRepoMock.createEvent.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([TIMESLOT]);
    await expect(svc.createEventWithInitialTimeslot(payload, ACTOR)).rejects.toMatchObject({ status: 409 });
    expect(timeslotRepoMock.createTimeslot).not.toHaveBeenCalled();
  });

  it('rejects submitted timeslots that overlap each other before creating records', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.createEventWithInitialTimeslot({
      ...payload,
      timeslots: [
        { startTime: '2026-10-01T09:00:00Z', endTime: '2026-10-01T11:00:00Z', capacity: 10 },
        { startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T12:00:00Z', capacity: 10 },
      ],
    }, ACTOR)).rejects.toMatchObject({ status: 409 });
    expect(eventRepoMock.createEvent).not.toHaveBeenCalled();
  });
});

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
    expect(timeslotRepoMock.findPotentialOverlaps).toHaveBeenCalledWith(null, 's1', '2026-10-01T09:00:00.000Z', '2026-10-01T10:00:00.000Z', null, expect.anything());
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
  it('rejects timeslots outside the event date', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.bookEventSpaceAndTimeslots('e1', { spaceId: 's1', timeslots: [{ startTime: '2026-10-02T09:00:00Z', endTime: '2026-10-02T10:00:00Z', capacity: 5 }] }, ACTOR)).rejects.toMatchObject({ status: 400 });
    expect(timeslotRepoMock.createTimeslot).not.toHaveBeenCalled();
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
    expect(timeslotRepoMock.findPotentialOverlaps).toHaveBeenCalledWith(null, 's1', '2026-10-01T09:00:00.000Z', '2026-10-01T10:00:00.000Z', 't1', expect.anything());
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
  it('rejects updates that move a timeslot outside the event date', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    timeslotRepoMock.findById.mockResolvedValueOnce(TIMESLOT);
    await expect(svc.updateEventBooking('e1', { timeslotId: 't1', startTime: '2026-10-02T09:00:00Z', endTime: '2026-10-02T10:00:00Z' }, ACTOR)).rejects.toMatchObject({ status: 400 });
    expect(timeslotRepoMock.updateTimeslot).not.toHaveBeenCalled();
  });
  it('rejects overlapping timeslots in the submitted form', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(EVENT);
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.bookEventSpaceAndTimeslots('e1', { spaceId: 's1', timeslots: [
      { startTime: '2026-10-01T09:00:00Z', endTime: '2026-10-01T11:00:00Z', capacity: 10 },
      { startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T12:00:00Z', capacity: 10 },
    ] }, ACTOR)).rejects.toMatchObject({ status: 409 });
    expect(timeslotRepoMock.findPotentialOverlaps).not.toHaveBeenCalled();
  });
});

describe('validateTimeslotAvailability', () => {
  const request = {
    eventDate: '2026-10-01',
    spaceId: 's1',
    startTime: '2026-10-01T09:00:00Z',
    endTime: '2026-10-01T10:00:00Z',
  };

  it('returns available for a valid open window', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    const result = await svc.validateTimeslotAvailability(request);
    expect(result).toEqual({ available: true, conflicts: [] });
    expect(timeslotRepoMock.createTimeslot).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('returns a conflict for overlapping timeslots', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([TIMESLOT]);
    const result = await svc.validateTimeslotAvailability({ ...request, excludeTimeslotId: 't2' });
    expect(result).toEqual({
      available: false,
      conflicts: [{ type: 'TIMESLOT_OVERLAP', message: 'The selected space is already booked during this time.' }],
    });
    expect(timeslotRepoMock.findPotentialOverlaps).toHaveBeenCalledWith(null, 's1', '2026-10-01T09:00:00.000Z', '2026-10-01T10:00:00.000Z', 't2', undefined);
  });

  it('validates multiple requested timeslots with indexed conflicts and no writes', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]).mockResolvedValueOnce([TIMESLOT]);
    const result = await svc.validateTimeslotAvailability({
      eventDate: '2026-10-01',
      spaceId: 's1',
      timeslots: [
        { startTime: '2026-10-01T08:00:00Z', endTime: '2026-10-01T09:00:00Z', capacity: 5 },
        { startTime: '2026-10-01T09:30:00Z', endTime: '2026-10-01T10:30:00Z', capacity: 5 },
      ],
    });
    expect(result).toEqual({
      available: false,
      conflicts: [{ type: 'TIMESLOT_OVERLAP', message: 'The selected space is already booked during this time.', index: 1 }],
    });
    expect(timeslotRepoMock.createTimeslot).not.toHaveBeenCalled();
    expect(eventRepoMock.createEvent).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('detects overlap between multiple requested timeslots', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await svc.validateTimeslotAvailability({
      eventDate: '2026-10-01',
      spaceId: 's1',
      timeslots: [
        { startTime: '2026-10-01T09:00:00Z', endTime: '2026-10-01T11:00:00Z', capacity: 5 },
        { startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T12:00:00Z', capacity: 5 },
      ],
    });
    expect(result.available).toBe(false);
    expect(result.conflicts).toContainEqual(expect.objectContaining({ type: 'FORM_OVERLAP', index: 1 }));
    expect(timeslotRepoMock.createTimeslot).not.toHaveBeenCalled();
  });

  it('returns available without DB check when spaceId is absent (mode=new, space not yet created)', async () => {
    // No space repo or timeslot repo calls expected — the space does not exist yet.
    const result = await svc.validateTimeslotAvailability({ ...request, spaceId: null });
    expect(result).toEqual({ available: true, conflicts: [] });
    expect(spaceRepoMock.findById).not.toHaveBeenCalled();
    expect(timeslotRepoMock.findPotentialOverlaps).not.toHaveBeenCalled();
  });

  it('rejects inactive space', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce({ ...SPACE, is_active: false });
    await expect(svc.validateTimeslotAvailability(request)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects invalid timestamps', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.validateTimeslotAvailability({ ...request, startTime: 'not-a-date' })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects end <= start', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.validateTimeslotAvailability({ ...request, endTime: '2026-10-01T08:00:00Z' })).rejects.toMatchObject({ status: 400 });
  });

  it('accepts timeslots on a different date than eventDate', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    timeslotRepoMock.findPotentialOverlaps.mockResolvedValueOnce([]);
    const res = await svc.validateTimeslotAvailability({ ...request, startTime: '2026-10-02T09:00:00Z', endTime: '2026-10-02T10:00:00Z' });
    expect(res.available).toBe(true);
  });

  it('rejects timeslot when start and end are on different dates', async () => {
    spaceRepoMock.findById.mockResolvedValueOnce(SPACE);
    await expect(svc.validateTimeslotAvailability({ ...request, startTime: '2026-10-01T23:00:00Z', endTime: '2026-10-02T01:00:00Z' })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects invalid eventDate', async () => {
    await expect(svc.validateTimeslotAvailability({ ...request, eventDate: '2026-02-31' })).rejects.toMatchObject({ status: 400 });
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


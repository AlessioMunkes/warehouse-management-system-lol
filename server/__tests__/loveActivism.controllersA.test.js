// ─────────────────────────────────────────────────────────────
// server/__tests__/loveActivism.controllersA.test.js
// Phase 5 targeted controller tests: event + booking.
// Services are mocked; verifies params/body/query/actor wiring,
// success status + envelope, and next(err) forwarding.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
const eventSvc = { createEvent: vi.fn(), getEvent: vi.fn(), listEvents: vi.fn(), updateEvent: vi.fn(), cancelEvent: vi.fn(), completeEvent: vi.fn() };
const bookingSvc = { bookEventSpaceAndTimeslots: vi.fn(), updateEventBooking: vi.fn(), getEventBooking: vi.fn(), getTimeslotsForEvent: vi.fn(), closeTimeslot: vi.fn(), cancelTimeslot: vi.fn(), getCapacitySummary: vi.fn() };
vi.mock('../src/services/loveActivismEvent.service.js', () => ({ default: eventSvc }));
vi.mock('../src/services/eventBooking.service.js', () => ({ default: bookingSvc }));
const eventC = (await import('../src/controllers/loveActivismEvent.controller.js')).default;
const bookingC = (await import('../src/controllers/eventBooking.controller.js')).default;
const ACTOR = { id: 7, role: 'manager' };
const R = () => { const r = {}; r.status = vi.fn().mockReturnValue(r); r.json = vi.fn().mockReturnValue(r); return r; };
beforeEach(() => { vi.clearAllMocks(); });
const fwd = async (fn, call) => { const e = Object.assign(new Error('boom'), { status: 409 }); fn.mockRejectedValueOnce(e); const n = vi.fn(); await call(n); expect(n).toHaveBeenCalledWith(e); };
describe('loveActivismEvent.controller', () => {
  it('createEvent passes (body, actor), 201 + envelope', async () => {
    eventSvc.createEvent.mockResolvedValueOnce({ event_id: 'e1' });
    const req = { body: { eventName: 'D' }, user: ACTOR }; const res = R();
    await eventC.createEvent(req, res, vi.fn());
    expect(eventSvc.createEvent).toHaveBeenCalledWith(req.body, ACTOR);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { event_id: 'e1' } });
  });
  it('listEvents passes query, 200', async () => {
    eventSvc.listEvents.mockResolvedValueOnce([]);
    const res = R();
    await eventC.listEvents({ query: { status: 'DRAFT' } }, res, vi.fn());
    expect(eventSvc.listEvents).toHaveBeenCalledWith({ status: 'DRAFT' });
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('get/update/cancel/complete pass ids + actor', async () => {
    eventSvc.getEvent.mockResolvedValueOnce({}); eventSvc.updateEvent.mockResolvedValueOnce({});
    eventSvc.cancelEvent.mockResolvedValueOnce({}); eventSvc.completeEvent.mockResolvedValueOnce({});
    await eventC.getEvent({ params: { eventId: 'e1' } }, R(), vi.fn());
    await eventC.updateEvent({ params: { eventId: 'e1' }, body: { eventName: 'R' }, user: ACTOR }, R(), vi.fn());
    await eventC.cancelEvent({ params: { eventId: 'e1' }, user: ACTOR }, R(), vi.fn());
    await eventC.completeEvent({ params: { eventId: 'e1' }, user: ACTOR }, R(), vi.fn());
    expect(eventSvc.getEvent).toHaveBeenCalledWith('e1');
    expect(eventSvc.updateEvent).toHaveBeenCalledWith('e1', { eventName: 'R' }, ACTOR);
    expect(eventSvc.cancelEvent).toHaveBeenCalledWith('e1', ACTOR);
    expect(eventSvc.completeEvent).toHaveBeenCalledWith('e1', ACTOR);
  });
  it('forwards errors to next', async () => {
    await fwd(eventSvc.createEvent, (n) => eventC.createEvent({ body: {}, user: ACTOR }, R(), n));
    await fwd(eventSvc.getEvent, (n) => eventC.getEvent({ params: { eventId: 'e1' } }, R(), n));
    await fwd(eventSvc.listEvents, (n) => eventC.listEvents({ query: {} }, R(), n));
    await fwd(eventSvc.updateEvent, (n) => eventC.updateEvent({ params: { eventId: 'e1' }, body: {}, user: ACTOR }, R(), n));
    await fwd(eventSvc.cancelEvent, (n) => eventC.cancelEvent({ params: { eventId: 'e1' }, user: ACTOR }, R(), n));
    await fwd(eventSvc.completeEvent, (n) => eventC.completeEvent({ params: { eventId: 'e1' }, user: ACTOR }, R(), n));
  });
});
describe('eventBooking.controller', () => {
  it('book passes (eventId, body, actor), 201', async () => {
    bookingSvc.bookEventSpaceAndTimeslots.mockResolvedValueOnce([]);
    const req = { params: { eventId: 'e1' }, body: { spaceId: 's1' }, user: ACTOR }; const res = R();
    await bookingC.bookEventSpaceAndTimeslots(req, res, vi.fn());
    expect(bookingSvc.bookEventSpaceAndTimeslots).toHaveBeenCalledWith('e1', req.body, ACTOR);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it('update/get/timeslots/close/cancel/capacity pass ids', async () => {
    bookingSvc.updateEventBooking.mockResolvedValueOnce({}); bookingSvc.getEventBooking.mockResolvedValueOnce({});
    bookingSvc.getTimeslotsForEvent.mockResolvedValueOnce([]); bookingSvc.closeTimeslot.mockResolvedValueOnce({});
    bookingSvc.cancelTimeslot.mockResolvedValueOnce({}); bookingSvc.getCapacitySummary.mockResolvedValueOnce({});
    await bookingC.updateEventBooking({ params: { eventId: 'e1' }, body: { timeslotId: 't1', capacity: 5 }, user: ACTOR }, R(), vi.fn());
    await bookingC.getEventBooking({ params: { eventId: 'e1' } }, R(), vi.fn());
    await bookingC.getTimeslotsForEvent({ params: { eventId: 'e1' } }, R(), vi.fn());
    await bookingC.closeTimeslot({ params: { timeslotId: 't1' }, user: ACTOR }, R(), vi.fn());
    await bookingC.cancelTimeslot({ params: { timeslotId: 't1' }, user: ACTOR }, R(), vi.fn());
    await bookingC.getCapacitySummary({ params: { timeslotId: 't1' } }, R(), vi.fn());
    expect(bookingSvc.updateEventBooking).toHaveBeenCalledWith('e1', { timeslotId: 't1', capacity: 5 }, ACTOR);
    expect(bookingSvc.getEventBooking).toHaveBeenCalledWith('e1');
    expect(bookingSvc.getTimeslotsForEvent).toHaveBeenCalledWith('e1');
    expect(bookingSvc.closeTimeslot).toHaveBeenCalledWith('t1', ACTOR);
    expect(bookingSvc.cancelTimeslot).toHaveBeenCalledWith('t1', ACTOR);
    expect(bookingSvc.getCapacitySummary).toHaveBeenCalledWith('t1');
  });
  it('forwards errors to next', async () => {
    await fwd(bookingSvc.bookEventSpaceAndTimeslots, (n) => bookingC.bookEventSpaceAndTimeslots({ params: { eventId: 'e1' }, body: {}, user: ACTOR }, R(), n));
    await fwd(bookingSvc.updateEventBooking, (n) => bookingC.updateEventBooking({ params: { eventId: 'e1' }, body: {}, user: ACTOR }, R(), n));
    await fwd(bookingSvc.getEventBooking, (n) => bookingC.getEventBooking({ params: { eventId: 'e1' } }, R(), n));
    await fwd(bookingSvc.closeTimeslot, (n) => bookingC.closeTimeslot({ params: { timeslotId: 't1' }, user: ACTOR }, R(), n));
    await fwd(bookingSvc.getCapacitySummary, (n) => bookingC.getCapacitySummary({ params: { timeslotId: 't1' } }, R(), n));
  });
});



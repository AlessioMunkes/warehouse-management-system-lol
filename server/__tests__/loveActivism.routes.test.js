// Phase 5 route tests part 1: mocks + app + auth.
// Uses the same test JWT secret as __tests__/setup.js so tokens signed
// here verify in auth.middleware.js even when the Vitest setup file is
// not loaded (e.g. vitest run from the repo root).
process.env.JWT_SECRET ??= 'test-jwt-secret-do-not-use-in-production';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';
const eventSvc = { createEvent: vi.fn(), getEvent: vi.fn(), listEvents: vi.fn(), updateEvent: vi.fn(), cancelEvent: vi.fn(), completeEvent: vi.fn() };
const bookingSvc = { bookEventSpaceAndTimeslots: vi.fn(), updateEventBooking: vi.fn(), getEventBooking: vi.fn(), getTimeslotsForEvent: vi.fn(), closeTimeslot: vi.fn(), cancelTimeslot: vi.fn(), getCapacitySummary: vi.fn() };
const volSvc = { getBooking: vi.fn(), getBookingsForTimeslot: vi.fn(), getBookingsForEvent: vi.fn(), createWalkIn: vi.fn(), cancelGuestBooking: vi.fn() };
const attSvc = { confirmAttendance: vi.fn(), getAttendanceForBooking: vi.fn(), getAttendanceForTimeslot: vi.fn(), getAttendanceForEvent: vi.fn(), getAttendanceSummary: vi.fn() };
const syncSvc = { getSyncStatus: vi.fn(), retrySync: vi.fn() };
const spaceSvc = { listActiveSpaces: vi.fn() };
vi.mock('../src/services/loveActivismEvent.service.js', () => ({ default: eventSvc }));
vi.mock('../src/services/eventBooking.service.js', () => ({ default: bookingSvc }));
vi.mock('../src/services/volunteerBooking.service.js', () => ({ default: volSvc }));
vi.mock('../src/services/attendance.service.js', () => ({ default: attSvc }));
vi.mock('../src/services/vmsSync.service.js', () => ({ default: syncSvc }));
vi.mock('../src/services/eventSpace.service.js', () => ({ default: spaceSvc }));
const { buildLoveActivismApp } = await import('./helpers/loveActivismApp.js');
const app = buildLoveActivismApp();
const BASE = '/api/love-activism';
const ck = (role) => [`wms_token=${jwt.sign({ id: 1, username: 't', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`];
beforeEach(() => {
  vi.clearAllMocks();
  eventSvc.createEvent.mockResolvedValue({ event_id: 'e1' }); eventSvc.getEvent.mockResolvedValue({ event_id: 'e1' });
  eventSvc.listEvents.mockResolvedValue([]); eventSvc.updateEvent.mockResolvedValue({}); eventSvc.cancelEvent.mockResolvedValue({});
  eventSvc.completeEvent.mockResolvedValue({}); bookingSvc.bookEventSpaceAndTimeslots.mockResolvedValue([]);
  bookingSvc.updateEventBooking.mockResolvedValue({}); bookingSvc.getEventBooking.mockResolvedValue({});
  bookingSvc.getTimeslotsForEvent.mockResolvedValue([]); bookingSvc.closeTimeslot.mockResolvedValue({});
  bookingSvc.cancelTimeslot.mockResolvedValue({}); bookingSvc.getCapacitySummary.mockResolvedValue({});
  volSvc.getBooking.mockResolvedValue({}); volSvc.getBookingsForTimeslot.mockResolvedValue([]);
  volSvc.getBookingsForEvent.mockResolvedValue([]); volSvc.createWalkIn.mockResolvedValue({});
  volSvc.cancelGuestBooking.mockResolvedValue({}); attSvc.confirmAttendance.mockResolvedValue({});
  attSvc.getAttendanceForBooking.mockResolvedValue(null); attSvc.getAttendanceForTimeslot.mockResolvedValue([]);
  attSvc.getAttendanceForEvent.mockResolvedValue([]); attSvc.getAttendanceSummary.mockResolvedValue({});
  syncSvc.getSyncStatus.mockResolvedValue({}); syncSvc.retrySync.mockResolvedValue({});
  spaceSvc.listActiveSpaces.mockResolvedValue([]);
});
const eps = [
  ['get', `${BASE}/spaces`],
  ['post', `${BASE}/events`], ['get', `${BASE}/events`], ['get', `${BASE}/events/e1`],
  ['patch', `${BASE}/events/e1`], ['patch', `${BASE}/events/e1/cancel`], ['patch', `${BASE}/events/e1/complete`],
  ['post', `${BASE}/events/e1/booking`], ['get', `${BASE}/events/e1/booking`], ['patch', `${BASE}/events/e1/booking`],
  ['get', `${BASE}/events/e1/timeslots`], ['patch', `${BASE}/timeslots/t1/close`], ['patch', `${BASE}/timeslots/t1/cancel`],
  ['get', `${BASE}/timeslots/t1/capacity`], ['get', `${BASE}/bookings/b1`], ['get', `${BASE}/events/e1/bookings`],
  ['get', `${BASE}/timeslots/t1/bookings`], ['post', `${BASE}/timeslots/t1/guests`], ['patch', `${BASE}/bookings/b1/cancel`],
  ['put', `${BASE}/bookings/b1/attendance`], ['get', `${BASE}/bookings/b1/attendance`], ['get', `${BASE}/timeslots/t1/attendance`],
  ['get', `${BASE}/events/e1/attendance`], ['get', `${BASE}/timeslots/t1/attendance/summary`],
  ['get', `${BASE}/sync/event_booking/e1`], ['post', `${BASE}/sync/event_booking/e1/retry`],
];
describe('love-activism auth', () => {
  it.each(eps)('%s %s 401 no cookie', async (m, p) => {
    const r = await request(app)[m](p).send({});
    expect(r.status).toBe(401);
  });
  it.each(eps)('%s %s 401 bad token', async (m, p) => {
    const r = await request(app)[m](p).set('Cookie', ['wms_token=nope']).send({});
    expect(r.status).toBe(401);
  });
});
describe('love-activism RBAC', () => {
  it('limits event spaces to manager and admin', async () => {
    expect((await request(app).get(`${BASE}/spaces`).set('Cookie', ck(ROLES.MANAGER))).status).toBe(200);
    expect((await request(app).get(`${BASE}/spaces`).set('Cookie', ck(ROLES.ADMIN))).status).toBe(200);
    expect((await request(app).get(`${BASE}/spaces`).set('Cookie', ck(ROLES.WORKER))).status).toBe(403);
    expect((await request(app).get(`${BASE}/spaces`).set('Cookie', ck('finance'))).status).toBe(403);
  });
  it('manager writes reject a worker or an unassignable role with 403', async () => {
    const r1 = await request(app).post(`${BASE}/events`).set('Cookie', ck(ROLES.WORKER)).send({});
    expect(r1.status).toBe(403);
    const r2 = await request(app).patch(`${BASE}/events/e1`).set('Cookie', ck(ROLES.WORKER)).send({});
    expect(r2.status).toBe(403);
    const r3 = await request(app).post(`${BASE}/events/e1/booking`).set('Cookie', ck('finance')).send({});
    expect(r3.status).toBe(403);
    const r4 = await request(app).post(`${BASE}/sync/event_booking/e1/retry`).set('Cookie', ck(ROLES.WORKER)).send({});
    expect(r4.status).toBe(403);
  });
  it('reads allow every warehouse role; an unassignable role is blocked from staff writes; guest blocked', async () => {
    expect((await request(app).get(`${BASE}/events`).set('Cookie', ck(ROLES.WORKER))).status).toBe(200);
    expect((await request(app).get(`${BASE}/timeslots/t1/capacity`).set('Cookie', ck(ROLES.WORKER))).status).toBe(200);
    expect((await request(app).put(`${BASE}/bookings/b1/attendance`).set('Cookie', ck('finance')).send({ checkedIn: true })).status).toBe(403);
    expect((await request(app).get(`${BASE}/events`).set('Cookie', ck(ROLES.GUEST))).status).toBe(403);
  });
});
describe('love-activism reach + shaping', () => {
  it('GET /spaces returns the standard envelope', async () => {
    const spaces = [{ space_id: 's1', space_name: 'Warehouse floor', is_active: true }];
    spaceSvc.listActiveSpaces.mockResolvedValueOnce(spaces);
    const result = await request(app).get(`${BASE}/spaces`).set('Cookie', ck(ROLES.MANAGER));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, data: spaces });
  });
  it('POST /events 201 envelope; GET e1 passes id', async () => {
    const r = await request(app).post(`${BASE}/events`).set('Cookie', ck(ROLES.MANAGER)).send({ eventName: 'D' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ success: true, data: { event_id: 'e1' } });
    const g = await request(app).get(`${BASE}/events/e1`).set('Cookie', ck(ROLES.MANAGER));
    expect(g.status).toBe(200);
    expect(eventSvc.getEvent).toHaveBeenCalledWith('e1');
  });
  it('POST booking + PUT attendance + walk-in + retry', async () => {
    const b = await request(app).post(`${BASE}/events/e1/booking`).set('Cookie', ck(ROLES.MANAGER)).send({ spaceId: 's1' });
    expect(b.status).toBe(201);
    expect(bookingSvc.bookEventSpaceAndTimeslots).toHaveBeenCalledWith('e1', { spaceId: 's1' }, expect.objectContaining({ role: ROLES.MANAGER }));
    const a = await request(app).put(`${BASE}/bookings/b1/attendance`).set('Cookie', ck(ROLES.WORKER)).send({ checkedIn: true });
    expect(a.status).toBe(200);
    expect(attSvc.confirmAttendance).toHaveBeenCalledWith('b1', { checkedIn: true }, expect.objectContaining({ role: ROLES.WORKER }));
    const w = await request(app).post(`${BASE}/timeslots/t1/guests`).set('Cookie', ck(ROLES.WORKER)).send({ volunteerFirstName: 'J' });
    expect(w.status).toBe(201);
    const s = await request(app).post(`${BASE}/sync/event_booking/e1/retry`).set('Cookie', ck(ROLES.MANAGER)).send({});
    expect(s.status).toBe(200);
    expect(syncSvc.retrySync).toHaveBeenCalledWith('event_booking', 'e1');
  });
  it('404 passthrough; 500 masked; summary not shadowed', async () => {
    eventSvc.getEvent.mockRejectedValueOnce(Object.assign(new Error('Event not found.'), { status: 404 }));
    const r1 = await request(app).get(`${BASE}/events/zz`).set('Cookie', ck(ROLES.MANAGER));
    expect(r1.status).toBe(404);
    expect(r1.body.message).toBe('Event not found.');
    eventSvc.listEvents.mockRejectedValueOnce(new Error('relation "x" does not exist'));
    const r2 = await request(app).get(`${BASE}/events`).set('Cookie', ck(ROLES.MANAGER));
    expect(r2.status).toBe(500);
    expect(r2.body.message).not.toMatch(/relation/);
    const r3 = await request(app).get(`${BASE}/timeslots/t1/attendance/summary`).set('Cookie', ck(ROLES.MANAGER));
    expect(r3.status).toBe(200);
    expect(attSvc.getAttendanceSummary).toHaveBeenCalledWith('t1');
    expect(attSvc.getAttendanceForTimeslot).not.toHaveBeenCalled();
  });
});



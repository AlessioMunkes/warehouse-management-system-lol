// ─────────────────────────────────────────────────────────────
// server/__tests__/volunteerSelfSignOut.test.js
//
// POST /api/volunteers/sign-out — a Love Activist ending their own visit.
//
// The property that matters most here is whose visit gets closed. The id
// must come from the JWT and from nowhere else: if a body or param can
// steer it, any guest could close any other guest's visit, and
// signed_out_at is both the volunteer-hours input and a record of who is
// still in the building.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { authCookie } from './helpers/testAuth.js';

vi.mock('../src/config/db.js', () => ({
  default: { query: vi.fn() },
}));

const signOutVolunteer = vi.fn();
const getVolunteerById = vi.fn();

vi.mock('../src/repositories/volunteer.repository.js', () => ({
  default: {
    signOutVolunteer:  (...args) => signOutVolunteer(...args),
    getVolunteerById:  (...args) => getVolunteerById(...args),
    listGuestLog:      vi.fn(),
  },
}));

const { buildVolunteerApp } = await import('./helpers/volunteerApp.js');
const app = buildVolunteerApp();

const GUEST   = { id: 7, role: 'guest' };
const MANAGER = { id: 2, role: 'manager', username: 'manager001' };
const WORKER  = { id: 3, role: 'warehouse_worker', username: 'worker001' };

const openVisit = {
  id: 7, full_name: 'Thabo Mokoena', source: 'guest_login',
  signed_in_at: '2026-09-15T07:00:00Z', signed_out_at: '2026-09-15T11:00:00Z',
  minutes_on_site: 240,
};

beforeEach(() => {
  vi.clearAllMocks();
  signOutVolunteer.mockResolvedValue(openVisit);
  getVolunteerById.mockResolvedValue(openVisit);
});

describe('POST /api/volunteers/sign-out', () => {
  it('closes the visit named in the token', async () => {
    const res = await request(app)
      .post('/api/volunteers/sign-out')
      .set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(200);
    expect(signOutVolunteer).toHaveBeenCalledWith(7);
  });

  // The whole point of the endpoint.
  it('ignores an id in the body and uses the token id', async () => {
    const res = await request(app)
      .post('/api/volunteers/sign-out')
      .set('Cookie', authCookie(GUEST))
      .send({ id: 1, volunteerId: 1, volunteer_id: 1 });

    expect(res.status).toBe(200);
    expect(signOutVolunteer).toHaveBeenCalledTimes(1);
    expect(signOutVolunteer).toHaveBeenCalledWith(7);
    expect(signOutVolunteer).not.toHaveBeenCalledWith(1);
  });

  it('clears the auth cookie so the token cannot be reused', async () => {
    const res = await request(app)
      .post('/api/volunteers/sign-out')
      .set('Cookie', authCookie(GUEST));

    const setCookie = String(res.headers['set-cookie'] ?? '');
    expect(setCookie).toContain('wms_token=');
    // An expiry in the past, or an explicitly empty value — either is a clear.
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970|wms_token=;/);
  });

  // Pressing logout twice is not an error.
  it('is a no-op when the visit is already closed', async () => {
    signOutVolunteer.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/volunteers/sign-out')
      .set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(getVolunteerById).toHaveBeenCalledWith(7);
  });

  it('still succeeds when the volunteer row is gone', async () => {
    signOutVolunteer.mockResolvedValue(null);
    getVolunteerById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/volunteers/sign-out')
      .set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).post('/api/volunteers/sign-out');

    expect(res.status).toBe(401);
    expect(signOutVolunteer).not.toHaveBeenCalled();
  });

  // Staff have the manager-only /:id/sign-out route. This one is the
  // guest's own exit and nothing else should be able to reach it, or a
  // staff id would be passed to a volunteers lookup.
  it.each([['manager', MANAGER], ['warehouse_worker', WORKER]])(
    'refuses a %s', async (_label, user) => {
      const res = await request(app)
        .post('/api/volunteers/sign-out')
        .set('Cookie', authCookie(user));

      expect(res.status).toBe(403);
      expect(signOutVolunteer).not.toHaveBeenCalled();
    });

  it('returns 500 rather than a stack trace when the write fails', async () => {
    signOutVolunteer.mockRejectedValue(new Error('connection terminated'));

    const res = await request(app)
      .post('/api/volunteers/sign-out')
      .set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('connection terminated');
  });
});

// The manager route must keep working, and must keep taking its id from
// the URL — the two sign-out paths are easy to conflate.
describe('POST /api/volunteers/:id/sign-out (manager route, unchanged)', () => {
  it('closes the visit named in the URL for a manager', async () => {
    const res = await request(app)
      .post('/api/volunteers/4/sign-out')
      .set('Cookie', authCookie(MANAGER));

    expect(res.status).toBe(200);
    expect(signOutVolunteer).toHaveBeenCalledWith(4);
  });

  it('refuses a guest trying to close someone else by id', async () => {
    const res = await request(app)
      .post('/api/volunteers/1/sign-out')
      .set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(403);
    expect(signOutVolunteer).not.toHaveBeenCalled();
  });
});

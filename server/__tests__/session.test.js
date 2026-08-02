// ─────────────────────────────────────────────────────────────
// server/__tests__/session.test.js
//
// GET /api/me is what stops the client trusting its own localStorage
// cache. These tests pin the cases where the token is technically
// valid but the session should not be: no account, deactivated
// account, signed-out volunteer — plus the case where the database
// is down, which must NOT log anyone out.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';

const queryMock = vi.fn();
vi.mock('../src/config/db.js', () => ({
  default: { query: (...args) => queryMock(...args) },
}));

const { buildSessionApp } = await import('./helpers/sessionApp.js');
const app = buildSessionApp();

const tokenFor = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

const cookieFor = (payload) => [`wms_token=${tokenFor(payload)}`];

const STAFF = { id: 1, username: 'JDOE', role: 'warehouse_worker' };
const STAFF_ROW = {
  id: 1, username: 'JDOE', first_name: 'Jane',
  last_name: 'Doe', role: 'warehouse_worker', is_active: true,
};

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [STAFF_ROW] });
});

// ── Authentication ────────────────────────────────────────────
describe('GET /api/me — authentication', () => {
  it('returns 401 with no cookie', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const bad = jwt.sign(STAFF, 'not-the-real-secret');
    const res = await request(app).get('/api/me').set('Cookie', [`wms_token=${bad}`]);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token — this is the whole point', async () => {
    // The bug this endpoint fixes: localStorage says "logged in" long
    // after the 8h cookie has died. The client asks here and is told no.
    const expired = jwt.sign(STAFF, process.env.JWT_SECRET, { expiresIn: '-1h' });
    const res = await request(app).get('/api/me').set('Cookie', [`wms_token=${expired}`]);
    expect(res.status).toBe(401);
  });

  it('never touches the database when unauthenticated', async () => {
    await request(app).get('/api/me');
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── Staff sessions ────────────────────────────────────────────
describe('GET /api/me — staff', () => {
  it('returns the user in the same shape as POST /api/login', async () => {
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(STAFF));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      user: {
        id: 1, username: 'JDOE', firstName: 'Jane',
        lastName: 'Doe', role: 'warehouse_worker',
      },
    });
  });

  it('never leaks the password hash', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...STAFF_ROW, password_hash: 'should-not-appear' }] });
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(STAFF));

    expect(JSON.stringify(res.body)).not.toContain('should-not-appear');
  });

  it('re-reads the role from the database rather than trusting the token', async () => {
    // Token still says warehouse_worker; the row says manager. A role
    // change must take effect on next load, not at token expiry.
    queryMock.mockResolvedValue({ rows: [{ ...STAFF_ROW, role: 'manager' }] });
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(STAFF));

    expect(res.body.user.role).toBe('manager');
  });

  it('rejects a deactivated account and clears the cookie', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...STAFF_ROW, is_active: false }] });
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(STAFF));

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/deactivated/i);
    // Clearing stops the browser re-sending a token we have already
    // rejected on every request for the next 8 hours.
    expect(res.headers['set-cookie'].some((c) => c.startsWith('wms_token=;'))).toBe(true);
  });

  it('rejects a token for a user row that no longer exists', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(STAFF));

    expect(res.status).toBe(401);
  });

  it('looks the user up by id, not by anything client-supplied', async () => {
    await request(app).get('/api/me').set('Cookie', cookieFor(STAFF));

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([1]);
  });
});

// ── Guest sessions ────────────────────────────────────────────
describe('GET /api/me — guests', () => {
  const GUEST = { id: 99, role: 'guest' };

  it('reads guests from volunteers, not users', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 99, full_name: 'Thabo Mokoena', signed_out_at: null }],
    });
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(GUEST));

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 99, firstName: 'Thabo Mokoena', role: 'guest' });

    // A volunteer id looked up in `users` would match an unrelated
    // staff member, so the table matters as much as the id.
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/volunteers/);
    expect(sql).not.toMatch(/FROM users/);
  });

  it('rejects a volunteer who has been signed out', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 99, full_name: 'Thabo Mokoena', signed_out_at: '2026-07-01T17:00:00Z' }],
    });
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(GUEST));

    expect(res.status).toBe(401);
  });
});

// ── Database failure ──────────────────────────────────────────
describe('GET /api/me — database failure', () => {
  it('returns 500 and does NOT clear the cookie', async () => {
    // A blip is not an invalid session. Logging every user out over a
    // brief outage would be worse than the outage itself.
    queryMock.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(STAFF));

    expect(res.status).toBe(500);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('does not leak the raw database error', async () => {
    queryMock.mockRejectedValue(new Error('password authentication failed for user "postgres"'));
    const res = await request(app).get('/api/me').set('Cookie', cookieFor(STAFF));

    expect(res.body.message).not.toMatch(/postgres|password/i);
  });
});
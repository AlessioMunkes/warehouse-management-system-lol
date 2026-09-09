// ─────────────────────────────────────────────────────────────
// server/__tests__/user.routes.test.js
//
// user.service.js is mocked, so these tests exercise only the
// auth / requireRole / validateIntId chain in user.routes.js plus
// user.controller.js's response shaping — same split
// dispatch.routes.test.js uses.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  listUsers:     vi.fn(),
  getUser:       vi.fn(),
  createUser:    vi.fn(),
  updateUser:    vi.fn(),
  setUserStatus: vi.fn(),
};

vi.mock('../src/services/user.service.js', () => ({ default: serviceMock }));

const { buildUserApp } = await import('./helpers/userApp.js');
const app  = buildUserApp();
const BASE = '/api/users';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.admin', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const NON_ADMIN_ROLES = [ROLES.WORKER, ROLES.MANAGER, ROLES.FINANCE];

const USER_BODY = {
  username: 'jdoe', firstName: 'Jane', lastName: 'Doe',
  role: 'warehouse_worker', password: 'longenough1',
};

const SOME_USER = { id: 2, username: 'jdoe', firstName: 'Jane', lastName: 'Doe', role: 'warehouse_worker', isActive: true };

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.listUsers.mockResolvedValue([SOME_USER]);
  serviceMock.getUser.mockResolvedValue(SOME_USER);
  serviceMock.createUser.mockResolvedValue(SOME_USER);
  serviceMock.updateUser.mockResolvedValue(SOME_USER);
  serviceMock.setUserStatus.mockResolvedValue(SOME_USER);
});

// ── Authentication ────────────────────────────────────────────
describe('user routes — authentication', () => {
  const endpoints = [
    ['get',   BASE],
    ['get',   `${BASE}/2`],
    ['post',  BASE],
    ['patch', `${BASE}/2`],
    ['patch', `${BASE}/2/status`],
  ];

  it.each(endpoints)('%s %s returns 401 with no cookie', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const badToken = jwt.sign({ id: 1, role: 'admin' }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request(app).get(BASE).set('Cookie', [`wms_token=${badToken}`]);
    expect(res.status).toBe(401);
  });
});

// ── Authorisation — admin only, on every route ─────────────────
describe('user routes — authorisation', () => {
  it('admin can list users', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.status).toBe(200);
  });

  it.each(NON_ADMIN_ROLES)('%s cannot list users', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(403);
  });

  it.each(NON_ADMIN_ROLES)('%s cannot create a user', async (role) => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(role)).send(USER_BODY);
    expect(res.status).toBe(403);
  });

  it('guest cannot reach any user endpoint', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.GUEST));
    expect(res.status).toBe(403);
  });
});

// ── Parameter validation ────────────────────────────────────────
describe('user routes — parameter validation', () => {
  it.each(['abc', '0', '-1', '1e3'])('rejects id "%s" with a 400', async (id) => {
    const res = await request(app).get(`${BASE}/${id}`).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.status).toBe(400);
    expect(serviceMock.getUser).not.toHaveBeenCalled();
  });
});

// ── Controller response shaping ───────────────────────────────
describe('user controller — responses', () => {
  it('wraps every success in the { success, data } envelope', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.body).toEqual({ success: true, data: [SOME_USER] });
  });

  it('returns 201 for a newly created user', async () => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.ADMIN)).send(USER_BODY);
    expect(res.status).toBe(201);
  });

  it('preserves a 4xx message from the service', async () => {
    serviceMock.createUser.mockRejectedValue(withStatus(409, 'Username already exists.'));
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.ADMIN)).send(USER_BODY);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Username already exists.');
  });

  it('replaces a 5xx message with a safe one', async () => {
    serviceMock.listUsers.mockRejectedValue(new Error('relation "users" does not exist'));
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/relation/);
  });

  it('passes req.user through to createUser (not just its id in isolation)', async () => {
    await request(app).post(BASE).set('Cookie', cookieFor(ROLES.ADMIN, { id: 7 })).send(USER_BODY);
    expect(serviceMock.createUser).toHaveBeenCalledWith(expect.objectContaining(USER_BODY), 7);
  });

  it('passes a 404 from the service straight through', async () => {
    serviceMock.getUser.mockRejectedValue(withStatus(404, 'User not found.'));
    const res = await request(app).get(`${BASE}/999`).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.status).toBe(404);
  });
});

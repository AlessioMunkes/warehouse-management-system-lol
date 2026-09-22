// ─────────────────────────────────────────────────────────────
// server/__tests__/userInvite.routes.test.js
//
// userInvite.service.js is mocked, so these tests exercise the
// auth / requireRole / validateIntId chain plus the public routes
// being reachable with no session at all — same split as
// user.routes.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  createInvite:         vi.fn(),
  listPendingInvites:   vi.fn(),
  resendInvite:         vi.fn(),
  revokeInvite:         vi.fn(),
  resolveInviteByToken: vi.fn(),
  acceptInvite:         vi.fn(),
};

vi.mock('../src/services/userInvite.service.js', () => ({ default: serviceMock }));

const { buildUserInviteApp } = await import('./helpers/userInviteApp.js');
const app  = buildUserInviteApp();
const BASE = '/api/invites';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.admin', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const NON_ADMIN_ROLES = [ROLES.WORKER, ROLES.MANAGER];

const SOME_INVITE = { id: 10, email: 'jane@example.com', role: 'warehouse_worker' };
const SOME_USER   = { id: 900, username: 'janed', first_name: 'Jane', last_name: 'Doe', role: 'warehouse_worker' };

const withStatus = (status, message, reason) =>
  Object.assign(new Error(message), { status, ...(reason ? { reason } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.createInvite.mockResolvedValue({ invite: SOME_INVITE, token: 'rawtoken', url: 'http://x/invite/rawtoken' });
  serviceMock.listPendingInvites.mockResolvedValue([SOME_INVITE]);
  serviceMock.resendInvite.mockResolvedValue({ invite: SOME_INVITE, token: 'rawtoken2', url: 'http://x/invite/rawtoken2' });
  serviceMock.revokeInvite.mockResolvedValue({ ...SOME_INVITE, revoked_at: new Date().toISOString() });
  serviceMock.resolveInviteByToken.mockResolvedValue(SOME_INVITE);
  serviceMock.acceptInvite.mockResolvedValue(SOME_USER);
});

// ── Admin routes: authentication + authorisation ─────────────────
describe('invite routes — admin routes require auth', () => {
  const endpoints = [
    ['get',  BASE],
    ['post', BASE],
    ['post', `${BASE}/10/resend`],
    ['post', `${BASE}/10/revoke`],
  ];

  it.each(endpoints)('%s %s returns 401 with no cookie', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(NON_ADMIN_ROLES)('%s cannot create an invite', async (role) => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(role)).send({ email: 'x@y.com', role: 'warehouse_worker' });
    expect(res.status).toBe(403);
  });

  it.each(NON_ADMIN_ROLES)('%s cannot list pending invites', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(403);
  });

  it('guest cannot reach any admin invite endpoint', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.GUEST));
    expect(res.status).toBe(403);
  });

  it('admin can create an invite', async () => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.ADMIN)).send({ email: 'x@y.com', role: 'warehouse_worker' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { invite: SOME_INVITE, token: 'rawtoken', url: 'http://x/invite/rawtoken' } });
  });

  it('rejects a non-numeric invite id on resend', async () => {
    const res = await request(app).post(`${BASE}/abc/resend`).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.status).toBe(400);
    expect(serviceMock.resendInvite).not.toHaveBeenCalled();
  });
});

// ── Public routes: no session required ────────────────────────
describe('invite routes — public resolve/accept', () => {
  it('resolves a token with no cookie at all', async () => {
    const res = await request(app).get(`${BASE}/rawtoken`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: SOME_INVITE });
  });

  it('accepts an invite with no cookie at all', async () => {
    const res = await request(app).post(`${BASE}/rawtoken/accept`).send({
      username: 'janed', firstName: 'Jane', lastName: 'Doe', password: 'longenough1',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: SOME_USER });
  });

  it('surfaces a 410 with its reason for an expired token', async () => {
    serviceMock.resolveInviteByToken.mockRejectedValue(withStatus(410, 'This invite link has expired.', 'expired'));
    const res = await request(app).get(`${BASE}/expiredtoken`);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('expired');
  });

  it('surfaces a 410 with its reason for a revoked token', async () => {
    serviceMock.resolveInviteByToken.mockRejectedValue(withStatus(410, 'This invite was cancelled.', 'revoked'));
    const res = await request(app).get(`${BASE}/revokedtoken`);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('revoked');
  });

  it('surfaces a 410 with its reason for an already-used token', async () => {
    serviceMock.acceptInvite.mockRejectedValue(withStatus(410, 'This invite link has already been used.', 'accepted'));
    const res = await request(app).post(`${BASE}/usedtoken/accept`).send({});
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('accepted');
  });

  it('passes req.body straight through to acceptInvite unmodified (service owns role-override rejection)', async () => {
    await request(app).post(`${BASE}/rawtoken/accept`).send({
      username: 'janed', firstName: 'Jane', lastName: 'Doe', password: 'longenough1', role: 'admin',
    });
    expect(serviceMock.acceptInvite).toHaveBeenCalledWith('rawtoken', expect.objectContaining({ role: 'admin' }));
  });
});

// ── Controller response shaping ───────────────────────────────
describe('invite controller — responses', () => {
  it('replaces a 5xx message with a safe one', async () => {
    serviceMock.listPendingInvites.mockRejectedValue(new Error('relation "user_invites" does not exist'));
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/relation/);
  });

  it('passes the actor id through to revokeInvite', async () => {
    await request(app).post(`${BASE}/10/revoke`).set('Cookie', cookieFor(ROLES.ADMIN, { id: 7 }));
    expect(serviceMock.revokeInvite).toHaveBeenCalledWith(10, 7);
  });
});

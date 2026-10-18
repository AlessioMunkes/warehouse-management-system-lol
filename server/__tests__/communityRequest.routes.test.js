// ─────────────────────────────────────────────────────────────
// server/__tests__/communityRequest.routes.test.js
//
// The outer door of the benevolent request routes: who gets through
// (auth → requireRole → validateIntId), and that each route hands the
// right things to the service. The service is mocked; its own rules
// (including the claimer / assigned packer check on confirm) are in
// communityRequest.service.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  listRequests: vi.fn(), getRequest: vi.fn(), createRequest: vi.fn(),
  approve: vi.fn(), rechooseItems: vi.fn(), decline: vi.fn(), assign: vi.fn(),
  claim: vi.fn(), confirm: vi.fn(), resolve: vi.fn(), countPending: vi.fn(),
};
vi.mock('../src/services/communityRequest.service.js', () => ({ default: serviceMock }));

const { buildCommunityRequestApp } = await import('./helpers/communityRequestApp.js');
const app  = buildCommunityRequestApp();
const BASE = '/api/community-requests';

const cookieFor = (role, id = 4) => [`wms_token=${jwt.sign(
  { id, username: 'test.user', role }, process.env.JWT_SECRET, { expiresIn: '1h' },
)}`];

const MANAGERS = [ROLES.MANAGER, ROLES.ADMIN];
const ALL      = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

const SOME = { id: 12, outcome: 'approved' };

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of ['approve', 'rechooseItems', 'decline', 'assign', 'claim', 'confirm', 'resolve', 'createRequest']) {
    serviceMock[fn].mockResolvedValue(SOME);
  }
});

// [method, path, body, service function, who may call it]
const ROUTES = [
  ['post',  '/12/approve', { items: [{ productId: 5, quantity: 2 }] }, 'approve',       MANAGERS],
  ['post',  '/12/decline', { reason: 'No' },                           'decline',       MANAGERS],
  ['patch', '/12/assign',  { userId: 9 },                              'assign',        MANAGERS],
  ['put',   '/12/items',   { items: [{ productId: 5, quantity: 2 }] }, 'rechooseItems', MANAGERS],
  ['patch', '/12/resolve', { outcome: 'declined', outcomeNote: 'No' }, 'resolve',       MANAGERS],
  ['patch', '/12/claim',   {},                                         'claim',         ALL],
  ['post',  '/12/confirm', { items: [] },                              'confirm',       ALL],
  ['post',  '/',           { itemsRequested: 'Rice' },                 'createRequest', ALL],
];

describe.each(ROUTES)('%s %s', (method, path, payload, fn, allowed) => {
  it('401 with no cookie', async () => {
    const res = await request(app)[method](`${BASE}${path}`).send(payload);
    expect(res.status).toBe(401);
    expect(serviceMock[fn]).not.toHaveBeenCalled();
  });

  it.each(allowed)('%s gets through, and the service is handed the body and the user', async (role) => {
    const res = await request(app)[method](`${BASE}${path}`).set('Cookie', cookieFor(role, 21)).send(payload);
    expect(res.status).toBeLessThan(300);
    expect(serviceMock[fn]).toHaveBeenCalledTimes(1);
    const args = serviceMock[fn].mock.calls[0];
    expect(args.some((a) => a && a.id === 21 && a.role === role)).toBe(true);
  });

  it.each(ALL.filter((r) => !allowed.includes(r)))('%s is refused with 403', async (role) => {
    const res = await request(app)[method](`${BASE}${path}`).set('Cookie', cookieFor(role)).send(payload);
    expect(res.status).toBe(403);
    expect(serviceMock[fn]).not.toHaveBeenCalled();
  });
});

describe('ids', () => {
  it.each(['approve', 'decline', 'items', 'assign', 'confirm'])('%s rejects a non-numeric id before the service', async (leaf) => {
    const method = { items: 'put', assign: 'patch' }[leaf] ?? 'post';
    const res = await request(app)[method](`${BASE}/abc/${leaf}`).set('Cookie', cookieFor(ROLES.MANAGER)).send({});
    expect(res.status).toBe(400);
  });
});

describe('errors', () => {
  it('passes the service status and message through', async () => {
    serviceMock.approve.mockRejectedValue(Object.assign(new Error('Not enough stock to set aside: Rice.'), { status: 409 }));
    const res = await request(app).post(`${BASE}/12/approve`).set('Cookie', cookieFor(ROLES.MANAGER)).send({ items: [] });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Not enough stock/);
  });
});

describe('reads stay open to every staff role', () => {
  beforeEach(() => {
    serviceMock.listRequests.mockResolvedValue([]);
    serviceMock.getRequest.mockResolvedValue(SOME);
  });
  it.each(ALL)('%s can list and open a request', async (role) => {
    expect((await request(app).get(BASE).set('Cookie', cookieFor(role))).status).toBe(200);
    expect((await request(app).get(`${BASE}/12`).set('Cookie', cookieFor(role))).status).toBe(200);
  });
});

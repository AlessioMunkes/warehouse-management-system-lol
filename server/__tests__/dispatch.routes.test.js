// ─────────────────────────────────────────────────────────────
// server/__tests__/dispatch.routes.test.js
//
// dispatch.service.js is mocked, so these tests exercise only the
// auth / requireRole / validateIntParam chain in dispatch.routes.js
// plus dispatch.controller.js's response shaping.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  getBoard:                vi.fn(),
  getGateView:              vi.fn(),
  collect:                  vi.fn(),
  sweep:                     vi.fn(),
  getDispatchNote:           vi.fn(),
  getNonCollectionHistory:   vi.fn(),
};

vi.mock('../src/services/dispatch.service.js', () => ({ default: serviceMock }));

const { buildDispatchApp } = await import('./helpers/dispatchApp.js');
const app  = buildDispatchApp();
const BASE = '/api/dispatch';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.user', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const ALL_ROLES      = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE];
const DISPATCHERS_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const MANAGERS_UP    = [ROLES.MANAGER, ROLES.ADMIN];
const FINANCE_UP     = [ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE];

const COLLECT_BODY = {
  driverName: 'Sipho Nkosi',
  signature:  'data:image/png;base64,aGVsbG8=',
};

const GATE_VIEW  = { id: 1, slip_status: 'complete', items: [] };
const COLLECTED  = { event: { id: 9 }, replayed: false };

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.getBoard.mockResolvedValue([]);
  serviceMock.getGateView.mockResolvedValue(GATE_VIEW);
  serviceMock.collect.mockResolvedValue(COLLECTED);
  serviceMock.sweep.mockResolvedValue({ flagged: 0, slipIds: [] });
  serviceMock.getDispatchNote.mockResolvedValue({ id: 1, lines: [] });
  serviceMock.getNonCollectionHistory.mockResolvedValue([]);
});

const endpoints = [
  ['get',  BASE],
  ['get',  `${BASE}/1`],
  ['post', `${BASE}/1/collect`],
  ['post', `${BASE}/sweep`],
  ['get',  `${BASE}/non-collections`],
  ['get',  `${BASE}/notes/1`],
];

// ── Authentication ────────────────────────────────────────────
describe('dispatch routes — authentication', () => {
  it.each(endpoints)('%s %s returns 401 with no cookie', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(endpoints)('%s %s returns 401 with an unverifiable token', async (method, path) => {
    const res = await request(app)[method](path)
      .set('Cookie', ['wms_token=not-a-real-jwt']).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ id: 9, role: ROLES.ADMIN }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request(app).get(BASE).set('Cookie', [`wms_token=${forged}`]);
    expect(res.status).toBe(401);
  });
});

// ── Authorisation ─────────────────────────────────────────────
describe('dispatch routes — authorisation', () => {
  it.each(ALL_ROLES)('%s can view the gate board', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(ALL_ROLES)('%s can view a single pallet', async (role) => {
    const res = await request(app).get(`${BASE}/1`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(ALL_ROLES)('%s can read a dispatch note', async (role) => {
    const res = await request(app).get(`${BASE}/notes/1`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(DISPATCHERS_UP)('%s can record a collection', async (role) => {
    const res = await request(app).post(`${BASE}/1/collect`)
      .set('Cookie', cookieFor(role)).send(COLLECT_BODY);
    expect(res.status).toBe(201);
  });

  // Finance reconciles the money side but does not stand at the gate.
  it('finance cannot record a collection', async () => {
    const res = await request(app).post(`${BASE}/1/collect`)
      .set('Cookie', cookieFor(ROLES.FINANCE)).send(COLLECT_BODY);
    expect(res.status).toBe(403);
  });

  it('guest cannot reach any dispatch endpoint', async () => {
    for (const [method, path] of endpoints) {
      const res = await request(app)[method](path)
        .set('Cookie', cookieFor(ROLES.GUEST)).send({});
      expect(res.status).toBe(403);
    }
  });

  it('a worker cannot run the non-collection sweep', async () => {
    const res = await request(app).post(`${BASE}/sweep`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send({});
    expect(res.status).toBe(403);
  });

  it.each(MANAGERS_UP)('%s can run the non-collection sweep', async (role) => {
    const res = await request(app).post(`${BASE}/sweep`)
      .set('Cookie', cookieFor(role)).send({});
    expect(res.status).toBe(200);
  });

  it('a worker cannot view non-collection history', async () => {
    const res = await request(app).get(`${BASE}/non-collections`)
      .set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(403);
  });

  it.each(FINANCE_UP)('%s can view non-collection history', async (role) => {
    const res = await request(app).get(`${BASE}/non-collections`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });
});

// ── Route ordering ────────────────────────────────────────────
// '/sweep', '/non-collections' and '/notes/:eventId' are declared
// before '/:id'. If that order is ever reversed, validateIntId
// rejects '/sweep' and '/non-collections' as bad ids, and '/notes/1'
// gets routed to getGateView with '1' meaning the wrong id space —
// these tests fail instead of the bug reaching production.
describe('dispatch routes — fixed paths are not swallowed by /:id', () => {
  it('routes /sweep to the sweep handler, not to getGateView', async () => {
    await request(app).post(`${BASE}/sweep`).set('Cookie', cookieFor(ROLES.MANAGER)).send({});
    expect(serviceMock.sweep).toHaveBeenCalled();
    expect(serviceMock.getGateView).not.toHaveBeenCalled();
  });

  it('routes /non-collections to the history handler, not to getGateView', async () => {
    await request(app).get(`${BASE}/non-collections`).set('Cookie', cookieFor(ROLES.FINANCE));
    expect(serviceMock.getNonCollectionHistory).toHaveBeenCalled();
    expect(serviceMock.getGateView).not.toHaveBeenCalled();
  });

  it('routes /notes/:eventId to getDispatchNote, not to getGateView', async () => {
    await request(app).get(`${BASE}/notes/1`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(serviceMock.getDispatchNote).toHaveBeenCalled();
    expect(serviceMock.getGateView).not.toHaveBeenCalled();
  });
});

// ── Parameter validation ──────────────────────────────────────
describe('dispatch routes — parameter validation', () => {
  it.each(['abc', '0', '-1', '1e3'])('rejects id "%s" with a 400', async (id) => {
    const res = await request(app).get(`${BASE}/${id}`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(400);
    expect(serviceMock.getGateView).not.toHaveBeenCalled();
  });

  it.each(['abc', '0'])('rejects event id "%s" with a 400', async (eventId) => {
    const res = await request(app).get(`${BASE}/notes/${eventId}`)
      .set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(400);
    expect(serviceMock.getDispatchNote).not.toHaveBeenCalled();
  });
});

// ── Controller response shaping ───────────────────────────────
describe('dispatch controller — responses', () => {
  it('wraps every success in the { success, data } envelope', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('returns 201 for a newly recorded collection', async () => {
    const res = await request(app).post(`${BASE}/1/collect`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send(COLLECT_BODY);
    expect(res.status).toBe(201);
  });

  // A retried collect (idempotencyKey replay) is a success, not a
  // failure — the driver must not be told to sign again.
  it('returns 200, not 201, for a replayed collection', async () => {
    serviceMock.collect.mockResolvedValue({ ...COLLECTED, replayed: true });
    const res = await request(app).post(`${BASE}/1/collect`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send(COLLECT_BODY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('passes req.user through to collect (not just its id)', async () => {
    await request(app).post(`${BASE}/1/collect`)
      .set('Cookie', cookieFor(ROLES.MANAGER, { id: 55 })).send(COLLECT_BODY);
    const [, , userArg] = serviceMock.collect.mock.calls[0];
    expect(userArg).toMatchObject({ id: 55, role: ROLES.MANAGER });
  });

  it('preserves a 4xx message from the service', async () => {
    serviceMock.collect.mockRejectedValue(
      withStatus(400, "The driver's name is required.")
    );
    const res = await request(app).post(`${BASE}/1/collect`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("The driver's name is required.");
  });

  // 5xx messages can carry SQL and column names.
  it('replaces a 5xx message with a safe one', async () => {
    serviceMock.getBoard.mockRejectedValue(
      new Error('relation "dispatch_events" does not exist')
    );
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/relation/);
  });

  it('passes a 404 from the service straight through', async () => {
    serviceMock.getGateView.mockRejectedValue(withStatus(404, 'Picking slip not found.'));
    const res = await request(app).get(`${BASE}/9`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(404);
  });

  it('passes a 409 conflict (e.g. already collected) straight through', async () => {
    serviceMock.collect.mockRejectedValue(
      withStatus(409, 'This pallet has already been collected.')
    );
    const res = await request(app).post(`${BASE}/1/collect`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send(COLLECT_BODY);
    expect(res.status).toBe(409);
  });

  it('passes a 403 override-required error straight through', async () => {
    serviceMock.collect.mockRejectedValue(
      withStatus(403, 'This pallet has not been closed off by the packing team yet. Ask a manager to authorise this collection at the gate.')
    );
    const res = await request(app).post(`${BASE}/1/collect`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send(COLLECT_BODY);
    expect(res.status).toBe(403);
  });
});
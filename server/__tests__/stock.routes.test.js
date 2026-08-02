// ─────────────────────────────────────────────────────────────
// server/__tests__/stock.routes.test.js
//
// stock.service.js is mocked, so these tests exercise only the
// auth / requireRole / validateIntId chain in stock.routes.js plus
// stock.controller.js's response shaping.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  getManifest:    vi.fn(),
  getMovements:   vi.fn(),
  adjustManually: vi.fn(),
};

vi.mock('../src/services/stock.service.js', () => ({ default: serviceMock }));

const { buildStockApp } = await import('./helpers/stockApp.js');
const app  = buildStockApp();
const BASE = '/api/stock';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.user', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const ALL_ROLES   = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE];
const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];

const MANIFEST = [{ id: 1, name: 'Rice', quantity_on_hand: 100, is_shortfall: false }];
const OUTCOME  = { before: 100, after: 125, isShortfall: false, isUnitMismatch: false };
const BODY     = { productId: 1, quantityDelta: 25, unit: 'kg', reason: 'Recount' };

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.getManifest.mockResolvedValue(MANIFEST);
  serviceMock.getMovements.mockResolvedValue([]);
  serviceMock.adjustManually.mockResolvedValue(OUTCOME);
});

const endpoints = [
  ['get',  BASE],
  ['get',  `${BASE}/1/history`],
  ['post', `${BASE}/adjust`],
];

// ── Authentication ────────────────────────────────────────────
describe('stock routes — authentication', () => {
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

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ id: 1, role: ROLES.ADMIN }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app).get(BASE).set('Cookie', [`wms_token=${expired}`]);
    expect(res.status).toBe(401);
  });

  it('never reaches the service when unauthenticated', async () => {
    await request(app).post(`${BASE}/adjust`).send(BODY);
    expect(serviceMock.adjustManually).not.toHaveBeenCalled();
  });
});

// ── Authorisation ─────────────────────────────────────────────
describe('stock routes — role enforcement', () => {
  it.each(ALL_ROLES)('%s can read the manifest', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(ALL_ROLES)('%s can read a product\'s movement history', async (role) => {
    const res = await request(app).get(`${BASE}/1/history`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(MANAGERS_UP)('%s can adjust stock manually', async (role) => {
    const res = await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(role)).send(BODY);
    expect(res.status).toBe(200);
  });

  it.each([ROLES.WORKER, ROLES.FINANCE])('%s cannot adjust stock manually', async (role) => {
    // Manual adjustment rewrites the ledger — managers and admins only.
    const res = await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(role)).send(BODY);

    expect(res.status).toBe(403);
    expect(serviceMock.adjustManually).not.toHaveBeenCalled();
  });

  it('refuses an unrecognised role rather than defaulting to allow', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.GUEST));
    expect(res.status).toBe(403);
  });

  it('refuses a token with no role claim', async () => {
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await request(app).get(BASE).set('Cookie', [`wms_token=${token}`]);
    expect(res.status).toBe(403);
  });
});

// ── Route ordering ────────────────────────────────────────────
describe('stock routes — /adjust is not shadowed', () => {
  it('POST /adjust reaches the adjuster', async () => {
    await request(app).post(`${BASE}/adjust`).set('Cookie', cookieFor(ROLES.MANAGER)).send(BODY);
    expect(serviceMock.adjustManually).toHaveBeenCalledTimes(1);
  });

  it('GET / and GET /:id/history are distinct handlers', async () => {
    await request(app).get(BASE).set('Cookie', cookieFor(ROLES.WORKER));
    expect(serviceMock.getManifest).toHaveBeenCalledTimes(1);
    expect(serviceMock.getMovements).not.toHaveBeenCalled();

    vi.clearAllMocks();
    serviceMock.getMovements.mockResolvedValue([]);
    await request(app).get(`${BASE}/1/history`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(serviceMock.getMovements).toHaveBeenCalledTimes(1);
    expect(serviceMock.getManifest).not.toHaveBeenCalled();
  });
});

// ── Argument passing ──────────────────────────────────────────
describe('stock routes — controller passes the right arguments', () => {
  it('gives the service a numeric product id after validateIntId', async () => {
    await request(app).get(`${BASE}/7/history`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(serviceMock.getMovements).toHaveBeenCalledWith(7);
  });

  it('passes only the acting user\'s id, not the whole user object', async () => {
    await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(ROLES.MANAGER, { id: 20 })).send(BODY);

    expect(serviceMock.adjustManually).toHaveBeenCalledWith(BODY, 20);
  });

  it('ignores a performedBy the client tries to set', async () => {
    await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(ROLES.MANAGER, { id: 20 }))
      .send({ ...BODY, performedBy: 999 });

    expect(serviceMock.adjustManually.mock.calls[0][1]).toBe(20);
  });
});

// ── Response shaping ──────────────────────────────────────────
describe('stock routes — response envelope', () => {
  it('wraps the manifest in { success, data }', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.body).toEqual({ success: true, data: MANIFEST });
  });

  it('returns 200 for an adjustment, not 201 — nothing was created', async () => {
    const res = await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send(BODY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: OUTCOME });
  });

  it('surfaces a shortfall as a successful 200 with a flag', async () => {
    // A negative balance is information for a manager, not a failure.
    serviceMock.adjustManually.mockResolvedValueOnce({ ...OUTCOME, after: -3, isShortfall: true });
    const res = await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.data.isShortfall).toBe(true);
  });

  it('surfaces a unit mismatch as a successful 200 with a flag', async () => {
    serviceMock.adjustManually.mockResolvedValueOnce({ ...OUTCOME, isUnitMismatch: true });
    const res = await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.data.isUnitMismatch).toBe(true);
  });
});

// ── ID validation ─────────────────────────────────────────────
describe('stock routes — validateIntId on the history route', () => {
  it.each(['abc', '0', '-1', '1.5'])('rejects GET /%s/history with 400', async (id) => {
    const res = await request(app).get(`${BASE}/${id}/history`)
      .set('Cookie', cookieFor(ROLES.WORKER));

    expect(res.status).toBe(400);
    expect(serviceMock.getMovements).not.toHaveBeenCalled();
  });
});

// ── Status mapping ────────────────────────────────────────────
describe('stock routes — error handling', () => {
  it('honours a status the service attaches', async () => {
    serviceMock.getMovements.mockRejectedValueOnce(withStatus(404, 'Product not found.'));
    const res = await request(app).get(`${BASE}/1/history`).set('Cookie', cookieFor(ROLES.WORKER));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Product not found.' });
  });

  it('falls back to 500 when no status is attached', async () => {
    serviceMock.getManifest.mockRejectedValueOnce(new Error('connection terminated'));
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(500);
  });

  it.each([
    ['getManifest',    'get',  BASE,                  'Failed to retrieve stock manifest.'],
    ['getMovements',   'get',  `${BASE}/1/history`,   'Failed to retrieve stock movement history.'],
    ['adjustManually', 'post', `${BASE}/adjust`,      'Failed to adjust stock.'],
  ])('masks a raw %s failure behind a generic message', async (fn, method, path, expected) => {
    serviceMock[fn].mockRejectedValueOnce(
      new Error('password authentication failed for user "postgres"')
    );
    const res = await request(app)[method](path)
      .set('Cookie', cookieFor(ROLES.ADMIN)).send(BODY);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe(expected);
    expect(res.body.message).not.toMatch(/postgres|password/i);
  });
});

// ── Validation passthrough (was DEFECT G/H) ───────────────────
// The service is mocked in this file, so these can only assert the
// controller half of the contract: that a status the service attaches
// survives to the client with its message intact. The service half —
// that fail() actually attaches 400/404 — lives in
// stock.service.test.js under 'error contract with the controller'.
// Both halves have to hold, or the manager gets a blank error.
describe('validation errors reach the client intact', () => {
  const validationCases = [
    ['a missing reason',   'A reason is required for manual adjustments.'],
    ['a zero quantity',    'A non-zero quantity change is required.'],
    ['a missing product',  'Product is required.'],
  ];

  const withStatus = (status, message) =>
    Object.assign(new Error(message), { status });

  it.each(validationCases)('%s returns 400 with the reason shown', async (_label, message) => {
    serviceMock.adjustManually.mockRejectedValueOnce(withStatus(400, message));

    const res = await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it('an unknown product returns 404, not 500', async () => {
    serviceMock.adjustManually.mockRejectedValueOnce(withStatus(404, 'Product not found.'));

    const res = await request(app).post(`${BASE}/adjust`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send(BODY);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Product not found.');
  });
});
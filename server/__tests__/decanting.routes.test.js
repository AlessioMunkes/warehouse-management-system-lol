// ─────────────────────────────────────────────────────────────
// server/__tests__/decanting.routes.test.js
//
// decanting.service.js is mocked so these tests exercise only the
// auth/requireRole/validateIntId middleware chain in
// decanting.routes.js plus decanting.controller.js's request
// handling and status-code mapping. Split-calculation correctness
// belongs in a separate unit test against the real service.
//
// Because the service is mocked, bad-input tests here do NOT test
// validation — validation lives inside the service. What they DO
// test is that the controller maps a thrown validation message to
// 400 rather than 500. Real validation is a service unit test.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

// ── Service mock ──────────────────────────────────────────────
// Keys match the methods decanting.controller.js actually calls.
const decantingServiceMock = {
  calculateDecantingPlan:     vi.fn(),   // NOTE: sync in the controller
  recordDecanting:            vi.fn(),
  getDecantingRecords:        vi.fn(),
  getDecantingById:           vi.fn(),
  getWeeklyProcurementReport: vi.fn(),
  exportDecantingSheet:       vi.fn(),
};

vi.mock('../src/services/decanting.service.js', () => ({ default: decantingServiceMock }));

const { buildDecantingApp } = await import('./helpers/decantingApp.js');
const app = buildDecantingApp();

const BASE = '/api/decanting';

// ── Cookie forging ────────────────────────────────────────────
const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.user', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

// ── Role groups, mirroring decanting.routes.js ────────────────
const ALL_ROLES    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE];
const RECEIVERS_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];

const PLAN   = { product: 'Rice', bags: [{ sizeKg: 2, count: 12 }], wastageKg: 0.3 };
const RECORD = { id: 1, product_id: 1, wastage_kg: 0.3 };

beforeEach(() => {
  vi.clearAllMocks();
  decantingServiceMock.calculateDecantingPlan.mockReturnValue(PLAN);
  decantingServiceMock.recordDecanting.mockResolvedValue(RECORD);
  decantingServiceMock.getDecantingRecords.mockResolvedValue([RECORD]);
  decantingServiceMock.getDecantingById.mockResolvedValue(RECORD);
  decantingServiceMock.getWeeklyProcurementReport.mockResolvedValue({ totalWastageKg: 1.2 });
  decantingServiceMock.exportDecantingSheet.mockResolvedValue({
    filename: 'decanting-sheet-1.csv',
    csv: 'product,bag_size_kg,count\nRice,2,12\n',
  });
});

// ── Authentication ────────────────────────────────────────────
describe('decanting routes — authentication', () => {
  const endpoints = [
    ['post', `${BASE}/calculate`],
    ['get',  `${BASE}/report`],
    ['get',  BASE],
    ['post', BASE],
    ['get',  `${BASE}/1`],
    ['get',  `${BASE}/1/export`],
  ];

  it.each(endpoints)('%s %s returns 401 with no cookie', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(endpoints)('%s %s returns 401 with an unverifiable token', async (method, path) => {
    const res = await request(app)[method](path)
      .set('Cookie', ['wms_token=not-a-real-jwt'])
      .send({});
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ id: 99, role: ROLES.ADMIN }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request(app).get(BASE).set('Cookie', [`wms_token=${forged}`]);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      { id: 1, role: ROLES.ADMIN }, process.env.JWT_SECRET, { expiresIn: '-1s' }
    );
    const res = await request(app).get(BASE).set('Cookie', [`wms_token=${expired}`]);
    expect(res.status).toBe(401);
  });

  it('never reaches the service when unauthenticated', async () => {
    await request(app).post(BASE).send({ productId: 1 });
    expect(decantingServiceMock.recordDecanting).not.toHaveBeenCalled();
  });
});

// ── Authorisation ─────────────────────────────────────────────
describe('decanting routes — role enforcement', () => {
  it.each(ALL_ROLES)('%s can list decanting records', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(ALL_ROLES)('%s can run a calculation preview', async (role) => {
    // /calculate is deliberately open to finance — it writes nothing.
    const res = await request(app)
      .post(`${BASE}/calculate`)
      .set('Cookie', cookieFor(role))
      .send({ productId: 1, actualWeightKg: 25 });
    expect(res.status).toBe(200);
  });

  it.each(RECEIVERS_UP)('%s can record a completed decanting run', async (role) => {
    const res = await request(app)
      .post(BASE)
      .set('Cookie', cookieFor(role))
      .send({ productId: 1, actualWeightKg: 25 });
    expect(res.status).toBe(201);
  });

  it('finance is refused the write path with 403, not 401', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Cookie', cookieFor(ROLES.FINANCE))
      .send({ productId: 1, actualWeightKg: 25 });

    expect(res.status).toBe(403);
    expect(decantingServiceMock.recordDecanting).not.toHaveBeenCalled();
  });

  it('rejects an unrecognised role rather than defaulting to allow', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor('guest'));
    expect(res.status).toBe(403);
  });

  it('rejects a token with no role claim at all', async () => {
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await request(app).get(BASE).set('Cookie', [`wms_token=${token}`]);
    expect(res.status).toBe(403);
  });
});

// ── Response envelope ─────────────────────────────────────────
describe('decanting routes — response envelope', () => {
  it('wraps list results in { success, data }', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.WORKER));

    expect(res.body).toEqual({ success: true, data: [RECORD] });
  });

  it('returns the calculated plan under data, not an empty object', async () => {
    // Guards the un-awaited service call in calculatePlan: if
    // calculateDecantingPlan is ever made async, res.json would
    // serialise a bare Promise to {} and this assertion catches it.
    const res = await request(app)
      .post(`${BASE}/calculate`)
      .set('Cookie', cookieFor(ROLES.WORKER))
      .send({ productId: 1, actualWeightKg: 25 });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(PLAN);
    expect(Object.keys(res.body.data).length).toBeGreaterThan(0);
  });

  it('returns 201 with the created record on write', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Cookie', cookieFor(ROLES.WORKER))
      .send({ productId: 1, actualWeightKg: 25 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: RECORD });
  });
});

// ── Argument passing ──────────────────────────────────────────
describe('decanting routes — controller passes the right arguments', () => {
  it('takes the acting user from the JWT, never from the body', async () => {
    // A worker forging userId in the payload must not be able to
    // attribute a decanting run to someone else.
    await request(app)
      .post(BASE)
      .set('Cookie', cookieFor(ROLES.WORKER, { id: 42 }))
      .send({ productId: 1, actualWeightKg: 25, userId: 999 });

    expect(decantingServiceMock.recordDecanting).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 1 }),
      42
    );
  });

  it('passes the range query through to the service', async () => {
    await request(app).get(`${BASE}?range=week`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(decantingServiceMock.getDecantingRecords).toHaveBeenCalledWith('week');
  });

  it('defaults the range to all when the query is absent', async () => {
    await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(decantingServiceMock.getDecantingRecords).toHaveBeenCalledWith('all');
  });

  it('passes weekOf through to the weekly report', async () => {
    await request(app)
      .get(`${BASE}/report?weekOf=2026-07-27`)
      .set('Cookie', cookieFor(ROLES.FINANCE));

    expect(decantingServiceMock.getWeeklyProcurementReport).toHaveBeenCalledWith('2026-07-27');
  });

  it('receives the id as a number, not a string, after validateIntId', async () => {
    await request(app).get(`${BASE}/7`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(decantingServiceMock.getDecantingById).toHaveBeenCalledWith(7);
  });
});

// ── Route ordering ────────────────────────────────────────────
describe('decanting routes — static paths are not shadowed by /:id', () => {
  it('GET /report hits the report handler, not getById', async () => {
    // If /:id is ever moved above /report, validateIntId would
    // reject "report" with a 400 and this fails loudly.
    const res = await request(app).get(`${BASE}/report`).set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(200);
    expect(decantingServiceMock.getWeeklyProcurementReport).toHaveBeenCalledTimes(1);
    expect(decantingServiceMock.getDecantingById).not.toHaveBeenCalled();
  });

  it('POST /calculate hits the calculator, not the record writer', async () => {
    await request(app)
      .post(`${BASE}/calculate`)
      .set('Cookie', cookieFor(ROLES.WORKER))
      .send({ productId: 1, actualWeightKg: 25 });

    expect(decantingServiceMock.calculateDecantingPlan).toHaveBeenCalledTimes(1);
    expect(decantingServiceMock.recordDecanting).not.toHaveBeenCalled();
  });
});

// ── ID validation ─────────────────────────────────────────────
describe('decanting routes — validateIntId', () => {
  const badIds = ['abc', '0', '-1', '1.5', '%2e%2e%2f'];

  it.each(badIds)('rejects GET /%s with 400 before the service', async (id) => {
    const res = await request(app).get(`${BASE}/${id}`).set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(400);
    expect(decantingServiceMock.getDecantingById).not.toHaveBeenCalled();
  });

  it.each(badIds)('rejects GET /%s/export with 400 before the service', async (id) => {
    const res = await request(app)
      .get(`${BASE}/${id}/export`)
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(400);
    expect(decantingServiceMock.exportDecantingSheet).not.toHaveBeenCalled();
  });
});

// ── Status-code mapping ───────────────────────────────────────
describe('decanting routes — error to status mapping', () => {
  const validationMessages = [
    'Product is required.',
    'Actual weight must be greater than zero.',
    'Wastage cannot exceed the bulk bag weight.',
  ];

  it.each(validationMessages)('maps "%s" to 400 on write', async (message) => {
    decantingServiceMock.recordDecanting.mockRejectedValueOnce(new Error(message));

    const res = await request(app)
      .post(BASE)
      .set('Cookie', cookieFor(ROLES.WORKER))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message });
  });

  it.each(validationMessages)('maps "%s" to 400 on calculate', async (message) => {
    decantingServiceMock.calculateDecantingPlan.mockImplementationOnce(() => {
      throw new Error(message);
    });

    const res = await request(app)
      .post(`${BASE}/calculate`)
      .set('Cookie', cookieFor(ROLES.WORKER))
      .send({});

    expect(res.status).toBe(400);
  });

  it('maps an unrecognised failure to 500', async () => {
    decantingServiceMock.recordDecanting.mockRejectedValueOnce(
      new Error('connection terminated unexpectedly')
    );

    const res = await request(app)
      .post(BASE)
      .set('Cookie', cookieFor(ROLES.WORKER))
      .send({ productId: 1, actualWeightKg: 25 });

    expect(res.status).toBe(500);
  });

  it('maps a missing record to 404 on read', async () => {
    decantingServiceMock.getDecantingById.mockRejectedValueOnce(
      new Error('Decanting record not found.')
    );

    const res = await request(app).get(`${BASE}/999`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(404);
  });

  it('maps a missing record to 404 on export', async () => {
    decantingServiceMock.exportDecantingSheet.mockRejectedValueOnce(
      new Error('Decanting record not found.')
    );

    const res = await request(app)
      .get(`${BASE}/999/export`)
      .set('Cookie', cookieFor(ROLES.WORKER));

    expect(res.status).toBe(404);
  });

  it('does not leak internal error detail on the list endpoint', async () => {
    decantingServiceMock.getDecantingRecords.mockRejectedValueOnce(
      new Error('password authentication failed for user "postgres"')
    );

    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.WORKER));

    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/postgres|password/i);
  });
});

// ── CSV export ────────────────────────────────────────────────
describe('decanting routes — CSV export', () => {
  it('serves CSV with the right content type', async () => {
    const res = await request(app)
      .get(`${BASE}/1/export`)
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('sets the filename the service supplied as a download', async () => {
    const res = await request(app)
      .get(`${BASE}/1/export`)
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.headers['content-disposition'])
      .toBe('attachment; filename="decanting-sheet-1.csv"');
  });

  it('returns the raw CSV body, not a JSON envelope', async () => {
    const res = await request(app)
      .get(`${BASE}/1/export`)
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.text).toContain('product,bag_size_kg,count');
    expect(res.text).not.toContain('"success"');
  });
});
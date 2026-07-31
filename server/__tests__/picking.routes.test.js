// ─────────────────────────────────────────────────────────────
// server/__tests__/picking.routes.test.js
//
// picking.service.js is mocked, so these tests exercise only the
// auth / requireRole / validateIntId chain in picking.routes.js
// plus picking.controller.js's response shaping. Business rules
// are covered in picking.service.test.js.
//
// The controller reads err.status rather than string-matching on
// err.message (unlike decanting.controller.js), so the mapping
// tests below drive it by attaching .status to a thrown error.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  getSlips:      vi.fn(),
  getSlipById:   vi.fn(),
  generateSlips: vi.fn(),
  createSlip:    vi.fn(),
  assignSlip:    vi.fn(),
  confirmItem:   vi.fn(),
  flagItem:      vi.fn(),
  completeSlip:  vi.fn(),
};

vi.mock('../src/services/picking.service.js', () => ({ default: serviceMock }));

const { buildPickingApp } = await import('./helpers/pickingApp.js');
const app  = buildPickingApp();
const BASE = '/api/picking';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.user', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const ALL_ROLES   = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN, ROLES.FINANCE];
const PACKERS_UP  = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const MANAGERS_UP = [ROLES.MANAGER, ROLES.ADMIN];

const SLIP = { id: 1, status: 'in_progress' };
const ITEM = { id: 5, status: 'confirmed' };

// Errors the service raises carry a .status the controller reads.
const failWith = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.getSlips.mockResolvedValue([SLIP]);
  serviceMock.getSlipById.mockResolvedValue(SLIP);
  serviceMock.generateSlips.mockResolvedValue({ created: 12 });
  serviceMock.createSlip.mockResolvedValue({ slipId: 99, itemCount: 7 });
  serviceMock.assignSlip.mockResolvedValue(SLIP);
  serviceMock.confirmItem.mockResolvedValue(ITEM);
  serviceMock.flagItem.mockResolvedValue(ITEM);
  serviceMock.completeSlip.mockResolvedValue(SLIP);
});

const endpoints = [
  ['get',  BASE],
  ['post', BASE],
  ['post', `${BASE}/generate`],
  ['get',  `${BASE}/1`],
  ['post', `${BASE}/1/assign`],
  ['post', `${BASE}/1/complete`],
  ['post', `${BASE}/1/items/5/confirm`],
  ['post', `${BASE}/1/items/5/flag`],
];

// ── Authentication ────────────────────────────────────────────
describe('picking routes — authentication', () => {
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
    await request(app).post(`${BASE}/generate`).send({});
    expect(serviceMock.generateSlips).not.toHaveBeenCalled();
  });
});

// ── Authorisation ─────────────────────────────────────────────
describe('picking routes — role enforcement', () => {
  it.each(ALL_ROLES)('%s can read the board', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(ALL_ROLES)('%s can read a single slip', async (role) => {
    const res = await request(app).get(`${BASE}/1`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(MANAGERS_UP)('%s can generate the week\'s slips', async (role) => {
    const res = await request(app).post(`${BASE}/generate`)
      .set('Cookie', cookieFor(role)).send({ dispatchDate: '2026-08-03', cohort: 'week1' });
    expect(res.status).toBe(201);
  });

  it.each([ROLES.WORKER, ROLES.FINANCE])('%s cannot generate slips', async (role) => {
    const res = await request(app).post(`${BASE}/generate`)
      .set('Cookie', cookieFor(role)).send({});
    expect(res.status).toBe(403);
    expect(serviceMock.generateSlips).not.toHaveBeenCalled();
  });

  it.each([ROLES.WORKER, ROLES.FINANCE])('%s cannot create an ad-hoc slip', async (role) => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(role)).send({});
    expect(res.status).toBe(403);
    expect(serviceMock.createSlip).not.toHaveBeenCalled();
  });

  it.each(PACKERS_UP)('%s can claim a slip', async (role) => {
    const res = await request(app).post(`${BASE}/1/assign`)
      .set('Cookie', cookieFor(role)).send({});
    expect(res.status).toBe(200);
  });

  it.each(['assign', 'complete'])('finance cannot %s a slip', async (action) => {
    const res = await request(app).post(`${BASE}/1/${action}`)
      .set('Cookie', cookieFor(ROLES.FINANCE)).send({});
    expect(res.status).toBe(403);
  });

  it.each(['confirm', 'flag'])('finance cannot %s a line', async (action) => {
    const res = await request(app).post(`${BASE}/1/items/5/${action}`)
      .set('Cookie', cookieFor(ROLES.FINANCE)).send({});
    expect(res.status).toBe(403);
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
describe('picking routes — /generate is not shadowed by /:id', () => {
  it('POST /generate reaches the generator', async () => {
    await request(app).post(`${BASE}/generate`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({ dispatchDate: '2026-08-03', cohort: 'week1' });

    expect(serviceMock.generateSlips).toHaveBeenCalledTimes(1);
    expect(serviceMock.createSlip).not.toHaveBeenCalled();
  });

  it('POST / creates an ad-hoc slip, not a bulk run', async () => {
    await request(app).post(BASE)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({ ecdId: 3 });

    expect(serviceMock.createSlip).toHaveBeenCalledTimes(1);
    expect(serviceMock.generateSlips).not.toHaveBeenCalled();
  });
});

// ── Argument passing ──────────────────────────────────────────
describe('picking routes — controller passes the right arguments', () => {
  it('hands the whole user object to getSlips, not just the id', async () => {
    // The service needs the role to decide whether "mine" filters.
    await request(app).get(`${BASE}?mine=true`)
      .set('Cookie', cookieFor(ROLES.WORKER, { id: 42 }));

    expect(serviceMock.getSlips).toHaveBeenCalledWith(
      { mine: 'true' },
      expect.objectContaining({ id: 42, role: ROLES.WORKER })
    );
  });

  it('forwards the query string verbatim', async () => {
    await request(app).get(`${BASE}?dispatchDate=2026-08-03&cohort=week1&status=pending`)
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(serviceMock.getSlips).toHaveBeenCalledWith(
      { dispatchDate: '2026-08-03', cohort: 'week1', status: 'pending' },
      expect.anything()
    );
  });

  it('passes the acting user to the generator', async () => {
    await request(app).post(`${BASE}/generate`)
      .set('Cookie', cookieFor(ROLES.MANAGER, { id: 20 }))
      .send({ dispatchDate: '2026-08-03', cohort: 'week1' });

    expect(serviceMock.generateSlips).toHaveBeenCalledWith(
      { dispatchDate: '2026-08-03', cohort: 'week1' },
      expect.objectContaining({ id: 20 })
    );
  });

  it('passes slipId, itemId, body and user to confirmItem in that order', async () => {
    await request(app).post(`${BASE}/1/items/5/confirm`)
      .set('Cookie', cookieFor(ROLES.WORKER, { id: 42 }))
      .send({ packedQuantity: 3 });

    expect(serviceMock.confirmItem).toHaveBeenCalledWith(
      1, '5', { packedQuantity: 3 }, expect.objectContaining({ id: 42 })
    );
  });

  it('passes the flag reason through', async () => {
    await request(app).post(`${BASE}/1/items/5/flag`)
      .set('Cookie', cookieFor(ROLES.WORKER))
      .send({ flagReason: 'Only 2 crates left' });

    expect(serviceMock.flagItem).toHaveBeenCalledWith(
      1, '5', { flagReason: 'Only 2 crates left' }, expect.anything()
    );
  });

  it('gives the service a numeric slip id after validateIntId', async () => {
    await request(app).get(`${BASE}/7`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(serviceMock.getSlipById).toHaveBeenCalledWith(7);
  });
});

// ── Response shaping ──────────────────────────────────────────
describe('picking routes — response envelope', () => {
  it('wraps the board in { success, data }', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.body).toEqual({ success: true, data: [SLIP] });
  });

  it('returns 201 for both slip-creating endpoints', async () => {
    const gen = await request(app).post(`${BASE}/generate`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({});
    const adhoc = await request(app).post(BASE)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({});

    expect(gen.status).toBe(201);
    expect(adhoc.status).toBe(201);
  });

  it('returns 200 for the pack actions', async () => {
    for (const path of ['/1/assign', '/1/complete', '/1/items/5/confirm', '/1/items/5/flag']) {
      const res = await request(app).post(`${BASE}${path}`)
        .set('Cookie', cookieFor(ROLES.WORKER)).send({});
      expect(res.status).toBe(200);
    }
  });
});

// ── ID validation ─────────────────────────────────────────────
describe('picking routes — validateIntId on :id', () => {
  const badIds = ['abc', '0', '-1', '1.5'];

  it.each(badIds)('rejects GET /%s with 400 before the service', async (id) => {
    const res = await request(app).get(`${BASE}/${id}`).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(400);
    expect(serviceMock.getSlipById).not.toHaveBeenCalled();
  });

  it.each(badIds)('rejects POST /%s/assign with 400', async (id) => {
    const res = await request(app).post(`${BASE}/${id}/assign`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send({});
    expect(res.status).toBe(400);
    expect(serviceMock.assignSlip).not.toHaveBeenCalled();
  });

  it.each(badIds)('rejects POST /%s/complete with 400', async (id) => {
    const res = await request(app).post(`${BASE}/${id}/complete`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send({});
    expect(res.status).toBe(400);
  });
});

// ── Status mapping ────────────────────────────────────────────
describe('picking routes — service status is honoured', () => {
  const cases = [
    [400, 'Cohort must be week1 or week2.'],
    [403, 'Only managers can generate picking slips.'],
    [404, 'Picking slip not found.'],
    [409, 'This pallet is already being packed by someone else.'],
    [422, '3 item(s) still need to be confirmed or flagged.'],
  ];

  it.each(cases)('passes %i straight through from the service', async (status, message) => {
    serviceMock.getSlipById.mockRejectedValueOnce(failWith(status, message));
    const res = await request(app).get(`${BASE}/1`).set('Cookie', cookieFor(ROLES.WORKER));

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ success: false, message });
  });

  it('shows the client-facing message for a 4xx', async () => {
    serviceMock.completeSlip.mockRejectedValueOnce(
      failWith(422, '3 item(s) still need to be confirmed or flagged before this pallet can be closed.')
    );
    const res = await request(app).post(`${BASE}/1/complete`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send({});

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/3 item\(s\)/);
  });

  it('falls back to 500 for an error with no status', async () => {
    serviceMock.getSlips.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(500);
  });

  it('does not leak internal detail on a 500', async () => {
    serviceMock.getSlips.mockRejectedValueOnce(
      new Error('password authentication failed for user "postgres"')
    );
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.WORKER));

    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/postgres|password/i);
    expect(res.body.message).toBe('Failed to retrieve picking slips.');
  });

  it.each([
    ['getSlipById',   'get',  `${BASE}/1`,                  'Failed to retrieve picking slip.'],
    ['generateSlips', 'post', `${BASE}/generate`,           'Failed to generate picking slips.'],
    ['createSlip',    'post', BASE,                         'Failed to create picking slip.'],
    ['assignSlip',    'post', `${BASE}/1/assign`,           'Failed to assign picking slip.'],
    ['confirmItem',   'post', `${BASE}/1/items/5/confirm`,  'Failed to confirm item.'],
    ['flagItem',      'post', `${BASE}/1/items/5/flag`,     'Failed to flag item.'],
    ['completeSlip',  'post', `${BASE}/1/complete`,         'Failed to complete picking slip.'],
  ])('masks a raw %s failure with a generic message', async (fn, method, path, expected) => {
    serviceMock[fn].mockRejectedValueOnce(new Error('relation "picking_slips" does not exist'));
    const res = await request(app)[method](path)
      .set('Cookie', cookieFor(ROLES.ADMIN)).send({});

    expect(res.status).toBe(500);
    expect(res.body.message).toBe(expected);
  });
});

// ── Known defects ─────────────────────────────────────────────
describe.skip('known defects — un-skip once fixed', () => {
  it.each(['confirm', 'flag'])(
    'DEFECT D: :itemId is never validated as an integer (%s)', async (action) => {
      // validateIntId only inspects req.params.id, so :itemId reaches the
      // repository as an arbitrary string. It is passed as a bound query
      // parameter so there is no injection risk, but garbage travels all
      // the way to Postgres and surfaces as a 500 instead of a clean 400.
      // The TODO in picking.routes.js acknowledges this.
      // Fix: a validateIntParam('itemId') variant, applied to both routes.
      const res = await request(app).post(`${BASE}/1/items/abc/${action}`)
        .set('Cookie', cookieFor(ROLES.WORKER)).send({ packedQuantity: 1, flagReason: 'x' });

      expect(res.status).toBe(400);
    });
});
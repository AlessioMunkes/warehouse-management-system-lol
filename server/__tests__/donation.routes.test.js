// ─────────────────────────────────────────────────────────────
// server/__tests__/donation.routes.test.js
//
// donation.service.js is mocked, so these tests exercise only the
// auth / requireRole / validateIntParam chain in donation.routes.js
// plus donation.controller.js's response shaping.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  createDonation:       vi.fn(),
  listDonations:        vi.fn(),
  getDonationById:      vi.fn(),
  getDonationEvents:    vi.fn(),
  listUnmatchedItems:   vi.fn(),
  listSection18AQueue:  vi.fn(),
  resolveUnmatchedItem: vi.fn(),
  reclassifyDonation:   vi.fn(),
};

vi.mock('../src/services/donation.service.js', () => ({ default: serviceMock }));

const { buildDonationApp } = await import('./helpers/donationApp.js');
const app  = buildDonationApp();
const BASE = '/api/donations';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.user', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const ALL_ROLES    = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const RECEIVERS_UP = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const MANAGERS_UP  = [ROLES.MANAGER, ROLES.ADMIN];

const BODY = {
  category:          'recipe_food',
  estimatedValueZar: 500,
  items: [{ productId: 3, description: 'Rice', quantity: 25, unit: 'kg' }],
};

const CREATED = { donation: { id: 1 }, warnings: [], duplicate: false };

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.createDonation.mockResolvedValue(CREATED);
  serviceMock.listDonations.mockResolvedValue([]);
  serviceMock.getDonationById.mockResolvedValue({ id: 1 });
  serviceMock.getDonationEvents.mockResolvedValue([]);
  serviceMock.listUnmatchedItems.mockResolvedValue([]);
  serviceMock.listSection18AQueue.mockResolvedValue([]);
  serviceMock.resolveUnmatchedItem.mockResolvedValue({ resolved: true });
  serviceMock.reclassifyDonation.mockResolvedValue({ reclassified: true });
});

const endpoints = [
  ['get',   BASE],
  ['post',  BASE],
  ['get',   `${BASE}/1`],
  ['get',   `${BASE}/1/events`],
  ['get',   `${BASE}/unmatched`],
  ['get',   `${BASE}/section-18a`],
  ['patch', `${BASE}/items/1/resolve`],
  ['patch', `${BASE}/1/classification`],
];

// ── Authentication ────────────────────────────────────────────
describe('donation routes — authentication', () => {
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
describe('donation routes — authorisation', () => {
  it.each(ALL_ROLES)('%s can list donations', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(RECEIVERS_UP)('%s can record a donation', async (role) => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(role)).send(BODY);
    expect(res.status).toBe(201);
  });

  // Finance can read the money side but must not be able to record
  // stock arriving at the gate.
  it('finance cannot record a donation', async () => {
    const res = await request(app).post(BASE)
      .set('Cookie', cookieFor('finance')).send(BODY);
    expect(res.status).toBe(403);
  });

  it('guest cannot reach any donation endpoint', async () => {
    for (const [method, path] of endpoints) {
      const res = await request(app)[method](path)
        .set('Cookie', cookieFor(ROLES.GUEST)).send({});
      expect(res.status).toBe(403);
    }
  });

  it('a worker cannot resolve an unmatched line — it moves stock', async () => {
    const res = await request(app).patch(`${BASE}/items/1/resolve`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send({ productId: 3 });
    expect(res.status).toBe(403);
  });

  it('a worker cannot reclassify a donation (BR-10 override)', async () => {
    const res = await request(app).patch(`${BASE}/1/classification`)
      .set('Cookie', cookieFor(ROLES.WORKER)).send({ category: 'non_food', reason: 'x' });
    expect(res.status).toBe(403);
  });

  it.each(MANAGERS_UP)('%s can resolve an unmatched line', async (role) => {
    const res = await request(app).patch(`${BASE}/items/1/resolve`)
      .set('Cookie', cookieFor(role)).send({ productId: 3 });
    expect(res.status).toBe(200);
  });

  it.each(MANAGERS_UP)('%s can read the Section 18A queue', async (role) => {
    const res = await request(app).get(`${BASE}/section-18a`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it('a worker cannot read the Section 18A queue', async () => {
    const res = await request(app).get(`${BASE}/section-18a`)
      .set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(403);
  });

  // Donor name, contact and tax reference are POPIA-relevant personal
  // data, and the unmatched queue is a manager work list.
  it('a worker cannot read the unmatched queue', async () => {
    const res = await request(app).get(`${BASE}/unmatched`)
      .set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(403);
  });
});

// ── Route ordering ────────────────────────────────────────────
// '/unmatched' and '/section-18a' are declared before '/:id'. If that
// order is ever reversed, validateIntId rejects them as bad ids and
// these two tests fail instead of the bug reaching production.
describe('donation routes — fixed paths are not swallowed by /:id', () => {
  it('routes /unmatched to the queue, not to getDonationById', async () => {
    await request(app).get(`${BASE}/unmatched`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(serviceMock.listUnmatchedItems).toHaveBeenCalled();
    expect(serviceMock.getDonationById).not.toHaveBeenCalled();
  });

  it('routes /section-18a to the queue, not to getDonationById', async () => {
    await request(app).get(`${BASE}/section-18a`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(serviceMock.listSection18AQueue).toHaveBeenCalled();
    expect(serviceMock.getDonationById).not.toHaveBeenCalled();
  });
});

// ── Parameter validation ──────────────────────────────────────
describe('donation routes — parameter validation', () => {
  it.each(['abc', '0', '-1', '1e3'])('rejects id "%s" with a 400', async (id) => {
    const res = await request(app).get(`${BASE}/${id}`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(400);
    expect(serviceMock.getDonationById).not.toHaveBeenCalled();
  });

  it.each(['abc', '0'])('rejects item id "%s" with a 400', async (itemId) => {
    const res = await request(app).patch(`${BASE}/items/${itemId}/resolve`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({ productId: 3 });
    expect(res.status).toBe(400);
    expect(serviceMock.resolveUnmatchedItem).not.toHaveBeenCalled();
  });
});

// ── Controller response shaping ───────────────────────────────
describe('donation controller — responses', () => {
  it('wraps every success in the { success, data } envelope', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('returns 201 for a new donation', async () => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.WORKER)).send(BODY);
    expect(res.status).toBe(201);
  });

  // A retried submit is a success, not a failure — the staff member
  // must not be told to try again.
  it('returns 200, not an error, for a retried submit', async () => {
    serviceMock.createDonation.mockResolvedValue({ ...CREATED, duplicate: true });
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.WORKER)).send(BODY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('passes the session user id to the service, not anything from the body', async () => {
    await request(app).post(BASE).set('Cookie', cookieFor(ROLES.WORKER, { id: 55 }))
      .send({ ...BODY, receivedBy: 999 });
    expect(serviceMock.createDonation.mock.calls[0][1]).toBe(55);
  });

  it('preserves a 4xx message from the service', async () => {
    serviceMock.createDonation.mockRejectedValue(
      withStatus(400, 'A donation category is required.')
    );
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.WORKER)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A donation category is required.');
  });

  // 5xx messages can carry SQL and column names.
  it('replaces a 5xx message with a safe one', async () => {
    serviceMock.createDonation.mockRejectedValue(
      new Error('relation "donations" does not exist')
    );
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.WORKER)).send(BODY);
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/relation/);
  });

  it('passes a 404 from the service straight through', async () => {
    serviceMock.getDonationById.mockRejectedValue(withStatus(404, 'Donation not found.'));
    const res = await request(app).get(`${BASE}/9`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(404);
  });

  it('passes a 409 from a resolve conflict straight through', async () => {
    serviceMock.resolveUnmatchedItem.mockRejectedValue(
      withStatus(409, 'This line has already been resolved (status: allocated).')
    );
    const res = await request(app).patch(`${BASE}/items/1/resolve`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({ productId: 3 });
    expect(res.status).toBe(409);
  });
});
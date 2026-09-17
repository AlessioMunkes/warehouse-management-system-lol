// ─────────────────────────────────────────────────────────────
// server/__tests__/beneficiary.routes.test.js
//
// beneficiary.service.js is mocked, so these tests exercise only the
// auth / requireRole / validateIntId chain in beneficiary.routes.js
// plus beneficiary.controller.js's response shaping — same split
// product.routes.test.js uses. Reads are open to warehouse staff,
// writes (including approve) are manager+admin only.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  listBeneficiaries:   vi.fn(),
  getBeneficiary:      vi.fn(),
  createBeneficiary:   vi.fn(),
  updateBeneficiary:   vi.fn(),
  setBeneficiaryStatus: vi.fn(),
  approveBeneficiary:  vi.fn(),
};

vi.mock('../src/services/beneficiary.service.js', () => ({ default: serviceMock }));

const { buildBeneficiaryApp } = await import('./helpers/beneficiaryApp.js');
const app  = buildBeneficiaryApp();
const BASE = '/api/beneficiaries';

const cookieFor = (role) => {
  const token = jwt.sign(
    { id: 1, username: 'test.manager', role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const READ_ROLES  = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const WRITE_ROLES = [ROLES.MANAGER, ROLES.ADMIN];
const NON_WRITE_ROLES = [ROLES.WORKER, 'finance'];

const BENEFICIARY_BODY = { name: 'Sunnyside ECD', cohort: 'week1', contactName: 'Jane Doe', childCount: 40 };
const SOME_BENEFICIARY = { id: 6, ...BENEFICIARY_BODY, isActive: true, approvedAt: null };

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.listBeneficiaries.mockResolvedValue([SOME_BENEFICIARY]);
  serviceMock.getBeneficiary.mockResolvedValue(SOME_BENEFICIARY);
  serviceMock.createBeneficiary.mockResolvedValue(SOME_BENEFICIARY);
  serviceMock.updateBeneficiary.mockResolvedValue(SOME_BENEFICIARY);
  serviceMock.setBeneficiaryStatus.mockResolvedValue(SOME_BENEFICIARY);
  serviceMock.approveBeneficiary.mockResolvedValue({ ...SOME_BENEFICIARY, approvedAt: '2026-08-01' });
});

describe('beneficiary routes — authentication', () => {
  const endpoints = [
    ['get',   BASE],
    ['get',   `${BASE}/6`],
    ['post',  BASE],
    ['patch', `${BASE}/6`],
    ['patch', `${BASE}/6/status`],
    ['patch', `${BASE}/6/approve`],
  ];

  it.each(endpoints)('%s %s returns 401 with no cookie', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });
});

describe('beneficiary routes — authorisation', () => {
  it.each(READ_ROLES)('%s can list beneficiaries', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it('guest cannot list beneficiaries', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.GUEST));
    expect(res.status).toBe(403);
  });

  it.each(WRITE_ROLES)('%s can create a beneficiary', async (role) => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(role)).send(BENEFICIARY_BODY);
    expect(res.status).toBe(201);
  });

  it.each(NON_WRITE_ROLES)('%s cannot create a beneficiary', async (role) => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(role)).send(BENEFICIARY_BODY);
    expect(res.status).toBe(403);
  });

  it.each(NON_WRITE_ROLES)('%s cannot approve a beneficiary', async (role) => {
    const res = await request(app).patch(`${BASE}/6/approve`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(403);
    expect(serviceMock.approveBeneficiary).not.toHaveBeenCalled();
  });

  it.each(WRITE_ROLES)('%s can approve a beneficiary', async (role) => {
    const res = await request(app).patch(`${BASE}/6/approve`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });
});

describe('beneficiary routes — parameter validation', () => {
  it.each(['abc', '0', '-1', '1e3'])('rejects id "%s" with a 400', async (id) => {
    const res = await request(app).get(`${BASE}/${id}`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(400);
    expect(serviceMock.getBeneficiary).not.toHaveBeenCalled();
  });
});

describe('beneficiary controller — responses', () => {
  it('wraps every success in the { success, data } envelope', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.body).toEqual({ success: true, data: [SOME_BENEFICIARY] });
  });

  it('returns 201 for a newly created beneficiary', async () => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.MANAGER)).send(BENEFICIARY_BODY);
    expect(res.status).toBe(201);
  });

  it('preserves a 4xx message from the service', async () => {
    serviceMock.createBeneficiary.mockRejectedValue(withStatus(409, 'A beneficiary with that name already exists.'));
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.MANAGER)).send(BENEFICIARY_BODY);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('A beneficiary with that name already exists.');
  });

  it('replaces a 5xx message with a safe one', async () => {
    serviceMock.listBeneficiaries.mockRejectedValue(new Error('relation "ecd_centres" does not exist'));
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/relation/);
  });

  it('passes a 404 from the service straight through', async () => {
    serviceMock.getBeneficiary.mockRejectedValue(withStatus(404, 'Beneficiary not found.'));
    const res = await request(app).get(`${BASE}/999`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(404);
  });
});

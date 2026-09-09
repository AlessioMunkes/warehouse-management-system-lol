// ─────────────────────────────────────────────────────────────
// server/__tests__/product.routes.test.js
//
// product.service.js is mocked, so these tests exercise only the
// auth / requireRole / validateIntId chain in product.routes.js plus
// product.controller.js's response shaping — same split
// user.routes.test.js uses. Reads are open to warehouse staff, writes
// are manager+admin only — the one difference from user.routes.js's
// admin-only-everywhere gate.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  listProducts:     vi.fn(),
  getProduct:       vi.fn(),
  createProduct:    vi.fn(),
  updateProduct:    vi.fn(),
  setProductStatus: vi.fn(),
};

vi.mock('../src/services/product.service.js', () => ({ default: serviceMock }));

const { buildProductApp } = await import('./helpers/productApp.js');
const app  = buildProductApp();
const BASE = '/api/products';

const cookieFor = (role, overrides = {}) => {
  const token = jwt.sign(
    { id: 1, username: 'test.manager', role, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const READ_ROLES  = [ROLES.WORKER, ROLES.MANAGER, ROLES.ADMIN];
const WRITE_ROLES = [ROLES.MANAGER, ROLES.ADMIN];
const NON_WRITE_ROLES = [ROLES.WORKER, ROLES.FINANCE];

const PRODUCT_BODY = {
  name: 'Maize meal 10kg', sku: 'MM-10KG', defaultUnit: 'bag',
  weightKg: 10, category: 'Dry goods', isPerishable: false,
};

const SOME_PRODUCT = { id: 5, ...PRODUCT_BODY, isActive: true };

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.listProducts.mockResolvedValue([SOME_PRODUCT]);
  serviceMock.getProduct.mockResolvedValue(SOME_PRODUCT);
  serviceMock.createProduct.mockResolvedValue(SOME_PRODUCT);
  serviceMock.updateProduct.mockResolvedValue(SOME_PRODUCT);
  serviceMock.setProductStatus.mockResolvedValue(SOME_PRODUCT);
});

// ── Authentication ────────────────────────────────────────────
describe('product routes — authentication', () => {
  const endpoints = [
    ['get',   BASE],
    ['get',   `${BASE}/5`],
    ['post',  BASE],
    ['patch', `${BASE}/5`],
    ['patch', `${BASE}/5/status`],
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

// ── Authorisation — reads open to staff, writes manager+admin ──
describe('product routes — authorisation', () => {
  it.each(READ_ROLES)('%s can list products', async (role) => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it('guest cannot list products', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.GUEST));
    expect(res.status).toBe(403);
  });

  it.each(WRITE_ROLES)('%s can create a product', async (role) => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(role)).send(PRODUCT_BODY);
    expect(res.status).toBe(201);
  });

  it.each(NON_WRITE_ROLES)('%s cannot create a product', async (role) => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(role)).send(PRODUCT_BODY);
    expect(res.status).toBe(403);
  });

  it.each(NON_WRITE_ROLES)('%s cannot update a product', async (role) => {
    const res = await request(app).patch(`${BASE}/5`).set('Cookie', cookieFor(role)).send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it.each(NON_WRITE_ROLES)('%s cannot change a product\'s status', async (role) => {
    const res = await request(app).patch(`${BASE}/5/status`).set('Cookie', cookieFor(role)).send({ isActive: false });
    expect(res.status).toBe(403);
  });
});

// ── Parameter validation ────────────────────────────────────────
describe('product routes — parameter validation', () => {
  it.each(['abc', '0', '-1', '1e3'])('rejects id "%s" with a 400', async (id) => {
    const res = await request(app).get(`${BASE}/${id}`).set('Cookie', cookieFor(ROLES.ADMIN));
    expect(res.status).toBe(400);
    expect(serviceMock.getProduct).not.toHaveBeenCalled();
  });
});

// ── Controller response shaping ───────────────────────────────
describe('product controller — responses', () => {
  it('wraps every success in the { success, data } envelope', async () => {
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.body).toEqual({ success: true, data: [SOME_PRODUCT] });
  });

  it('returns 201 for a newly created product', async () => {
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.MANAGER)).send(PRODUCT_BODY);
    expect(res.status).toBe(201);
  });

  it('preserves a 4xx message from the service', async () => {
    serviceMock.createProduct.mockRejectedValue(withStatus(409, 'A product with that name already exists.'));
    const res = await request(app).post(BASE).set('Cookie', cookieFor(ROLES.MANAGER)).send(PRODUCT_BODY);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('A product with that name already exists.');
  });

  it('replaces a 5xx message with a safe one', async () => {
    serviceMock.listProducts.mockRejectedValue(new Error('relation "products" does not exist'));
    const res = await request(app).get(BASE).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/relation/);
  });

  it('passes a 404 from the service straight through', async () => {
    serviceMock.getProduct.mockRejectedValue(withStatus(404, 'Product not found.'));
    const res = await request(app).get(`${BASE}/999`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(404);
  });
});

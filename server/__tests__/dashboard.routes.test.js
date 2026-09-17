// ─────────────────────────────────────────────────────────────
// server/__tests__/dashboard.routes.test.js
//
// dashboard.service.js is mocked, so these tests exercise only the
// auth / requireRole chain in dashboard.routes.js plus
// dashboard.controller.js's response shaping — same split
// product.routes.test.js uses. There is no parameter validation to
// test (the route takes no input) and no service-level unit test
// file, since getSummary has no branching logic of its own to
// validate — repository.getSummary is exercised directly.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = { getSummary: vi.fn() };

vi.mock('../src/services/dashboard.service.js', () => ({ default: serviceMock }));

const { buildDashboardApp } = await import('./helpers/dashboardApp.js');
const app  = buildDashboardApp();
const BASE = '/api/dashboard';

const cookieFor = (role) => {
  const token = jwt.sign(
    { id: 1, username: 'test.manager', role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const SUMMARY = {
  lowStockCount: 3, activeProductCount: 42, openPurchaseOrders: 5,
  deliveriesExpectedToday: 2, pendingDispatchesToday: 4,
};

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.getSummary.mockResolvedValue(SUMMARY);
});

describe('dashboard routes — authentication', () => {
  it('returns 401 with no cookie', async () => {
    const res = await request(app).get(`${BASE}/summary`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const badToken = jwt.sign({ id: 1, role: 'admin' }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request(app).get(`${BASE}/summary`).set('Cookie', [`wms_token=${badToken}`]);
    expect(res.status).toBe(401);
  });
});

describe('dashboard routes — authorisation', () => {
  it.each([ROLES.MANAGER, ROLES.ADMIN])('%s can read the summary', async (role) => {
    const res = await request(app).get(`${BASE}/summary`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each([ROLES.WORKER, 'finance', ROLES.GUEST])('%s cannot read the summary', async (role) => {
    const res = await request(app).get(`${BASE}/summary`).set('Cookie', cookieFor(role));
    expect(res.status).toBe(403);
  });
});

describe('dashboard controller — responses', () => {
  it('wraps success in the { success, data } envelope', async () => {
    const res = await request(app).get(`${BASE}/summary`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.body).toEqual({ success: true, data: SUMMARY });
  });

  it('replaces a 5xx message with a safe one', async () => {
    serviceMock.getSummary.mockRejectedValue(new Error('relation "stock_levels" does not exist'));
    const res = await request(app).get(`${BASE}/summary`).set('Cookie', cookieFor(ROLES.MANAGER));
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/relation/);
  });
});

// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.routes.test.js
//
// Covers only the new PATCH /:id/status route — create/list/getOne
// had no route-level coverage before this file either, and
// backfilling that is a separate job from fixing the status bug.
// purchaseOrder.service.js is mocked, so this exercises the auth /
// requireRole / validateIntId chain plus response shaping, same
// split every other *.routes.test.js in this suite uses.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = {
  createPurchaseOrder:    vi.fn(),
  listPurchaseOrders:     vi.fn(),
  getPurchaseOrder:       vi.fn(),
  setPurchaseOrderStatus: vi.fn(),
};

vi.mock('../src/services/purchaseOrder.service.js', () => ({ default: serviceMock }));

const { buildPurchaseOrderApp } = await import('./helpers/purchaseOrderApp.js');
const app  = buildPurchaseOrderApp();
const BASE = '/api/purchase-orders';

const cookieFor = (role) => {
  const token = jwt.sign(
    { id: 1, username: 'test.manager', role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

const WRITE_ROLES     = [ROLES.MANAGER, ROLES.ADMIN];
const NON_WRITE_ROLES = [ROLES.WORKER, 'finance'];

const SOME_PO = { id: 12, status: 'approved' };

const withStatus = (status, message) => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.setPurchaseOrderStatus.mockResolvedValue(SOME_PO);
});

describe('purchase order routes — PATCH /:id/status', () => {
  it('returns 401 with no cookie', async () => {
    const res = await request(app).patch(`${BASE}/12/status`).send({ status: 'approved' });
    expect(res.status).toBe(401);
  });

  it.each(WRITE_ROLES)('%s can change a purchase order\'s status', async (role) => {
    const res = await request(app).patch(`${BASE}/12/status`)
      .set('Cookie', cookieFor(role)).send({ status: 'approved' });
    expect(res.status).toBe(200);
  });

  it.each(NON_WRITE_ROLES)('%s cannot change a purchase order\'s status', async (role) => {
    const res = await request(app).patch(`${BASE}/12/status`)
      .set('Cookie', cookieFor(role)).send({ status: 'approved' });
    expect(res.status).toBe(403);
    expect(serviceMock.setPurchaseOrderStatus).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1'])('rejects id "%s" with a 400', async (id) => {
    const res = await request(app).patch(`${BASE}/${id}/status`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({ status: 'approved' });
    expect(res.status).toBe(400);
    expect(serviceMock.setPurchaseOrderStatus).not.toHaveBeenCalled();
  });

  it('wraps success in the { success, data } envelope', async () => {
    const res = await request(app).patch(`${BASE}/12/status`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({ status: 'approved' });
    expect(res.body).toEqual({ success: true, data: SOME_PO });
  });

  it('preserves a 4xx message from the service', async () => {
    serviceMock.setPurchaseOrderStatus.mockRejectedValue(
      withStatus(400, 'A reason is required when marking a purchase order as returned.')
    );
    const res = await request(app).patch(`${BASE}/12/status`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({ status: 'returned' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A reason is required when marking a purchase order as returned.');
  });

  it('passes a 404 from the service straight through', async () => {
    serviceMock.setPurchaseOrderStatus.mockRejectedValue(withStatus(404, 'Purchase order not found.'));
    const res = await request(app).patch(`${BASE}/999/status`)
      .set('Cookie', cookieFor(ROLES.MANAGER)).send({ status: 'approved' });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
// server/__tests__/roles.test.js
//
// delivery.service.js is mocked so these tests exercise only the
// auth/requireRole middleware chain in delivery.routes.js — real
// service/repository behaviour is covered elsewhere. This also
// sidesteps delivery.repository.js's import of a stock repository
// module that doesn't currently exist in the repo (see the note
// left in the final summary).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const deliveryServiceMock = {
  getDeliveries:              vi.fn().mockResolvedValue([]),
  getDeliveryById:             vi.fn().mockResolvedValue({ id: 1 }),
  createDelivery:              vi.fn().mockResolvedValue({ id: 1 }),
  getSuppliers:                vi.fn(),
  getDrivers:                  vi.fn(),
  getProducts:                 vi.fn(),
  getPurchaseOrdersBySupplier: vi.fn(),
  getPurchaseOrderItems:       vi.fn(),
};

vi.mock('../src/services/delivery.service.js', () => ({ default: deliveryServiceMock }));

const { buildDeliveryApp } = await import('./helpers/deliveryApp.js');
const app = buildDeliveryApp();

const signToken = (role) =>
  jwt.sign({ id: 1, username: 'TEST', role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const validDeliveryBody = {
  supplierId:      1,
  driverId:        1,
  deliveryDate:    '2026-07-18',
  purchaseOrderId: 1,
  signatureData:   'data:image/png;base64,xxx',
};

describe('Role-based access to /api/deliveries', () => {
  it('returns 401 for an unauthenticated request to GET /api/deliveries', async () => {
    const res = await request(app).get('/api/deliveries');
    expect(res.status).toBe(401);
  });

  it('returns 403 when a packer-level role tries to POST a delivery', async () => {
    // The middleware's ROLES has no literal "packer" entry — ROLES.FINANCE is the
    // closest match: read access to deliveries but no write access, hitting the
    // same requireRole(...RECEIVERS_UP) rejection a packer role would hit.
    const token = signToken(ROLES.FINANCE);
    const res = await request(app)
      .post('/api/deliveries')
      .set('Cookie', [`wms_token=${token}`])
      .send(validDeliveryBody);

    expect(res.status).toBe(403);
  });

  it('allows a receiver role to POST a delivery', async () => {
    const token = signToken(ROLES.WORKER);
    const res = await request(app)
      .post('/api/deliveries')
      .set('Cookie', [`wms_token=${token}`])
      .send(validDeliveryBody);

    expect(res.status).toBe(201);
    expect(deliveryServiceMock.createDelivery).toHaveBeenCalled();
  });
});

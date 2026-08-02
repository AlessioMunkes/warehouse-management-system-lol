// ─────────────────────────────────────────────────────────────
// server/__tests__/validation.test.js
//
// delivery.service.js is mocked so these tests exercise only the
// validateIntId middleware in delivery.routes.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt     from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const deliveryServiceMock = {
  getDeliveries:              vi.fn().mockResolvedValue([]),
  getDeliveryById:             vi.fn().mockResolvedValue({ id: 1, items: [] }),
  createDelivery:              vi.fn(),
  getSuppliers:                vi.fn(),
  getDrivers:                  vi.fn(),
  getProducts:                 vi.fn(),
  getPurchaseOrdersBySupplier: vi.fn(),
  getPurchaseOrderItems:       vi.fn(),
};

vi.mock('../src/services/delivery.service.js', () => ({ default: deliveryServiceMock }));

const { buildDeliveryApp } = await import('./helpers/deliveryApp.js');
const app = buildDeliveryApp();

const token      = jwt.sign({ id: 1, username: 'TEST', role: ROLES.WORKER }, process.env.JWT_SECRET, { expiresIn: '1h' });
const authCookie = `wms_token=${token}`;

describe('GET /api/deliveries/:id validation', () => {
  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app).get('/api/deliveries/abc').set('Cookie', [authCookie]);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a negative id', async () => {
    const res = await request(app).get('/api/deliveries/-1').set('Cookie', [authCookie]);
    expect(res.status).toBe(400);
  });

  it('returns 400 for id 0', async () => {
    const res = await request(app).get('/api/deliveries/0').set('Cookie', [authCookie]);
    expect(res.status).toBe(400);
  });

  it('passes validation for id 1', async () => {
    const res = await request(app).get('/api/deliveries/1').set('Cookie', [authCookie]);
    expect(res.status).toBe(200);
    expect(deliveryServiceMock.getDeliveryById).toHaveBeenCalledWith(1);
  });
});

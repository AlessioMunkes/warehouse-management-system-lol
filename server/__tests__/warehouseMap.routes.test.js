// ─────────────────────────────────────────────────────────────
// server/__tests__/warehouseMap.routes.test.js
//
// Who may use the warehouse map: managers and admins read it and count
// into it, only an admin saves the plan, and the floor has no way in.
// The service is mocked.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const serviceMock = { getMap: vi.fn(), saveLayout: vi.fn(), recordCount: vi.fn() };
vi.mock('../src/services/warehouseMap.service.js', () => ({ default: serviceMock }));

const { default: router } = await import('../src/routes/warehouseMap.routes.js');
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/warehouse-map', router);

const cookieFor = (role, id = 20) => [`wms_token=${jwt.sign({ id, username: 'test.user', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`];

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.getMap.mockResolvedValue({ ready: true, areas: [] });
  serviceMock.saveLayout.mockResolvedValue({ ready: true, areas: [] });
  serviceMock.recordCount.mockResolvedValue({ ready: true, areas: [] });
});

describe('warehouse map routes', () => {
  it('turns a warehouse worker away from all three', async () => {
    const cookie = cookieFor(ROLES.WORKER);
    expect((await request(app).get('/api/warehouse-map').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).put('/api/warehouse-map/layout').set('Cookie', cookie).send({ areas: [] })).status).toBe(403);
    expect((await request(app).post('/api/warehouse-map/areas/3/counts').set('Cookie', cookie).send({ lines: [] })).status).toBe(403);
  });

  it('lets a manager read and count, but not change the plan', async () => {
    const cookie = cookieFor(ROLES.MANAGER, 31);
    expect((await request(app).get('/api/warehouse-map').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).post('/api/warehouse-map/areas/3/counts').set('Cookie', cookie).send({ lines: [] })).status).toBe(201);
    expect(serviceMock.recordCount).toHaveBeenCalledWith(3, { lines: [] }, 31);
    expect((await request(app).put('/api/warehouse-map/layout').set('Cookie', cookie).send({ areas: [] })).status).toBe(403);
  });

  it('lets an admin save the plan as themselves', async () => {
    const res = await request(app).put('/api/warehouse-map/layout').set('Cookie', cookieFor(ROLES.ADMIN, 5)).send({ areas: [] });
    expect(res.status).toBe(200);
    expect(serviceMock.saveLayout).toHaveBeenCalledWith({ areas: [] }, 5);
  });

  it('passes a refusal on with its message', async () => {
    serviceMock.saveLayout.mockRejectedValueOnce(Object.assign(new Error('"A" and "B" overlap. Move one of them.'), { status: 400 }));
    const res = await request(app).put('/api/warehouse-map/layout').set('Cookie', cookieFor(ROLES.ADMIN)).send({ areas: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/overlap/);
  });

  it('refuses an area id that is not a number', async () => {
    const res = await request(app).post('/api/warehouse-map/areas/abc/counts').set('Cookie', cookieFor(ROLES.MANAGER)).send({ lines: [] });
    expect(res.status).toBe(400);
    expect(serviceMock.recordCount).not.toHaveBeenCalled();
  });
});

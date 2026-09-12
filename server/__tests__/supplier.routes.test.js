// ─────────────────────────────────────────────────────────────
// server/__tests__/supplier.routes.test.js
//
// Route-layer tests: role gating, status codes, and the one piece of
// ordering that will silently break the prospect pad if it regresses
// (see the /prospects vs /:id block at the bottom).
//
// The service is mocked, so nothing here touches pg.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../src/services/supplier.service.js', () => ({
  default: {
    listSuppliers:     vi.fn(),
    getSupplier:       vi.fn(),
    registerSupplier:  vi.fn(),
    updateSupplier:    vi.fn(),
    setSupplierStatus: vi.fn(),
    listProspects:     vi.fn(),
    addProspect:       vi.fn(),
    updateProspect:    vi.fn(),
    removeProspect:    vi.fn(),
    convertProspect:   vi.fn(),
  },
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const service = (await import('../src/services/supplier.service.js')).default;
const { buildSupplierApp } = await import('./helpers/supplierApp.js');

const app = buildSupplierApp();

const tokenFor = (role, id = 2) =>
  jwt.sign({ id, role, username: `${role}001` }, process.env.JWT_SECRET);

const as = (req, role) => req.set('Cookie', [`wms_token=${tokenFor(role)}`]);

beforeEach(() => {
  vi.clearAllMocks();
  service.listSuppliers.mockResolvedValue([]);
  service.listProspects.mockResolvedValue([]);
  service.getSupplier.mockResolvedValue({ id: 1, name: 'Peninsula Fresh Wholesalers' });
  service.registerSupplier.mockResolvedValue({ id: 9, name: 'New Supplier' });
  service.addProspect.mockResolvedValue({ id: 5, name: 'A lead' });
});

describe('authentication', () => {
  it('401s without a cookie', async () => {
    await request(app).get('/api/suppliers').expect(401);
  });

  it('401s on a token signed with the wrong secret', async () => {
    const bad = jwt.sign({ id: 1, role: 'manager' }, 'not-the-secret');
    await request(app).get('/api/suppliers').set('Cookie', [`wms_token=${bad}`]).expect(401);
  });
});

describe('read access', () => {
  // Receiving needs the supplier list for its dropdown, so workers
  // must be able to read. If this test starts failing, the receiving
  // flow's supplier picker is about to go blank.
  it.each(['warehouse_worker', 'manager', 'admin'])('lets %s list suppliers', async (role) => {
    await as(request(app).get('/api/suppliers'), role).expect(200);
  });

  it.each(['warehouse_worker', 'manager', 'admin'])('lets %s read one supplier', async (role) => {
    await as(request(app).get('/api/suppliers/1'), role).expect(200);
  });

  it('passes query filters through to the service', async () => {
    await as(request(app).get('/api/suppliers?includeInactive=true&search=cold'), 'manager').expect(200);
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ includeInactive: 'true', search: 'cold' })
    );
  });
});

describe('write access', () => {
  it('403s a worker registering a supplier', async () => {
    await as(request(app).post('/api/suppliers').send({ name: 'X' }), 'warehouse_worker').expect(403);
    expect(service.registerSupplier).not.toHaveBeenCalled();
  });

  it('403s a manager registering a supplier', async () => {
    await as(request(app).post('/api/suppliers').send({ name: 'X' }), 'manager').expect(403);
    expect(service.registerSupplier).not.toHaveBeenCalled();
  });

  it('201s an admin registering a supplier', async () => {
    await as(request(app).post('/api/suppliers').send({ name: 'X' }), 'admin').expect(201);
  });

  it('attributes the write to the authenticated user', async () => {
    await as(request(app).post('/api/suppliers').send({ name: 'X' }), 'admin').expect(201);
    expect(service.registerSupplier).toHaveBeenCalledWith({ name: 'X' }, 2);
  });

  it('403s a worker deactivating a supplier', async () => {
    await as(request(app).patch('/api/suppliers/1/status').send({ isActive: false }), 'warehouse_worker')
      .expect(403);
  });
});

describe('error translation', () => {
  it('surfaces a 409 from the service as a 409, not a 500', async () => {
    const err = new Error('A supplier named "X" already exists.');
    err.status = 409;
    service.registerSupplier.mockRejectedValue(err);

    const res = await as(request(app).post('/api/suppliers').send({ name: 'X' }), 'admin').expect(409);
    expect(res.body.message).toMatch(/already exists/);
  });

  // A 500 message may carry database internals, so it is replaced
  // with a fixed sentence rather than echoed.
  it('does not echo the message of an unexpected error', async () => {
    service.registerSupplier.mockRejectedValue(new Error('relation "suppliers" does not exist'));
    const res = await as(request(app).post('/api/suppliers').send({ name: 'X' }), 'admin').expect(500);
    expect(res.body.message).not.toMatch(/relation/);
  });
});

describe('id validation', () => {
  it('400s a non-numeric supplier id before it reaches the service', async () => {
    await as(request(app).get('/api/suppliers/abc'), 'manager').expect(400);
    expect(service.getSupplier).not.toHaveBeenCalled();
  });

  it('400s a zero id', async () => {
    await as(request(app).get('/api/suppliers/0'), 'manager').expect(400);
  });
});

describe('prospects', () => {
  it('403s a worker reading the prospect pad', async () => {
    await as(request(app).get('/api/suppliers/prospects'), 'warehouse_worker').expect(403);
  });

  it('lets a manager add a prospect', async () => {
    await as(request(app).post('/api/suppliers/prospects').send({ name: 'A lead' }), 'manager').expect(201);
  });

  it('converts through an admin-only route, while the pad stays with the manager', async () => {
    service.convertProspect.mockResolvedValue({ supplier: { id: 9 }, prospect: { id: 5 } });
    await as(request(app).post('/api/suppliers/prospects/5/convert').send({}), 'admin').expect(201);
    // The manager keeps the pad and loses only this one route, because
    // this is the route that creates master data.
    await as(request(app).post('/api/suppliers/prospects/5/convert').send({}), 'manager').expect(403);
    await as(request(app).post('/api/suppliers/prospects/5/convert').send({}), 'warehouse_worker').expect(403);
  });

  // ── The ordering guard ──────────────────────────────────────
  // If /prospects is ever declared after /:id, Express matches
  // "prospects" as an id, validateIntId rejects it, and the whole
  // prospect pad returns 400 with no other test noticing. This is
  // that test.
  it('routes /prospects to the prospect handler, not the :id handler', async () => {
    await as(request(app).get('/api/suppliers/prospects'), 'manager').expect(200);
    expect(service.listProspects).toHaveBeenCalled();
    expect(service.getSupplier).not.toHaveBeenCalled();
  });
});

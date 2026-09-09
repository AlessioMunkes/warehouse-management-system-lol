// ─────────────────────────────────────────────────────────────
// server/__tests__/receipts.routes.test.js
//
// The two archive endpoints, at the route/controller layer.
// Both services are mocked, so what is under test is the auth chain,
// the role gates, route ordering, and the response envelope.
//
// WHAT THIS CANNOT TEST
// The SQL. Filter combinations, the date handling and COUNT(*) OVER ()
// need the real Postgres 16 fixture — vi.mock('pg') means Vitest never
// parses the repository files at all, which is the whole reason
// module-loads.test.js exists.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ROLES } from '../src/middleware/auth.middleware.js';

const deliveryServiceMock = {
  getDeliveries:         vi.fn(),
  getSupplierOptions:    vi.fn(),
  getDeliveryById:       vi.fn(),
  createDelivery:        vi.fn(),
  getSuppliers:          vi.fn(),
  getProducts:           vi.fn(),
  getPurchaseOrdersBySupplier: vi.fn(),
  getPurchaseOrderItems: vi.fn(),
};

const dispatchServiceMock = {
  getBoard:                       vi.fn(),
  getGateView:                    vi.fn(),
  collect:                        vi.fn(),
  sweep:                          vi.fn(),
  getDispatchNote:                vi.fn(),
  listDispatchNotes:              vi.fn(),
  getDispatchBeneficiaryOptions:  vi.fn(),
  getNonCollectionHistory:        vi.fn(),
};

vi.mock('../src/services/delivery.service.js', () => ({ default: deliveryServiceMock }));
vi.mock('../src/services/dispatch.service.js', () => ({ default: dispatchServiceMock }));

const { buildDeliveryApp } = await import('./helpers/deliveryApp.js');
const { buildDispatchApp } = await import('./helpers/dispatchApp.js');

const deliveryApp = buildDeliveryApp();
const dispatchApp = buildDispatchApp();

const cookieFor = (role) => {
  const token = jwt.sign(
    { id: 1, username: 'test.user', role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`wms_token=${token}`];
};

// The archive is manager-and-admin only. WORKER and FINANCE must be refused,
// and refused by the ROUTE — a test that only checks the tile is missing from
// a dashboard proves nothing about who can call the endpoint.
const ALLOWED_ROLES = [ROLES.MANAGER, ROLES.ADMIN];
const BLOCKED_ROLES = [ROLES.WORKER, 'finance'];
const PAGE = { rows: [], total: 0, limit: 25, offset: 0 };

beforeEach(() => { vi.clearAllMocks(); });

// ═══════════════════════════════════════════════════════════════
describe('GET /api/deliveries — the goods-in archive', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(deliveryApp).get('/api/deliveries');
    expect(res.status).toBe(401);
    expect(deliveryServiceMock.getDeliveries).not.toHaveBeenCalled();
  });

  it.each(ALLOWED_ROLES)('is readable by %s', async (role) => {
    deliveryServiceMock.getDeliveries.mockResolvedValue(PAGE);
    const res = await request(deliveryApp)
      .get('/api/deliveries')
      .set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(BLOCKED_ROLES)('is refused for %s', async (role) => {
    const res = await request(deliveryApp)
      .get('/api/deliveries')
      .set('Cookie', cookieFor(role));
    expect(res.status).toBe(403);
    // The service must not run at all — a 403 that still hit the database
    // would leak timing and load even though the body is empty.
    expect(deliveryServiceMock.getDeliveries).not.toHaveBeenCalled();
  });

  it('refuses a worker the note document itself, not just the list', async () => {
    const res = await request(deliveryApp)
      .get('/api/deliveries/1')
      .set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(403);
    expect(deliveryServiceMock.getDeliveryById).not.toHaveBeenCalled();
  });

  it('hands the whole query object to the service', async () => {
    deliveryServiceMock.getDeliveries.mockResolvedValue(PAGE);
    await request(deliveryApp)
      .get('/api/deliveries?from=2026-08-01&to=2026-08-24&supplierId=3&status=flagged&limit=10&offset=20')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(deliveryServiceMock.getDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-08-01', to: '2026-08-24',
        supplierId: '3', status: 'flagged',
        limit: '10', offset: '20',
      })
    );
  });

  it('returns the page object inside the envelope, not a bare array', async () => {
    deliveryServiceMock.getDeliveries.mockResolvedValue({
      rows: [{ id: 1, supplier_name: 'Meridian', has_discrepancies: true }],
      total: 1, limit: 25, offset: 0,
    });
    const res = await request(deliveryApp)
      .get('/api/deliveries')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
  });

  it('passes a service 400 through with its message', async () => {
    const err = new Error('"From" cannot be after "to".');
    err.status = 400;
    deliveryServiceMock.getDeliveries.mockRejectedValue(err);

    const res = await request(deliveryApp)
      .get('/api/deliveries?from=2026-09-01&to=2026-08-01')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('cannot be after');
  });

  it('does not leak an internal error message on a 500', async () => {
    deliveryServiceMock.getDeliveries.mockRejectedValue(
      new Error('relation "delivery_notes" does not exist')
    );
    const res = await request(deliveryApp)
      .get('/api/deliveries')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(500);
    expect(res.body.message).not.toContain('relation');
  });
});

describe('GET /api/deliveries/supplier-options', () => {
  it('is not shadowed by the /:id route', async () => {
    deliveryServiceMock.getSupplierOptions.mockResolvedValue([{ id: 1, name: 'Meridian' }]);
    const res = await request(deliveryApp)
      .get('/api/deliveries/supplier-options')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(200);
    expect(deliveryServiceMock.getSupplierOptions).toHaveBeenCalled();
    expect(deliveryServiceMock.getDeliveryById).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
describe('GET /api/dispatch/notes — the goods-out archive', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(dispatchApp).get('/api/dispatch/notes');
    expect(res.status).toBe(401);
  });

  it.each(ALLOWED_ROLES)('is readable by %s', async (role) => {
    dispatchServiceMock.listDispatchNotes.mockResolvedValue(PAGE);
    const res = await request(dispatchApp)
      .get('/api/dispatch/notes')
      .set('Cookie', cookieFor(role));
    expect(res.status).toBe(200);
  });

  it.each(BLOCKED_ROLES)('dispatch archive is refused for %s', async (role) => {
    const res = await request(dispatchApp)
      .get('/api/dispatch/notes')
      .set('Cookie', cookieFor(role));
    expect(res.status).toBe(403);
    expect(dispatchServiceMock.listDispatchNotes).not.toHaveBeenCalled();
  });

  // The gate itself must NOT have been caught by this change. A worker still
  // needs the board and the pallet view to release food on a Friday.
  it('leaves the gate board open to workers', async () => {
    dispatchServiceMock.getBoard.mockResolvedValue([]);
    const res = await request(dispatchApp)
      .get('/api/dispatch')
      .set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(200);
  });

  it('leaves the pallet view open to workers', async () => {
    dispatchServiceMock.getGateView.mockResolvedValue({ id: 1 });
    const res = await request(dispatchApp)
      .get('/api/dispatch/5')
      .set('Cookie', cookieFor(ROLES.WORKER));
    expect(res.status).toBe(200);
  });

  it('forwards the filters', async () => {
    dispatchServiceMock.listDispatchNotes.mockResolvedValue(PAGE);
    await request(dispatchApp)
      .get('/api/dispatch/notes?from=2026-08-01&ecdId=7&cohort=week2&status=not_collected')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(dispatchServiceMock.listDispatchNotes).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-08-01', ecdId: '7', cohort: 'week2', status: 'not_collected',
      })
    );
  });

  it('routes /notes/options to the options handler, not the id handler', async () => {
    dispatchServiceMock.getDispatchBeneficiaryOptions.mockResolvedValue([]);
    const res = await request(dispatchApp)
      .get('/api/dispatch/notes/options')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(200);
    expect(dispatchServiceMock.getDispatchBeneficiaryOptions).toHaveBeenCalled();
    expect(dispatchServiceMock.getDispatchNote).not.toHaveBeenCalled();
  });

  it('still routes /notes/:eventId to the single-note handler', async () => {
    dispatchServiceMock.getDispatchNote.mockResolvedValue({ id: 12, lines: [] });
    const res = await request(dispatchApp)
      .get('/api/dispatch/notes/12')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(200);
    expect(dispatchServiceMock.getDispatchNote).toHaveBeenCalledWith(12);
    expect(dispatchServiceMock.listDispatchNotes).not.toHaveBeenCalled();
  });

  it('400s a non-integer event id rather than passing it to the service', async () => {
    const res = await request(dispatchApp)
      .get('/api/dispatch/notes/abc')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(400);
    expect(dispatchServiceMock.getDispatchNote).not.toHaveBeenCalled();
  });

  it('does not shadow the gate board at /', async () => {
    dispatchServiceMock.getBoard.mockResolvedValue([]);
    const res = await request(dispatchApp)
      .get('/api/dispatch')
      .set('Cookie', cookieFor(ROLES.MANAGER));

    expect(res.status).toBe(200);
    expect(dispatchServiceMock.getBoard).toHaveBeenCalled();
    expect(dispatchServiceMock.listDispatchNotes).not.toHaveBeenCalled();
  });
});

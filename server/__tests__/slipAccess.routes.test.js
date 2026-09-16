// ─────────────────────────────────────────────────────────────
// server/__tests__/slipAccess.routes.test.js
//
// BR-22 guest slip access, routes 1.1 - 1.5.
//
// The properties worth protecting, in rough order of how badly they
// would hurt:
//
//   - the public preview leaks nothing beyond what is printed on a
//     poster (no item list, no stock, no staff names, no token)
//   - an ambiguous short code is refused rather than resolved
//   - a guest cannot touch a slip that is not theirs
//   - a guest cannot reach the staff packing surface
//   - claiming twice does not create two claims or steal a pallet
//   - no volunteer id is ever written to an int4 actor column
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { authCookie } from './helpers/testAuth.js';

const poolQuery = vi.fn();
vi.mock('../src/config/db.js', () => ({
  default: { query: (...args) => poolQuery(...args) },
}));

const slipAccessRepo = {
  CLAIMABLE_STATUSES: ['pending', 'in_progress'],
  getPreviewByToken:      vi.fn(),
  findPreviewsByShortCode: vi.fn(),
  listUnclaimedForDate:   vi.fn(),
  claimForVolunteer:      vi.fn(),
  findSlipIdForVolunteer: vi.fn(),
  volunteerHoldsSlip:     vi.fn(),
};
vi.mock('../src/repositories/slipAccess.repository.js', () => ({
  default: slipAccessRepo,
  isUuid: () => true,
  isShortCode: () => true,
}));

const pickingRepo = {
  getSlipById:   vi.fn(),
  setItemStatus: vi.fn(),
  completeSlip:  vi.fn(),
};
vi.mock('../src/repositories/picking.repository.js', () => ({ default: pickingRepo }));

const { buildSlipApp } = await import('./helpers/slipApp.js');
const app = buildSlipApp();

const TOKEN = '83861845-e253-4b49-802e-5ec551200c60';
const CODE  = '200c60';

// node-postgres returns int8 as a string, so a real guest token carries
// a STRING id. Tests use one, because a number would pass comparisons
// that production would fail.
const GUEST   = { id: '7', role: 'guest' };
const OTHER   = { id: '9', role: 'guest' };
const WORKER  = { id: 3, role: 'warehouse_worker', username: 'worker001' };
const MANAGER = { id: 2, role: 'manager', username: 'manager001' };

const previewRow = {
  id: 132,
  dispatch_date: '2026-09-16',
  status: 'pending',
  beneficiary_kind: 'ecd',
  beneficiary_name: 'Little Angels Educare',
  item_count: 9,
  is_claimed: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  slipAccessRepo.getPreviewByToken.mockResolvedValue(previewRow);
  slipAccessRepo.findPreviewsByShortCode.mockResolvedValue([previewRow]);
  slipAccessRepo.listUnclaimedForDate.mockResolvedValue([previewRow]);
  slipAccessRepo.volunteerHoldsSlip.mockResolvedValue(true);
  slipAccessRepo.findSlipIdForVolunteer.mockResolvedValue(132);
  // A REALISTIC raw row: claimForVolunteer does `RETURNING *`, so it is
  // snake_case, beneficiary_name is the slip's own null copy (not the
  // COALESCEd ECD name), and dispatch_date is the Date node-postgres
  // builds — not the ::text the preview query asks for.
  //
  // The earlier fixture here was preview-shaped, which masked a real bug:
  // the claim response came back with beneficiaryName null, the date a
  // day early in UTC, and itemCount/isClaimed missing.
  slipAccessRepo.claimForVolunteer.mockResolvedValue({
    slip: {
      id: 132,
      status: 'in_progress',
      assigned_to: null,
      assigned_volunteer_id: '7',
      beneficiary_name: null,
      dispatch_date: new Date('2026-09-15T22:00:00.000Z'),
    },
    alreadyMine: false,
  });
  poolQuery.mockResolvedValue({
    rows: [{ id: '7', full_name: 'Thabo Mokoena', signed_in_at: '2026-09-16T07:00:00Z' }],
  });
});

// ── 1.1 public preview ────────────────────────────────────────
describe('GET /api/slip/:token — public preview', () => {
  it('returns the preview with no session at all', async () => {
    const res = await request(app).get(`/api/slip/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: 132,
      beneficiaryName: 'Little Angels Educare',
      dispatchDate: '2026-09-16',
      itemCount: 9,
      status: 'pending',
    });
  });

  // The whole risk of a public endpoint.
  it('leaks nothing beyond the poster fields', async () => {
    const res = await request(app).get(`/api/slip/${TOKEN}`);
    const body = JSON.stringify(res.body);

    expect(res.body.data).not.toHaveProperty('items');
    expect(res.body.data).not.toHaveProperty('public_token');
    expect(res.body.data).not.toHaveProperty('assigned_to');
    expect(res.body.data).not.toHaveProperty('packer_name');
    expect(body).not.toContain('quantity_on_hand');
    expect(body).not.toContain(TOKEN);

    // The response has exactly the agreed keys and nothing else.
    expect(Object.keys(res.body.data).sort()).toEqual([
      'beneficiaryKind', 'beneficiaryName', 'dispatchDate',
      'id', 'isClaimed', 'itemCount', 'status',
    ]);
  });

  it('404s an unknown token', async () => {
    slipAccessRepo.getPreviewByToken.mockResolvedValue(null);
    const res = await request(app).get(`/api/slip/${TOKEN}`);
    expect(res.status).toBe(404);
  });

  // Not an oracle: "no such token" and "exists but not yours" read the same.
  it('gives the same message for unknown and malformed tokens', async () => {
    slipAccessRepo.getPreviewByToken.mockResolvedValue(null);
    const a = await request(app).get(`/api/slip/${TOKEN}`);
    const b = await request(app).get('/api/slip/not-a-uuid');

    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.body.message).toBe(b.body.message);
  });
});

// ── 1.2 short code ────────────────────────────────────────────
describe('GET /api/slip/code/:code — short code', () => {
  it('returns the same shape as the token preview', async () => {
    const res = await request(app).get(`/api/slip/code/${CODE}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual([
      'beneficiaryKind', 'beneficiaryName', 'dispatchDate',
      'id', 'isClaimed', 'itemCount', 'status',
    ]);
  });

  it('404s a code that matches nothing', async () => {
    slipAccessRepo.findPreviewsByShortCode.mockResolvedValue([]);
    const res = await request(app).get(`/api/slip/code/${CODE}`);
    expect(res.status).toBe(404);
  });

  // Never resolve a collision by picking one.
  it('refuses an ambiguous code instead of guessing', async () => {
    slipAccessRepo.findPreviewsByShortCode.mockResolvedValue([
      previewRow, { ...previewRow, id: 999 },
    ]);
    const res = await request(app).get(`/api/slip/code/${CODE}`);

    expect(res.status).toBe(409);
    expect(res.body.ambiguous).toBe(true);
    expect(res.body.message).toMatch(/more than one/i);
    // and it must not have leaked either candidate
    expect(JSON.stringify(res.body)).not.toContain('999');
  });
});

// ── 1.3 claim ─────────────────────────────────────────────────
describe('POST /api/slip/:token/claim', () => {
  it('creates the volunteer, sets the cookie and binds the slip', async () => {
    const res = await request(app)
      .post(`/api/slip/${TOKEN}/claim`)
      .send({ name: 'Thabo Mokoena' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ id: '7', firstName: 'Thabo Mokoena', role: 'guest' });
    expect(String(res.headers['set-cookie'])).toContain('wms_token=');
    expect(slipAccessRepo.claimForVolunteer).toHaveBeenCalledWith({ slipId: 132, volunteerId: '7' });
  });

  // The claim response is what the guest screen renders straight after
  // scanning, so it has to carry the same fields the preview did. It
  // once did not: the raw RETURNING row was run back through the
  // preview shaper, which reads snake_case, and quietly produced a null
  // beneficiary, yesterday's date, and two missing fields.
  it('returns the full preview shape, not the raw claimed row', async () => {
    const res = await request(app)
      .post(`/api/slip/${TOKEN}/claim`)
      .send({ name: 'Thabo Mokoena' });

    expect(res.status).toBe(201);
    expect(res.body.data.slip).toEqual({
      id: 132,
      beneficiaryName: 'Little Angels Educare',   // COALESCEd, not the slip's null
      beneficiaryKind: 'ecd',
      dispatchDate: '2026-09-16',                 // the calendar day, not a UTC timestamp
      itemCount: 9,
      status: 'in_progress',                      // the one thing the claim changed
      isClaimed: true,
    });
  });

  // The integration boundary: guests live in `volunteers`, always with
  // source 'guest_login', and never in the VMS tables.
  it("inserts into volunteers with source 'guest_login' only", async () => {
    await request(app).post(`/api/slip/${TOKEN}/claim`).send({ name: 'Thabo' });

    const sql = poolQuery.mock.calls.map(([q]) => String(q)).join('\n');
    expect(sql).toMatch(/INSERT INTO volunteers/i);
    expect(sql).toMatch(/guest_login/);
    for (const vms of ['volunteer_bookings', 'attendance', 'vms_sync', 'love_activism_events']) {
      expect(sql).not.toContain(vms);
    }
  });

  it('requires a name', async () => {
    const res = await request(app).post(`/api/slip/${TOKEN}/claim`).send({});
    expect(res.status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('refuses a pallet already held by another volunteer', async () => {
    slipAccessRepo.claimForVolunteer.mockResolvedValue({ takenByVolunteer: true });
    const res = await request(app).post(`/api/slip/${TOKEN}/claim`).send({ name: 'Thabo' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/someone else/i);
  });

  it('refuses a pallet a staff member is packing', async () => {
    slipAccessRepo.claimForVolunteer.mockResolvedValue({ takenByStaff: true });
    const res = await request(app).post(`/api/slip/${TOKEN}/claim`).send({ name: 'Thabo' });
    expect(res.status).toBe(409);
  });

  it('refuses a finished pallet', async () => {
    slipAccessRepo.getPreviewByToken.mockResolvedValue({ ...previewRow, status: 'complete' });
    const res = await request(app).post(`/api/slip/${TOKEN}/claim`).send({ name: 'Thabo' });

    expect(res.status).toBe(409);
    expect(poolQuery).not.toHaveBeenCalled();   // no volunteer row for a dead pallet
  });

  it('claims by short code too', async () => {
    const res = await request(app).post(`/api/slip/code/${CODE}/claim`).send({ name: 'Thabo' });
    expect(res.status).toBe(201);
  });

  it('404s a claim against an unknown token', async () => {
    slipAccessRepo.getPreviewByToken.mockResolvedValue(null);
    const res = await request(app).post(`/api/slip/${TOKEN}/claim`).send({ name: 'Thabo' });
    expect(res.status).toBe(404);
  });
});

// ── 1.4 available list ────────────────────────────────────────
describe('GET /api/slip/available', () => {
  it('lists today’s unclaimed pallets for a guest', async () => {
    const res = await request(app).get('/api/slip/available').set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      'beneficiaryKind', 'beneficiaryName', 'dispatchDate',
      'id', 'isClaimed', 'itemCount', 'status',
    ]);
  });

  it('requires a session', async () => {
    const res = await request(app).get('/api/slip/available');
    expect(res.status).toBe(401);
  });

  // '/available' must not be swallowed by the ':token' pattern.
  it('is not matched as a token', async () => {
    const res = await request(app).get('/api/slip/available').set('Cookie', authCookie(GUEST));
    expect(slipAccessRepo.getPreviewByToken).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

// ── 1.5 guest read and write ──────────────────────────────────
describe('GET /api/slip/mine', () => {
  it('returns the guest’s own slip without staff fields', async () => {
    pickingRepo.getSlipById.mockResolvedValue({
      id: 132, status: 'in_progress', assigned_to: null, assigned_volunteer_id: '7',
      public_token: TOKEN, packer_name: 'Sipho', generated_by: 2, completed_by: null,
      items: [{ id: 1, product_name: 'Maize meal' }],
    });

    const res = await request(app).get('/api/slip/mine').set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);     // guests DO get the item list for their own slip
    expect(res.body.data).not.toHaveProperty('packer_name');
    expect(res.body.data).not.toHaveProperty('public_token');
    expect(res.body.data).not.toHaveProperty('generated_by');
  });

  it('404s when the guest holds nothing', async () => {
    slipAccessRepo.findSlipIdForVolunteer.mockResolvedValue(null);
    const res = await request(app).get('/api/slip/mine').set('Cookie', authCookie(GUEST));
    expect(res.status).toBe(404);
  });
});

describe('guest writes', () => {
  beforeEach(() => {
    pickingRepo.setItemStatus.mockResolvedValue({ item: { id: 1 }, variance: null });
    pickingRepo.completeSlip.mockResolvedValue({ slip: { id: 132, status: 'complete' } });
  });

  it('confirms an item on the guest’s own slip', async () => {
    const res = await request(app)
      .post('/api/slip/132/items/1/confirm')
      .set('Cookie', authCookie(GUEST))
      .send({ packedQuantity: 5 });

    expect(res.status).toBe(200);
    expect(pickingRepo.setItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        slipId: 132, itemId: 1, status: 'confirmed',
        actor: { type: 'volunteer', id: '7' },
        canOverride: false,
      }),
    );
  });

  // The attribution rule, asserted at the boundary the guest controls.
  it('passes a volunteer actor, never a bare actorId', async () => {
    await request(app)
      .post('/api/slip/132/items/1/confirm')
      .set('Cookie', authCookie(GUEST))
      .send({ packedQuantity: 5 });

    const [callArgs] = pickingRepo.setItemStatus.mock.calls[0];
    expect(callArgs.actor.type).toBe('volunteer');
    expect(callArgs).not.toHaveProperty('actorId');
  });

  it('flags an item with a reason', async () => {
    const res = await request(app)
      .post('/api/slip/132/items/1/flag')
      .set('Cookie', authCookie(GUEST))
      .send({ reason: 'Damaged stock' });

    expect(res.status).toBe(200);
    expect(pickingRepo.setItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'flagged', flagReason: 'Damaged stock' }),
    );
  });

  it('refuses a flag with no reason', async () => {
    const res = await request(app)
      .post('/api/slip/132/items/1/flag')
      .set('Cookie', authCookie(GUEST))
      .send({});
    expect(res.status).toBe(400);
  });

  it('completes the slip', async () => {
    const res = await request(app)
      .post('/api/slip/132/complete')
      .set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(200);
    expect(pickingRepo.completeSlip).toHaveBeenCalledWith(
      expect.objectContaining({ slipId: 132, actor: { type: 'volunteer', id: '7' } }),
    );
  });

  it('reports items still outstanding rather than completing', async () => {
    pickingRepo.completeSlip.mockResolvedValue({ pendingItems: 3 });
    const res = await request(app)
      .post('/api/slip/132/complete')
      .set('Cookie', authCookie(GUEST));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/3 items/);
  });

  // ── the negative cases the brief names ──────────────────────
  it('refuses a guest writing to a slip that is not theirs', async () => {
    slipAccessRepo.volunteerHoldsSlip.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/slip/999/items/1/confirm')
      .set('Cookie', authCookie(OTHER))
      .send({ packedQuantity: 5 });

    expect(res.status).toBe(403);
    expect(pickingRepo.setItemStatus).not.toHaveBeenCalled();
  });

  it('refuses completing a slip that is not theirs', async () => {
    slipAccessRepo.volunteerHoldsSlip.mockResolvedValue(false);
    const res = await request(app)
      .post('/api/slip/999/complete')
      .set('Cookie', authCookie(OTHER));

    expect(res.status).toBe(403);
    expect(pickingRepo.completeSlip).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric slip id with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/slip/abc/complete')
      .set('Cookie', authCookie(GUEST));
    expect(res.status).toBe(400);
  });

  it('requires a session for every write', async () => {
    const res = await request(app).post('/api/slip/132/complete');
    expect(res.status).toBe(401);
  });
});

// Guests get this router; staff get /api/picking. Neither borrows the
// other's surface.
describe('role separation', () => {
  it.each([['warehouse_worker', WORKER], ['manager', MANAGER]])(
    'refuses %s on the guest routes', async (_label, user) => {
      const res = await request(app).get('/api/slip/mine').set('Cookie', authCookie(user));
      expect(res.status).toBe(403);
    });

  it('refuses staff on the available list', async () => {
    const res = await request(app).get('/api/slip/available').set('Cookie', authCookie(MANAGER));
    expect(res.status).toBe(403);
  });
});

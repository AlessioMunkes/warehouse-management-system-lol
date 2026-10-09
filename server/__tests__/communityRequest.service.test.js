// ─────────────────────────────────────────────────────────────
// server/__tests__/communityRequest.service.test.js
//
// The service's own rules for benevolent requests: logging, approving
// with items, assigning, claiming, confirming what went out, declining,
// and who may do each. The repositories are mocked; withTransaction runs
// for real against a faked pool client.
//
// The SQL itself — reservation in Available, the row locks, the
// shortage flag — is exercised against a real Postgres in
// __tests__/integration/communityRequest.integration.test.js.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  listRequests:       vi.fn(),
  getRequestById:     vi.fn(),
  createRequest:      vi.fn(),
  lockRequest:        vi.fn(),
  getItems:           vi.fn(),
  markApproved:       vi.fn(),
  replaceItems:       vi.fn(),
  clearShortFlag:     vi.fn(),
  markDeclined:       vi.fn(),
  findAssignableUser: vi.fn(),
  setAssignee:        vi.fn(),
  claimApproved:      vi.fn(),
  markConfirmed:      vi.fn(),
  setReleased:        vi.fn(),
  countPending:       vi.fn(),
};
vi.mock('../src/repositories/communityRequest.repository.js', () => ({ default: repoMock }));

const stockMock = { adjustStock: vi.fn() };
vi.mock('../src/repositories/stock.repository.js', () => ({ default: stockMock }));

const availabilityMock = vi.fn();
vi.mock('../src/repositories/communityRequestStock.repository.js', () => ({
  getAvailability: availabilityMock,
}));

const makeClient = () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() });
const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: service } = await import('../src/services/communityRequest.service.js');

const ACTOR   = { id: 7, role: 'warehouse_worker' };
const MANAGER = { id: 3, role: 'manager' };
const ADMIN   = { id: 2, role: 'admin' };

const requestRow = (over = {}) => ({
  id: 1,
  requested_at: '2026-09-10T09:00:00.000Z',
  caller_name: 'Sister Agnes',
  caller_contact: '021 555 0777',
  items_requested: 'Samp, sugar beans, cooking oil',
  quantity_note: 'Enough for roughly 80 plates',
  outcome: 'pending',
  outcome_note: null,
  handled_by: null,
  resolved_at: null,
  created_at: '2026-09-10T09:00:00.000Z',
  handled_by_first_name: null,
  handled_by_last_name: null,
  items: [],
  ...over,
});

const lockRow = (over = {}) => ({
  id: 1, outcome: 'approved', handled_by: null, assigned_to: null, items_short_at: null, ...over,
});

const line = (over = {}) => ({
  id: 10, product_id: 5, unit: 'kg', quantity_approved: '6', quantity_released: '0', short_at: null, ...over,
});

const available = (over = {}) => ({
  productId: 5, productName: 'Rice', unit: 'kg', quantityOnHand: 10, committed: 0, available: 10, ...over,
});

const body = (over = {}) => ({
  itemsRequested: 'Samp, sugar beans, cooking oil',
  callerName: 'Sister Agnes',
  callerContact: '021 555 0777',
  quantityNote: 'Enough for roughly 80 plates',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.connect.mockResolvedValue(makeClient());
  repoMock.createRequest.mockResolvedValue(requestRow());
  repoMock.getRequestById.mockResolvedValue(requestRow());
  repoMock.listRequests.mockResolvedValue([]);
  repoMock.countPending.mockResolvedValue(2);
  repoMock.lockRequest.mockResolvedValue(lockRow());
  repoMock.getItems.mockResolvedValue([line()]);
  repoMock.markApproved.mockResolvedValue(true);
  repoMock.replaceItems.mockResolvedValue(undefined);
  repoMock.markDeclined.mockResolvedValue(true);
  repoMock.findAssignableUser.mockResolvedValue({ id: 9 });
  repoMock.setAssignee.mockResolvedValue(true);
  repoMock.claimApproved.mockResolvedValue(true);
  repoMock.markConfirmed.mockResolvedValue(true);
  repoMock.setReleased.mockResolvedValue(undefined);
  stockMock.adjustStock.mockResolvedValue({ before: 10, after: 4, isShortfall: false });
  availabilityMock.mockResolvedValue([available()]);
});

describe('createRequest', () => {
  it('requires a description of what was requested', async () => {
    await expect(service.createRequest(body({ itemsRequested: '   ' }), ACTOR))
      .rejects.toMatchObject({ status: 400 });
    expect(repoMock.createRequest).not.toHaveBeenCalled();
  });

  it('requires an authenticated actor (BR-01)', async () => {
    await expect(service.createRequest(body(), null)).rejects.toMatchObject({ status: 400 });
    await expect(service.createRequest(body(), {})).rejects.toMatchObject({ status: 400 });
  });

  it('takes the quantity note as free text, with no numeric validation', async () => {
    await service.createRequest(body({ quantityNote: 'a couple of trays, roughly' }), ACTOR);
    expect(repoMock.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ quantityNote: 'a couple of trays, roughly' }),
      expect.anything(),
    );
  });

  it('maps blank caller fields and a blank quantity note to null', async () => {
    await service.createRequest(
      { itemsRequested: 'Blankets', callerName: '  ', callerContact: '', quantityNote: '' },
      ACTOR,
    );
    expect(repoMock.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ callerName: null, callerContact: null, quantityNote: null }),
      expect.anything(),
    );
  });

  it('passes a valid requested-at timestamp through as ISO', async () => {
    await service.createRequest(body({ requestedAt: '2026-09-10T11:30' }), ACTOR);
    const arg = repoMock.createRequest.mock.calls[0][0];
    expect(new Date(arg.requestedAt).toISOString()).toBe(arg.requestedAt);
  });

  it('rejects an unparseable requested-at', async () => {
    await expect(service.createRequest(body({ requestedAt: 'last Tuesday' }), ACTOR))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a requested-at more than 5 minutes in the future', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await expect(service.createRequest(body({ requestedAt: future }), ACTOR))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('future') });
    expect(repoMock.createRequest).not.toHaveBeenCalled();
  });

  it('allows a requested-at within the 5 minute clock-drift tolerance', async () => {
    const soon = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    await service.createRequest(body({ requestedAt: soon }), ACTOR);
    expect(repoMock.createRequest.mock.calls[0][0].requestedAt).toBe(soon);
  });

  it('does not send an outcome — a new request starts pending at the DB default', async () => {
    await service.createRequest(body(), ACTOR);
    const arg = repoMock.createRequest.mock.calls[0][0];
    expect(arg).not.toHaveProperty('outcome');
  });
});


describe('approve', () => {
  beforeEach(() => repoMock.lockRequest.mockResolvedValue(lockRow({ outcome: 'pending' })));

  it('sets stock aside: marks approved and stores the lines with the stock unit', async () => {
    await service.approve(1, { items: [{ productId: 5, quantity: 6 }] }, MANAGER);
    expect(repoMock.markApproved).toHaveBeenCalledWith(1, 3, expect.anything());
    expect(repoMock.replaceItems).toHaveBeenCalledWith(1, [{ productId: 5, unit: 'kg', quantity: 6 }], expect.anything());
  });

  it('is allowed for a manager and an admin, not a worker', async () => {
    await service.approve(1, { items: [{ productId: 5, quantity: 1 }] }, ADMIN);
    await expect(service.approve(1, { items: [{ productId: 5, quantity: 1 }] }, ACTOR))
      .rejects.toMatchObject({ status: 403 });
  });

  it('refuses more than is Available, naming the product, and writes nothing', async () => {
    availabilityMock.mockResolvedValue([available({ available: 4 })]);
    await expect(service.approve(1, { items: [{ productId: 5, quantity: 6 }] }, MANAGER))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('Rice (4 kg available, 6 kg asked for)') });
    expect(repoMock.markApproved).not.toHaveBeenCalled();
    expect(repoMock.replaceItems).not.toHaveBeenCalled();
  });

  it('asks the stock check about this request, so its own old lines never count against it', async () => {
    await service.approve(1, { items: [{ productId: 5, quantity: 1 }] }, MANAGER);
    expect(availabilityMock).toHaveBeenCalledWith(expect.anything(), [5], { excludeRequestId: 1 });
  });

  it.each([
    ['no items', { items: [] }],
    ['no items key', {}],
    ['zero quantity', { items: [{ productId: 5, quantity: 0 }] }],
    ['negative quantity', { items: [{ productId: 5, quantity: -2 }] }],
    ['a bad product id', { items: [{ productId: 'x', quantity: 1 }] }],
    ['the same product twice', { items: [{ productId: 5, quantity: 1 }, { productId: 5, quantity: 2 }] }],
  ])('rejects %s', async (_label, data) => {
    await expect(service.approve(1, data, MANAGER)).rejects.toMatchObject({ status: 400 });
    expect(repoMock.markApproved).not.toHaveBeenCalled();
  });

  it('rejects a product that is not in the stock list', async () => {
    availabilityMock.mockResolvedValue([]);
    await expect(service.approve(1, { items: [{ productId: 99, quantity: 1 }] }, MANAGER))
      .rejects.toMatchObject({ status: 400 });
  });

  it('only a request awaiting approval can be approved', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ outcome: 'approved' }));
    await expect(service.approve(1, { items: [{ productId: 5, quantity: 1 }] }, MANAGER))
      .rejects.toMatchObject({ status: 409 });
  });

  it('404s when the request does not exist', async () => {
    repoMock.lockRequest.mockResolvedValue(null);
    await expect(service.approve(9, { items: [{ productId: 5, quantity: 1 }] }, MANAGER))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('decline', () => {
  it('works from awaiting approval or approved, and saves the reason', async () => {
    for (const outcome of ['pending', 'approved']) {
      repoMock.lockRequest.mockResolvedValue(lockRow({ outcome }));
      await service.decline(1, { reason: '  Out of area ' }, MANAGER);
      expect(repoMock.markDeclined).toHaveBeenLastCalledWith(1, { reason: 'Out of area', userId: 3 }, expect.anything());
    }
  });

  it('is manager or admin only', async () => {
    await expect(service.decline(1, { reason: 'No' }, ACTOR)).rejects.toMatchObject({ status: 403 });
    await service.decline(1, { reason: 'No' }, ADMIN);
  });

  it('needs a reason', async () => {
    await expect(service.decline(1, { reason: '   ' }, MANAGER)).rejects.toMatchObject({ status: 400 });
    await expect(service.decline(1, {}, MANAGER)).rejects.toMatchObject({ status: 400 });
  });

  it('cannot decline a request that is already closed', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ outcome: 'fulfilled' }));
    await expect(service.decline(1, { reason: 'No' }, MANAGER)).rejects.toMatchObject({ status: 409 });
    expect(repoMock.markDeclined).not.toHaveBeenCalled();
  });
});

describe('assign', () => {
  it('sets the packer on an approved request, manager or admin only', async () => {
    await service.assign(1, { userId: 9 }, MANAGER);
    expect(repoMock.setAssignee).toHaveBeenCalledWith(1, 9, expect.anything());
    await expect(service.assign(1, { userId: 9 }, ACTOR)).rejects.toMatchObject({ status: 403 });
  });

  it('can clear the packer', async () => {
    await service.assign(1, { userId: null }, MANAGER);
    expect(repoMock.setAssignee).toHaveBeenCalledWith(1, null, expect.anything());
  });

  it('only for an approved request, and only an active staff member', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ outcome: 'pending' }));
    await expect(service.assign(1, { userId: 9 }, MANAGER)).rejects.toMatchObject({ status: 409 });
    repoMock.lockRequest.mockResolvedValue(lockRow());
    repoMock.findAssignableUser.mockResolvedValue(null);
    await expect(service.assign(1, { userId: 9 }, MANAGER)).rejects.toMatchObject({ status: 400 });
  });
});

describe('claim', () => {
  it('sets handled_by to the acting user', async () => {
    repoMock.getRequestById.mockResolvedValue(requestRow({ outcome: 'approved', handled_by: 7 }));
    const result = await service.claim(1, ACTOR);
    expect(result.handled_by).toBe(7);
    expect(repoMock.claimApproved).toHaveBeenCalledWith(1, 7, expect.anything());
  });

  it('requires an authenticated actor', async () => {
    await expect(service.claim(1, null)).rejects.toMatchObject({ status: 400 });
    expect(repoMock.claimApproved).not.toHaveBeenCalled();
  });

  it.each([
    ['is not approved', { outcome: 'pending' }, /approved/],
    ['needs new items', { items_short_at: '2026-10-03T08:00:00Z' }, /needs new items/],
    ['is already claimed', { handled_by: 4 }, /already claimed/],
  ])('says why when the request %s', async (_l, over, message) => {
    repoMock.claimApproved.mockResolvedValue(false);
    repoMock.lockRequest.mockResolvedValue(lockRow(over));
    await expect(service.claim(1, ACTOR)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(message) });
  });

  it('404s when the request does not exist', async () => {
    repoMock.claimApproved.mockResolvedValue(false);
    repoMock.lockRequest.mockResolvedValue(null);
    await expect(service.claim(999, ACTOR)).rejects.toMatchObject({ status: 404 });
  });
});

describe('rechooseItems', () => {
  it("replaces the lines, clears the flag and checks Available without the request's own old lines", async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ items_short_at: '2026-10-03T08:00:00Z' }));
    await service.rechooseItems(1, { items: [{ productId: 5, quantity: 2 }] }, MANAGER);
    expect(availabilityMock).toHaveBeenCalledWith(expect.anything(), [5], { excludeRequestId: 1 });
    expect(repoMock.replaceItems).toHaveBeenCalled();
    expect(repoMock.clearShortFlag).toHaveBeenCalledWith(1, expect.anything());
  });

  it('applies the same availability block', async () => {
    availabilityMock.mockResolvedValue([available({ available: 1 })]);
    await expect(service.rechooseItems(1, { items: [{ productId: 5, quantity: 2 }] }, MANAGER))
      .rejects.toMatchObject({ status: 409 });
    expect(repoMock.clearShortFlag).not.toHaveBeenCalled();
  });

  it('is manager or admin only, and only for an approved request', async () => {
    await expect(service.rechooseItems(1, { items: [{ productId: 5, quantity: 1 }] }, ACTOR)).rejects.toMatchObject({ status: 403 });
    repoMock.lockRequest.mockResolvedValue(lockRow({ outcome: 'pending' }));
    await expect(service.rechooseItems(1, { items: [{ productId: 5, quantity: 1 }] }, MANAGER)).rejects.toMatchObject({ status: 409 });
  });
});

describe('confirm', () => {
  const twoLines = () => repoMock.getItems.mockResolvedValue([
    line({ id: 10, product_id: 7, quantity_approved: '3' }),
    line({ id: 11, product_id: 5, quantity_approved: '6' }),
  ]);

  it('releases everything by default → fulfilled, adjusting stock per item in product order', async () => {
    twoLines();
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7 }));
    await service.confirm(1, {}, ACTOR);

    expect(repoMock.markConfirmed).toHaveBeenCalledWith(1, { outcome: 'fulfilled', userId: 7 }, expect.anything());
    const calls = stockMock.adjustStock.mock.calls.map((c) => c[1]);
    expect(calls.map((c) => c.productId)).toEqual([5, 7]);
    expect(calls[0]).toEqual({
      productId: 5, quantityDelta: -6, unit: 'kg', movementType: 'dispatched',
      referenceType: 'community_request', referenceId: 1, reason: 'Benevolent request #1', performedBy: 7,
    });
  });

  it('less than approved → partially fulfilled, and only what went out is deducted', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7 }));
    await service.confirm(1, { items: [{ productId: 5, quantityReleased: 4 }] }, ACTOR);
    expect(repoMock.markConfirmed).toHaveBeenCalledWith(1, { outcome: 'partially_fulfilled', userId: 7 }, expect.anything());
    expect(stockMock.adjustStock.mock.calls[0][1].quantityDelta).toBe(-4);
    expect(repoMock.setReleased).toHaveBeenCalledWith(10, 4, expect.anything());
  });

  it('a line released at zero is allowed while something else went out, and writes no movement for it', async () => {
    twoLines();
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7 }));
    await service.confirm(1, { items: [{ productId: 7, quantityReleased: 0 }] }, ACTOR);
    expect(stockMock.adjustStock).toHaveBeenCalledTimes(1);
    expect(stockMock.adjustStock.mock.calls[0][1].productId).toBe(5);
  });

  it('cannot release more than was approved', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7 }));
    await expect(service.confirm(1, { items: [{ productId: 5, quantityReleased: 7 }] }, ACTOR))
      .rejects.toMatchObject({ status: 400 });
    expect(stockMock.adjustStock).not.toHaveBeenCalled();
  });

  it('releasing nothing is not a fulfilment — that is a decline', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7 }));
    await expect(service.confirm(1, { items: [{ productId: 5, quantityReleased: 0 }] }, ACTOR))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining('decline') });
    expect(repoMock.markConfirmed).not.toHaveBeenCalled();
  });

  it('rejects a product that is not on the request, and a negative quantity', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7 }));
    await expect(service.confirm(1, { items: [{ productId: 99, quantityReleased: 1 }] }, ACTOR)).rejects.toMatchObject({ status: 400 });
    await expect(service.confirm(1, { items: [{ productId: 5, quantityReleased: -1 }] }, ACTOR)).rejects.toMatchObject({ status: 400 });
  });

  it('takes the request out of approved BEFORE deducting stock, so its own reservation is not mistaken for a shortage', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7 }));
    await service.confirm(1, {}, ACTOR);
    expect(repoMock.markConfirmed.mock.invocationCallOrder[0])
      .toBeLessThan(stockMock.adjustStock.mock.invocationCallOrder[0]);
  });

  it('who: the claimer, the assigned packer, or a manager/admin — nobody else', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 4, assigned_to: 8 }));
    await expect(service.confirm(1, {}, ACTOR)).rejects.toMatchObject({ status: 403 });
    await service.confirm(1, {}, { id: 4, role: 'warehouse_worker' });
    await service.confirm(1, {}, { id: 8, role: 'warehouse_worker' });
    await service.confirm(1, {}, MANAGER);
    await service.confirm(1, {}, ADMIN);
    expect(repoMock.markConfirmed).toHaveBeenCalledTimes(4);
  });

  it('refuses a request that needs new items, is not approved, or is already confirmed', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7, items_short_at: '2026-10-03T08:00:00Z' }));
    await expect(service.confirm(1, {}, ACTOR)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('needs new items') });
    repoMock.lockRequest.mockResolvedValue(lockRow({ outcome: 'pending' }));
    await expect(service.confirm(1, {}, MANAGER)).rejects.toMatchObject({ status: 409 });
    repoMock.lockRequest.mockResolvedValue(lockRow({ outcome: 'fulfilled' }));
    await expect(service.confirm(1, {}, MANAGER)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('already been confirmed') });
    expect(stockMock.adjustStock).not.toHaveBeenCalled();
  });

  it('loses cleanly when the status update finds nothing to update (a lost race)', async () => {
    repoMock.lockRequest.mockResolvedValue(lockRow({ handled_by: 7 }));
    repoMock.markConfirmed.mockResolvedValue(false);
    await expect(service.confirm(1, {}, ACTOR)).rejects.toMatchObject({ status: 409 });
    expect(stockMock.adjustStock).not.toHaveBeenCalled();
  });
});

describe('resolve (the old call)', () => {
  it('can no longer fulfil a request: approve it first', async () => {
    for (const outcome of ['fulfilled', 'partially_fulfilled', 'pending', 'referred', 'nonsense', undefined]) {
      await expect(service.resolve(1, { outcome }, MANAGER)).rejects.toMatchObject({ status: 400 });
    }
    expect(repoMock.markDeclined).not.toHaveBeenCalled();
  });

  it('still declines, for a manager or admin, using the note as the reason', async () => {
    await service.resolve(1, { outcome: 'declined', outcomeNote: 'Out of area' }, MANAGER);
    expect(repoMock.markDeclined).toHaveBeenCalledWith(1, { reason: 'Out of area', userId: 3 }, expect.anything());
    await expect(service.resolve(1, { outcome: 'declined', outcomeNote: 'x' }, ACTOR)).rejects.toMatchObject({ status: 403 });
  });
});

describe('listRequests', () => {
  it('passes a valid outcome filter and a trimmed search through', async () => {
    await service.listRequests({ outcome: 'declined', search: '  parcel ' });
    expect(repoMock.listRequests).toHaveBeenCalledWith({ outcome: 'declined', search: 'parcel' });
  });

  it('allows referred and approved as filter values', async () => {
    await service.listRequests({ outcome: 'referred' });
    expect(repoMock.listRequests).toHaveBeenCalledWith({ outcome: 'referred', search: null });
  });

  it('rejects an outcome filter outside the enum', async () => {
    await expect(service.listRequests({ outcome: 'nope' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('normalises a blank search to null', async () => {
    await service.listRequests({ search: '   ' });
    expect(repoMock.listRequests).toHaveBeenCalledWith({ outcome: null, search: null });
  });
});

describe('getRequest', () => {
  it('404s when nothing is found', async () => {
    repoMock.getRequestById.mockResolvedValue(null);
    await expect(service.getRequest(9)).rejects.toMatchObject({ status: 404 });
  });
});

describe('countPending', () => {
  it('returns the repository count as a number', async () => {
    await expect(service.countPending()).resolves.toBe(2);
  });
});

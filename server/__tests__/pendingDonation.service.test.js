import { describe, it, expect, beforeEach, vi } from 'vitest';

const makeClient = () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(),
});

const poolMock = {
  connect: vi.fn(),
  query: vi.fn().mockResolvedValue({ rows: [] }),
};

const pendingRepoMock = {
  findPendingDonationIdByIdempotencyKey: vi.fn(),
  createPendingDonation: vi.fn(),
  createPendingDonationItems: vi.fn(),
  getPendingDonationById: vi.fn(),
  updatePendingDonationStatus: vi.fn(),
  lockPendingDonationForUpdate: vi.fn(),
  lockWarehouseManagerFlagForUpdate: vi.fn(),
  createWarehouseManagerFlag: vi.fn(),
  updateWarehouseManagerFlagPendingDonationLink: vi.fn(),
  countUnresolvedFlagsForPendingDonation: vi.fn(),
  setPendingDonationCommittedId: vi.fn(),
  markPendingItemResolved: vi.fn(),
  markPendingItemCommitted: vi.fn(),
  markPendingItemRejected: vi.fn(),
  listDonationItemsForDonation: vi.fn(),
  listPendingDonationsByStatus: vi.fn(),
};

const donationServiceMock = {
  createDonation: vi.fn(),
  getDonationById: vi.fn(),
};

const donationModelMock = {
  getSection18AThreshold: vi.fn(),
};

const routingMock = {
  determineRouting: vi.fn(),
};

const donationAdminServiceMock = {
  finalizePendingClassification: vi.fn(),
};

vi.mock('../src/config/db.js', () => ({ default: poolMock }));
vi.mock('../src/repositories/pendingDonation.repository.js', () => ({ default: pendingRepoMock }));
vi.mock('../src/repositories/donation.repository.js', () => ({ default: donationModelMock }));
vi.mock('../src/lib/donationRouting.js', () => ({ determineRouting: routingMock.determineRouting }));
vi.mock('../src/services/donationAdmin.service.js', () => ({ default: donationAdminServiceMock }));
vi.mock('../src/services/donation.service.js', () => ({
  default: donationServiceMock,
  evaluateSection18A: vi.fn(({ estimatedValueZar, threshold }) =>
    Number(estimatedValueZar) >= Number(threshold) ? 'queued' : 'not_qualifying'
  ),
  toQualifyingFlag: vi.fn((status) => status === 'queued'),
}));

const { default: pendingDonationService } = await import('../src/services/pendingDonation.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps pending mockResolvedValueOnce queues; a test that
  // queues more connects than its code path consumes would leak its client
  // into the NEXT test's Once queue and shift every assertion. Reset the
  // connect mock outright so every test starts with an empty queue.
  poolMock.connect.mockReset();
  poolMock.query.mockResolvedValue({ rows: [] });
  pendingRepoMock.findPendingDonationIdByIdempotencyKey.mockReset();
  pendingRepoMock.getPendingDonationById.mockReset();
  pendingRepoMock.findPendingDonationIdByIdempotencyKey.mockResolvedValue(null);
  pendingRepoMock.updatePendingDonationStatus.mockResolvedValue({ id: 10 });
  pendingRepoMock.markPendingItemCommitted.mockResolvedValue({ id: 1 });
  pendingRepoMock.setPendingDonationCommittedId.mockResolvedValue({ id: 10, committed_donation_id: 20 });
  donationModelMock.getSection18AThreshold.mockResolvedValue(1000);
  routingMock.determineRouting.mockResolvedValue({
    category: 'recipe_food',
    routing_outcome: 'allocated',
    storage_area: 'dry_store',
    source: 'product_default',
  });
});

describe('pendingDonationService.retryCommit', () => {
  it('repairs commit_incomplete by fetching real donation items and linking by line order', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);

    const pendingDonationState = {
      id: 10,
      status: 'commit_incomplete',
      committed_donation_id: 20,
      items: [
        { id: 101, line_no: 2, status: 'resolved', committed_donation_item_id: null },
        { id: 100, line_no: 1, status: 'resolved', committed_donation_item_id: null },
        { id: 102, line_no: 3, status: 'rejected', committed_donation_item_id: null },
      ],
    };

    pendingRepoMock.getPendingDonationById.mockImplementation(async () => pendingDonationState);
    pendingRepoMock.markPendingItemCommitted.mockImplementation(async (itemId, committedDonationItemId) => {
      const item = pendingDonationState.items.find((row) => row.id === itemId);
      item.status = 'committed';
      item.committed_donation_item_id = committedDonationItemId;
      return item;
    });
    pendingRepoMock.updatePendingDonationStatus.mockImplementation(async (id, status) => {
      pendingDonationState.status = status;
      return pendingDonationState;
    });

    pendingRepoMock.listDonationItemsForDonation.mockResolvedValue([
      { id: 201, donation_id: 20, line_no: 2 },
      { id: 200, donation_id: 20, line_no: 1 },
    ]);

    const result = await pendingDonationService.retryCommit(10);

    expect(pendingRepoMock.listDonationItemsForDonation).toHaveBeenCalledWith(20, poolMock);
    expect(pendingRepoMock.markPendingItemCommitted.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [100, 200],
      [101, 201],
    ]);
    expect(pendingRepoMock.updatePendingDonationStatus).toHaveBeenCalledWith(
      10,
      'committed',
      expect.objectContaining({ committed_at: expect.any(Date) }),
      client
    );
    expect(client.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(result.status).toBe('committed');
    expect(pendingDonationState.items).toEqual([
      expect.objectContaining({ id: 101, status: 'committed', committed_donation_item_id: 201 }),
      expect.objectContaining({ id: 100, status: 'committed', committed_donation_item_id: 200 }),
      expect.objectContaining({ id: 102, status: 'rejected', committed_donation_item_id: null }),
    ]);
  });

  it('does not mark commit_incomplete committed when donation item pairing is incomplete', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);

    pendingRepoMock.getPendingDonationById.mockResolvedValue({
      id: 10,
      status: 'commit_incomplete',
      committed_donation_id: 20,
      items: [
        { id: 100, line_no: 1, status: 'resolved' },
        { id: 101, line_no: 2, status: 'resolved' },
      ],
    });
    pendingRepoMock.listDonationItemsForDonation.mockResolvedValue([{ id: 200, donation_id: 20 }]);

    await expect(pendingDonationService.retryCommit(10)).rejects.toThrow(/expected 2 donation item\(s\), found 1/);

    expect(pendingRepoMock.markPendingItemCommitted).not.toHaveBeenCalled();
    expect(pendingRepoMock.updatePendingDonationStatus).not.toHaveBeenCalledWith(
      10,
      'committed',
      expect.anything(),
      expect.anything()
    );
    expect(client.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
  });


  it('retry of a commit_failed donation transitions to committing before attemptCommit and succeeds end-to-end', async () => {
    const eventLog = [];

    // First lookup: retryCommit's own read sees commit_failed. Second
    // lookup: attemptCommitForPendingDonation's internal read must see the
    // row already in 'committing', proving the transition ran BEFORE
    // attemptCommit's logic (mirrors the setPendingDonationCommittedId
    // WHERE status = 'committing' guard on a real DB).
    pendingRepoMock.getPendingDonationById
      .mockImplementationOnce(async () => {
        eventLog.push('lookup');
        return {
          id: 10,
          status: 'commit_failed',
          items: [
            { id: 100, line_no: 1, status: 'resolved', description: 'Beans', quantity: 2, unit: 'kg' },
          ],
        };
      })
      .mockImplementationOnce(async () => {
        eventLog.push('attempt-lookup');
        return {
          id: 10,
          status: 'committing',
          items: [
            { id: 100, line_no: 1, status: 'resolved', description: 'Beans', quantity: 2, unit: 'kg' },
          ],
        };
      });

    pendingRepoMock.updatePendingDonationStatus.mockImplementation(async (id, status) => {
      eventLog.push(`status:${status}`);
      return { id, status };
    });

    const beginClient = makeClient();
    const finalizeClient = makeClient();
    poolMock.connect
      .mockResolvedValueOnce(beginClient)     // setPendingDonationCommittedId tx
      .mockResolvedValueOnce(finalizeClient); // link items + mark committed tx

    pendingRepoMock.setPendingDonationCommittedId.mockImplementation(async () => {
      eventLog.push('set-committed-id');
      return { id: 10, status: 'committing', committed_donation_id: 20 };
    });
    pendingRepoMock.markPendingItemCommitted.mockResolvedValue({ id: 100 });
    donationServiceMock.createDonation.mockResolvedValue({
      donation: { id: 20, items: [{ id: 200, donation_id: 20, line_no: 1 }] },
    });

    const result = await pendingDonationService.retryCommit(10);

    // Ordering: the 'committing' transition is stamped between retryCommit's
    // own lookup and attemptCommit's internal logic — exactly the fix.
    expect(eventLog).toEqual([
      'lookup',
      'status:committing',
      'attempt-lookup',
      'set-committed-id',
      'status:committed',
    ]);
    expect(pendingRepoMock.updatePendingDonationStatus).toHaveBeenCalledWith(
      10,
      'committing',
      {},
      poolMock
    );
    expect(donationServiceMock.createDonation).toHaveBeenCalledTimes(1);
    expect(pendingRepoMock.setPendingDonationCommittedId).toHaveBeenCalledWith(10, 20, beginClient);
    expect(pendingRepoMock.markPendingItemCommitted).toHaveBeenCalledWith(100, 200, finalizeClient);
    expect(pendingRepoMock.updatePendingDonationStatus).toHaveBeenCalledWith(
      10,
      'committed',
      expect.objectContaining({ committed_at: expect.any(Date) }),
      finalizeClient
    );
    expect(beginClient.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(finalizeClient.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(result).toEqual({ pendingDonationId: 10, donationId: 20, committed: true });
    // The commit_failed re-stamp (the old failure mode) never fires.
    expect(pendingRepoMock.updatePendingDonationStatus).not.toHaveBeenCalledWith(
      10,
      'commit_failed',
      expect.anything(),
      expect.anything()
    );
  });

  it('derives donation category from resolved items when donation_category is blank', async () => {
    const eventLog = [];
    pendingRepoMock.getPendingDonationById
      .mockImplementationOnce(async () => ({
        id: 10,
        status: 'commit_failed',
        donation_category: '',
        donor_name: 'Pick n Pay',
        donor_consent_given: true,
        donor_tax_reference: '9012',
        items: [
          { id: 100, line_no: 1, status: 'resolved', description: 'Tomato', quantity: 5, unit: 'kg', resolved_category: 'recipe_food' },
        ],
      }))
      .mockImplementationOnce(async () => ({
        id: 10,
        status: 'committing',
        donation_category: '',
        donor_name: 'Pick n Pay',
        donor_consent_given: true,
        donor_tax_reference: '9012',
        items: [
          { id: 100, line_no: 1, status: 'resolved', description: 'Tomato', quantity: 5, unit: 'kg', resolved_category: 'recipe_food' },
        ],
      }));

    pendingRepoMock.updatePendingDonationStatus.mockImplementation(async (id, status) => {
      eventLog.push(`status:${status}`);
      return { id, status };
    });

    const beginClient = makeClient();
    const finalizeClient = makeClient();
    poolMock.connect
      .mockResolvedValueOnce(beginClient)
      .mockResolvedValueOnce(finalizeClient);

    pendingRepoMock.setPendingDonationCommittedId.mockResolvedValue({ id: 10, status: 'committing', committed_donation_id: 20 });
    pendingRepoMock.markPendingItemCommitted.mockResolvedValue({ id: 100 });
    donationServiceMock.createDonation.mockResolvedValue({ donation: { id: 20, items: [{ id: 200, donation_id: 20, line_no: 1 }] } });

    const result = await pendingDonationService.retryCommit(10);

    expect(donationServiceMock.createDonation).toHaveBeenCalledTimes(1);
    // The blank donation-level category is derived from the single resolved
    // item's resolved_category instead of being passed through as ''.
    expect(donationServiceMock.createDonation.mock.calls[0][0].category).toBe('recipe_food');
    expect(result).toEqual({ pendingDonationId: 10, donationId: 20, committed: true });
  });

  it('generates missing donation item line numbers during retry reconstruction', async () => {
    pendingRepoMock.getPendingDonationById
      .mockResolvedValueOnce({
        id: 10,
        status: 'commit_failed',
        donation_category: 'recipe_food',
        items: [
          { id: 100, status: 'resolved', description: 'Rice', quantity: 1, unit: 'kg', resolved_category: 'recipe_food' },
          { id: 101, status: 'resolved', description: 'Beans', quantity: 2, unit: 'kg', resolved_category: 'recipe_food' },
        ],
      })
      .mockResolvedValueOnce({
        id: 10,
        status: 'committing',
        donation_category: 'recipe_food',
        items: [
          { id: 100, status: 'resolved', description: 'Rice', quantity: 1, unit: 'kg', resolved_category: 'recipe_food' },
          { id: 101, status: 'resolved', description: 'Beans', quantity: 2, unit: 'kg', resolved_category: 'recipe_food' },
        ],
      });

    const beginClient = makeClient();
    const finalizeClient = makeClient();
    poolMock.connect
      .mockResolvedValueOnce(beginClient)
      .mockResolvedValueOnce(finalizeClient);
    donationServiceMock.createDonation.mockResolvedValue({
      donation: {
        id: 20,
        items: [
          { id: 200, donation_id: 20, line_no: 1 },
          { id: 201, donation_id: 20, line_no: 2 },
        ],
      },
    });

    await pendingDonationService.retryCommit(10);

    expect(donationServiceMock.createDonation.mock.calls[0][0].items.map((item) => item.lineNo)).toEqual([1, 2]);
  });

  it('leaves a mixed-category donation unresolved rather than guessing a category', async () => {
    pendingRepoMock.getPendingDonationById
      .mockImplementationOnce(async () => ({
        id: 11,
        status: 'commit_failed',
        donation_category: '',
        items: [
          { id: 100, line_no: 1, status: 'resolved', description: 'Tomato', quantity: 1, unit: 'kg', resolved_category: 'recipe_food' },
          { id: 101, line_no: 2, status: 'resolved', description: 'Bricks', quantity: 1, unit: 'each', resolved_category: 'non_food' },
        ],
      }))
      .mockImplementationOnce(async () => ({
        id: 11,
        status: 'committing',
        donation_category: '',
        items: [
          { id: 100, line_no: 1, status: 'resolved', description: 'Tomato', quantity: 1, unit: 'kg', resolved_category: 'recipe_food' },
          { id: 101, line_no: 2, status: 'resolved', description: 'Bricks', quantity: 1, unit: 'each', resolved_category: 'non_food' },
        ],
      }));

    pendingRepoMock.updatePendingDonationStatus.mockImplementation(async (id, status) => {
      return { id, status };
    });

    const beginClient = makeClient();
    poolMock.connect.mockResolvedValueOnce(beginClient);
    pendingRepoMock.setPendingDonationCommittedId.mockResolvedValue({ id: 11, status: 'committing', committed_donation_id: 20 });
    donationServiceMock.createDonation.mockRejectedValue(Object.assign(new Error('A donation category is required.'), { status: 400 }));

    await expect(pendingDonationService.retryCommit(11)).rejects.toMatchObject({ status: 400 });
    // createDonation was invoked but the category stayed blank (mixed items
    // must not silently pick one), so the existing 400 guard surfaces it.
    expect(donationServiceMock.createDonation).toHaveBeenCalledTimes(1);
  });

  it('retries commit_incomplete with no committed donation id through committing state', async () => {
    pendingRepoMock.getPendingDonationById
      .mockResolvedValueOnce({
        id: 12,
        status: 'commit_incomplete',
        committed_donation_id: null,
        donation_category: 'recipe_food',
        items: [
          { id: 100, line_no: 1, status: 'resolved', description: 'Rice', quantity: 1, unit: 'kg', resolved_category: 'recipe_food' },
        ],
      })
      .mockResolvedValueOnce({
        id: 12,
        status: 'committing',
        committed_donation_id: null,
        donation_category: 'recipe_food',
        items: [
          { id: 100, line_no: 1, status: 'resolved', description: 'Rice', quantity: 1, unit: 'kg', resolved_category: 'recipe_food' },
        ],
      });

    const beginClient = makeClient();
    const finalizeClient = makeClient();
    poolMock.connect
      .mockResolvedValueOnce(beginClient)
      .mockResolvedValueOnce(finalizeClient);
    donationServiceMock.createDonation.mockResolvedValue({
      donation: { id: 20, items: [{ id: 200, donation_id: 20, line_no: 1 }] },
    });

    const result = await pendingDonationService.retryCommit(12);

    expect(pendingRepoMock.updatePendingDonationStatus).toHaveBeenCalledWith(12, 'committing', {}, poolMock);
    expect(pendingRepoMock.updatePendingDonationStatus).not.toHaveBeenCalledWith(
      12,
      'commit_failed',
      expect.anything(),
      expect.anything()
    );
    expect(result).toEqual({ pendingDonationId: 12, donationId: 20, committed: true });
  });
});

// ── Option A passthrough: legacy (unlinked) flag resolution ──────────────
// D2 keeps legacy flags on the unified resolve endpoint; the no-link branch
// must honour manager-submitted product fields verbatim while preserving the
// old placeholder behavior when they're absent. Intake-linked flags take a
// completely different code path below and must stay untouched by this.
describe('resolveFlagAndMaybeCommit — legacy (unlinked) flag passthrough', () => {
  it('finalizes with explicitly submitted name/sku/storageType/defaultUnit verbatim', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);
    pendingRepoMock.lockWarehouseManagerFlagForUpdate.mockResolvedValue({
      id: 59,
      pending_donation_id: null,
      pending_donation_item_id: null,
    });

    await pendingDonationService.resolveFlagAndMaybeCommit(59, {
      accepted: true,
      category: 'non_food',
      name: 'Canned Beans',
      sku: 'BEANS-1',
      storageType: 'cold',
      defaultUnit: 'units',
      resolvedBy: 7,
    });

    const finalizeCalls = donationAdminServiceMock.finalizePendingClassification.mock.calls;
    expect(finalizeCalls.length).toBe(1);
    // No second argument: the legacy path commits our no-op transaction first
    // and finalizes standalone on the shared pool.
    expect(finalizeCalls[0].length).toBe(1);
    expect(finalizeCalls[0][0]).toEqual({
      flagId: 59,
      name: 'Canned Beans',
      sku: 'BEANS-1',
      storageType: 'cold',
      defaultUnit: 'units',
      category: 'non_food',
      updatedBy: 7,
    });
    expect(client.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
    // Legacy path stops at finalize — never touches pending donation items.
    expect(pendingRepoMock.markPendingItemResolved).not.toHaveBeenCalled();
    expect(pendingRepoMock.markPendingItemRejected).not.toHaveBeenCalled();
  });

  it('still falls back to the original Flag N / FLAG-N placeholders when fields are omitted', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);
    pendingRepoMock.lockWarehouseManagerFlagForUpdate.mockResolvedValue({
      id: 60,
      pending_donation_id: null,
      pending_donation_item_id: null,
    });

    await pendingDonationService.resolveFlagAndMaybeCommit(60, {
      accepted: true,
      category: 'recipe_food',
      resolvedBy: 7,
    });

    const finalizeCalls = donationAdminServiceMock.finalizePendingClassification.mock.calls;
    expect(finalizeCalls.length).toBe(1);
    expect(finalizeCalls[0][0]).toEqual({
      flagId: 60,
      name: 'Flag 60',
      sku: 'FLAG-60',
      storageType: 'dry',
      defaultUnit: 'kg',
      category: 'recipe_food',
      updatedBy: 7,
    });
  });

  it('blank strings fall back too instead of 400ing inside finalize', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);
    pendingRepoMock.lockWarehouseManagerFlagForUpdate.mockResolvedValue({
      id: 61,
      pending_donation_id: null,
      pending_donation_item_id: null,
    });

    await pendingDonationService.resolveFlagAndMaybeCommit(61, {
      accepted: true,
      category: 'recipe_food',
      name: '',
      sku: '',
      resolvedBy: 7,
    });

    const payload = donationAdminServiceMock.finalizePendingClassification.mock.calls[0][0];
    expect(payload.name).toBe('Flag 61');
    expect(payload.sku).toBe('FLAG-61');
    expect(payload.storageType).toBe('dry');
    expect(payload.defaultUnit).toBe('kg');
  });

  it('leaves intake-linked flag resolution completely unchanged', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);
    pendingRepoMock.lockWarehouseManagerFlagForUpdate.mockResolvedValue({
      id: 62,
      pending_donation_id: 10,
      pending_donation_item_id: 100,
    });
    pendingRepoMock.getPendingDonationById.mockResolvedValue({
      id: 10,
      items: [{ id: 100, flag_id: 62, description: 'Rice', unit: 'kg', requested_category: 'recipe_food' }],
    });
    pendingRepoMock.markPendingItemResolved.mockResolvedValue({ id: 100 });
    pendingRepoMock.lockPendingDonationForUpdate.mockResolvedValue({ id: 10, status: 'awaiting_resolution' });
    // One other flag still open on the donation → stays awaiting_resolution,
    // which also keeps us away from the attemptCommit flow entirely.
    pendingRepoMock.countUnresolvedFlagsForPendingDonation.mockResolvedValue(1);

    const result = await pendingDonationService.resolveFlagAndMaybeCommit(62, {
      accepted: true,
      category: 'add_on_food',
      resolvedBy: 7,
    });

    const finalizeCalls = donationAdminServiceMock.finalizePendingClassification.mock.calls;
    expect(finalizeCalls.length).toBe(1);
    // Name/unit come from the pending donation item, NOT the request body...
    expect(finalizeCalls[0][0].name).toBe('Rice');
    expect(finalizeCalls[0][0].defaultUnit).toBe('kg');
    // ...and finalize runs on OUR locked client (self-deadlock guard).
    expect(finalizeCalls[0].length).toBe(2);
    expect(finalizeCalls[0][1]).toBe(client);

    expect(pendingRepoMock.markPendingItemResolved).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ resolvedCategory: 'add_on_food', resolvedBy: 7 }),
      client
    );
    expect(pendingRepoMock.updatePendingDonationStatus).toHaveBeenCalledWith(10, 'awaiting_resolution', {}, client);
    expect(result.status).toBe('awaiting_resolution');
    expect(client.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
  });

  it('uses the finalized product id when classification reuses an existing product', async () => {
    const client = makeClient();
    poolMock.connect
      .mockResolvedValueOnce(client)
      .mockResolvedValueOnce(makeClient())
      .mockResolvedValueOnce(makeClient());

    pendingRepoMock.lockWarehouseManagerFlagForUpdate.mockResolvedValue({
      id: 63,
      product_id: 300,
      pending_donation_id: 10,
      pending_donation_item_id: 100,
    });
    pendingRepoMock.getPendingDonationById
      .mockResolvedValueOnce({
        id: 10,
        status: 'awaiting_resolution',
        donation_category: 'recipe_food',
        items: [{ id: 100, flag_id: 63, description: 'Potatoes', unit: 'kg', quantity: 5, status: 'awaiting_resolution' }],
      })
      .mockResolvedValueOnce({
        id: 10,
        status: 'committing',
        donation_category: 'recipe_food',
        items: [{ id: 100, flag_id: 63, description: 'Potatoes', unit: 'kg', quantity: 5, status: 'resolved', product_id: 999 }],
      });
    donationAdminServiceMock.finalizePendingClassification.mockResolvedValue({
      flag: { id: 63, product_id: 999, status: 'resolved' },
      product: { id: 999, name: 'Potatoes' },
    });
    pendingRepoMock.lockPendingDonationForUpdate.mockResolvedValue({ id: 10, status: 'awaiting_resolution' });
    pendingRepoMock.countUnresolvedFlagsForPendingDonation.mockResolvedValue(0);
    donationServiceMock.createDonation.mockResolvedValue({
      donation: { id: 20, items: [{ id: 200, donation_id: 20, line_no: 1 }] },
    });

    await pendingDonationService.resolveFlagAndMaybeCommit(63, {
      accepted: true,
      category: 'recipe_food',
      name: 'Potatoes',
      resolvedBy: 7,
    });

    expect(pendingRepoMock.markPendingItemResolved).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ productId: 999, resolvedCategory: 'recipe_food' }),
      client
    );
  });
});

describe('pending donation commit finalization', () => {
  it('returns to commit_failed when finalization fails instead of stamping commit_incomplete', async () => {
    const intakeClient = makeClient();
    const idClient = makeClient();
    const finalizeClient = makeClient();
    poolMock.connect
      .mockResolvedValueOnce(intakeClient)
      .mockResolvedValueOnce(idClient)
      .mockResolvedValueOnce(finalizeClient);

    const pendingDonation = {
      id: 10,
      status: 'committing',
      donation_category: 'recipe_food',
      donor_name: 'Ladles Donor',
      donor_tax_reference: '123',
      donor_consent_given: true,
      created_by: 7,
      items: [{ id: 100, line_no: 1, status: 'resolved', description: 'Rice', quantity: 5, unit: 'kg', estimated_value_zar: 1500 }],
    };

    pendingRepoMock.createPendingDonation.mockResolvedValue({ id: 10 });
    pendingRepoMock.createPendingDonationItems.mockResolvedValue([pendingDonation.items[0]]);
    pendingRepoMock.getPendingDonationById.mockResolvedValue(pendingDonation);
    donationServiceMock.createDonation.mockResolvedValue({ donation: { id: 20, items: [{ id: 200, line_no: 1 }] } });
    pendingRepoMock.markPendingItemCommitted.mockRejectedValue(new Error('link write failed'));

    await expect(pendingDonationService.createPendingDonationFromIntake({
      donationCategory: 'recipe_food',
      donorName: 'Ladles Donor',
      donorTaxReference: '123',
      donorConsentGiven: true,
      createdBy: 7,
      items: [{ description: 'Rice', quantity: 5, unit: 'kg', estimatedValueZar: 1500 }],
    })).rejects.toThrow('link write failed');

    expect(pendingRepoMock.updatePendingDonationStatus).toHaveBeenCalledWith(
      10,
      'commit_failed',
      expect.objectContaining({ commit_failed_at: expect.any(Date) }),
      poolMock
    );
    expect(pendingRepoMock.updatePendingDonationStatus).not.toHaveBeenCalledWith(
      10,
      'commit_incomplete',
      expect.anything(),
      poolMock
    );
  });
});

// ── Idempotent intake submit ─────────────────────────────────────────────
// DonationDraftContext reuses one idempotency key per draft on purpose, so
// a retried submit (network blip, double tap, lost response) must answer
// with the original pending donation instead of 500ing on the unique index.
describe('createPendingDonationFromIntake — idempotent replay', () => {
  it('returns the original pending donation without writing again', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);
    pendingRepoMock.findPendingDonationIdByIdempotencyKey.mockResolvedValue({ id: 55 });
    pendingRepoMock.getPendingDonationById.mockResolvedValue({ id: 55, items: [] });

    const result = await pendingDonationService.createPendingDonationFromIntake({
      donorName: 'Retry Donor',
      idempotencyKey: 'KEY-REPLAY-1',
      items: [],
    });

    expect(result.id).toBe(55);
    expect(pendingRepoMock.createPendingDonation).not.toHaveBeenCalled();
    expect(pendingRepoMock.createPendingDonationItems).not.toHaveBeenCalled();
    expect(client.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
  });

  it('answers the lost insert race with the original pending donation', async () => {
    const client = makeClient();
    poolMock.connect.mockResolvedValueOnce(client);
    // First call (pre-lookup): nothing there. Insert loses the race.
    // Second call (post-rollback): the other request's row is visible.
    pendingRepoMock.findPendingDonationIdByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 55 });
    pendingRepoMock.createPendingDonation.mockResolvedValue(null);
    pendingRepoMock.getPendingDonationById.mockResolvedValue({ id: 55, items: [] });

    const result = await pendingDonationService.createPendingDonationFromIntake({
      donorName: 'Race Donor',
      idempotencyKey: 'KEY-RACE-1',
      items: [],
    });

    expect(result.id).toBe(55);
    expect(pendingRepoMock.createPendingDonationItems).not.toHaveBeenCalled();
    expect(client.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('still writes normally when no idempotency key is supplied', async () => {
    const intakeClient = makeClient();
    const beginClient = makeClient();
    const finalizeClient = makeClient();
    poolMock.connect
      .mockResolvedValueOnce(intakeClient)
      .mockResolvedValueOnce(beginClient)
      .mockResolvedValueOnce(finalizeClient);
    pendingRepoMock.createPendingDonation.mockResolvedValue({ id: 77 });
    pendingRepoMock.createPendingDonationItems.mockResolvedValue([{ id: 1 }]);
    pendingRepoMock.updatePendingDonationStatus.mockResolvedValue({ id: 77, status: 'committing' });
    pendingRepoMock.getPendingDonationById
      .mockResolvedValueOnce({ id: 77, items: [{ id: 1, status: 'resolved', line_no: 1 }] })
      .mockResolvedValueOnce({
        id: 77,
        status: 'committing',
        donation_category: 'recipe_food',
        items: [{ id: 1, line_no: 1, status: 'resolved', description: 'Rice', quantity: 1, unit: 'kg' }],
      })
      .mockResolvedValueOnce({
        id: 77,
        status: 'committed',
        committed_donation_id: 20,
        items: [{ id: 1, status: 'committed', line_no: 1 }],
      });
    pendingRepoMock.setPendingDonationCommittedId.mockResolvedValue({ id: 77, status: 'committing', committed_donation_id: 20 });
    pendingRepoMock.markPendingItemCommitted.mockResolvedValue({ id: 1 });
    donationServiceMock.createDonation.mockResolvedValue({ donation: { id: 20, items: [{ id: 200, donation_id: 20, line_no: 1 }] } });

    const result = await pendingDonationService.createPendingDonationFromIntake({
      donorName: 'Plain Donor',
      items: [{ description: 'Rice', quantity: 1, unit: 'kg', resolvedCategory: 'recipe_food', status: 'resolved' }],
    });

    expect(result.id).toBe(77);
    expect(donationServiceMock.createDonation).toHaveBeenCalledTimes(1);
    expect(pendingRepoMock.createPendingDonation).toHaveBeenCalledTimes(1);
    expect(intakeClient.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
  });

  it('carries the pending donation total into the committed donation when line values are blank', async () => {
    const intakeClient = makeClient();
    const beginClient = makeClient();
    const finalizeClient = makeClient();
    poolMock.connect
      .mockResolvedValueOnce(intakeClient)
      .mockResolvedValueOnce(beginClient)
      .mockResolvedValueOnce(finalizeClient);

    pendingRepoMock.createPendingDonation.mockResolvedValue({ id: 88 });
    pendingRepoMock.createPendingDonationItems.mockResolvedValue([{ id: 1 }]);
    pendingRepoMock.updatePendingDonationStatus.mockResolvedValue({ id: 88, status: 'committing' });
    pendingRepoMock.getPendingDonationById
      .mockResolvedValueOnce({ id: 88, items: [{ id: 1, status: 'resolved', line_no: 1 }] })
      .mockResolvedValueOnce({
        id: 88,
        status: 'committing',
        donation_category: 'recipe_food',
        estimated_value_zar: 275,
        items: [{
          id: 1,
          line_no: 1,
          status: 'resolved',
          description: 'Rice',
          quantity: 1,
          unit: 'kg',
          estimated_value_zar: null,
        }],
      })
      .mockResolvedValueOnce({
        id: 88,
        status: 'committed',
        committed_donation_id: 20,
        items: [{ id: 1, status: 'committed' }],
      });
    pendingRepoMock.setPendingDonationCommittedId.mockResolvedValue({ id: 88, status: 'committing', committed_donation_id: 20 });
    pendingRepoMock.markPendingItemCommitted.mockResolvedValue({ id: 1 });
    donationServiceMock.createDonation.mockResolvedValue({ donation: { id: 20, items: [{ id: 200, donation_id: 20, line_no: 1 }] } });

    const result = await pendingDonationService.createPendingDonationFromIntake({
      donationCategory: 'recipe_food',
      estimatedValueZar: 275,
      items: [{ description: 'Rice', quantity: 1, unit: 'kg', requestedCategory: 'recipe_food' }],
    });

    expect(donationServiceMock.createDonation).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedValueZar: 275 }),
      null
    );
    expect(result.status).toBe('committed');
  });
});


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
  poolMock.query.mockResolvedValue({ rows: [] });
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
      { id: 201, donation_id: 20 },
      { id: 200, donation_id: 20 },
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
      donation: { id: 20, items: [{ id: 200, donation_id: 20 }] },
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
});

describe('pending donation commit finalization', () => {
  it('keeps commit_incomplete when item linking fails after the real donation id is persisted', async () => {
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
    donationServiceMock.createDonation.mockResolvedValue({ donation: { id: 20, items: [{ id: 200 }] } });
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
      'commit_incomplete',
      expect.objectContaining({ commit_incomplete_at: expect.any(Date) }),
      poolMock
    );
    expect(pendingRepoMock.updatePendingDonationStatus).not.toHaveBeenCalledWith(
      10,
      'commit_failed',
      expect.anything(),
      poolMock
    );
  });
});

// ─────────────────────────────────────────────────────────────
// server/__tests__/donation.service.test.js
//
// donation.repository.js is mocked, so these tests exercise the
// service's own rules: the three required fields, the Section 18A
// evaluation, the routing decision per category, the proportional
// split, and — the point of the whole module — that an ambiguous
// donation is still recorded rather than rejected.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  getSection18AThreshold: vi.fn(),
  getEligibleEcdCentres:  vi.fn(),
  findByIdempotencyKey:   vi.fn(),
  getProgrammeByCode:     vi.fn(),
  createDonation:         vi.fn(),
  getDonationById:        vi.fn(),
  listDonations:          vi.fn(),
  listUnmatchedItems:     vi.fn(),
  resolveUnmatchedItem:   vi.fn(),
  reclassifyDonation:     vi.fn(),
  listSection18AQueue:    vi.fn(),
  getDonationEvents:      vi.fn(),
};

vi.mock('../src/repositories/donation.repository.js', () => ({ default: repoMock }));

const module = await import('../src/services/donation.service.js');
const donationService = module.default;
const { splitByChildCount, evaluateSection18A, resolveRouting } = module;

const USER_ID = 7;

const validBody = (overrides = {}) => ({
  category:       'recipe_food',
  estimatedValueZar: 500,
  items: [{ productId: 3, description: 'Rice', quantity: 25, unit: 'kg' }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.getSection18AThreshold.mockResolvedValue(1000);
  repoMock.getEligibleEcdCentres.mockResolvedValue([]);
  repoMock.findByIdempotencyKey.mockResolvedValue(null);
  repoMock.createDonation.mockResolvedValue({ donationId: 1, warnings: [] });
  repoMock.getDonationById.mockResolvedValue({ id: 1, category: 'recipe_food' });
});

// ─────────────────────────────────────────────────────────────
// Proportional split (BR-10, add-on food)
// ─────────────────────────────────────────────────────────────
describe('splitByChildCount', () => {
  it('splits in proportion to child count', () => {
    const result = splitByChildCount(100, [
      { id: 1, childCount: 50 },
      { id: 2, childCount: 30 },
      { id: 3, childCount: 20 },
    ]);
    expect(result.map((r) => r.allocatedQuantity)).toEqual([50, 30, 20]);
  });

  // The reason for largest-remainder rather than per-centre rounding:
  // this is the case where naive rounding loses or invents food.
  it('allocates every unit when the split does not divide evenly', () => {
    const result = splitByChildCount(10, [
      { id: 1, childCount: 1 },
      { id: 2, childCount: 1 },
      { id: 3, childCount: 1 },
    ]);
    const total = result.reduce((sum, r) => sum + r.allocatedQuantity, 0);
    expect(total).toBeCloseTo(10, 3);
  });

  it('sums back to the donated quantity for awkward ratios', () => {
    const result = splitByChildCount(7, [
      { id: 1, childCount: 13 },
      { id: 2, childCount: 41 },
      { id: 3, childCount: 7 },
      { id: 4, childCount: 29 },
    ]);
    const total = result.reduce((sum, r) => sum + r.allocatedQuantity, 0);
    expect(total).toBeCloseTo(7, 3);
  });

  it('is deterministic — the same input splits the same way twice', () => {
    const centres = [
      { id: 1, childCount: 11 },
      { id: 2, childCount: 11 },
      { id: 3, childCount: 11 },
    ];
    expect(splitByChildCount(5, centres)).toEqual(splitByChildCount(5, centres));
  });

  it('gives the larger centre the extra unit on a remainder tie', () => {
    const result = splitByChildCount(3, [
      { id: 1, childCount: 10 },
      { id: 2, childCount: 10 },
    ]);
    const total = result.reduce((sum, r) => sum + r.allocatedQuantity, 0);
    expect(total).toBeCloseTo(3, 3);
  });

  it('returns an empty split rather than throwing when there are no centres', () => {
    expect(splitByChildCount(10, [])).toEqual([]);
  });

  it('returns an empty split when every centre has no children', () => {
    expect(splitByChildCount(10, [{ id: 1, childCount: 0 }])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// Section 18A (BR-09)
// ─────────────────────────────────────────────────────────────
describe('evaluateSection18A', () => {
  it('does not qualify below the threshold', () => {
    expect(evaluateSection18A({
      estimatedValueZar: 500, donorName: 'A', donorTaxReference: 'T1', donorConsentGiven: true, threshold: 1000,
    })).toBe('not_qualifying');
  });

  it('queues a qualifying donation with a named donor and tax reference', () => {
    expect(evaluateSection18A({
      estimatedValueZar: 5000, donorName: 'Pick n Pay', donorTaxReference: '9012345678', donorConsentGiven: true, threshold: 1000,
    })).toBe('queued');
  });

  // The case a boolean flag would collapse: qualifying money, but
  // nobody to issue the certificate to.
  it('flags a qualifying donation with no donor as pending rather than queued', () => {
    expect(evaluateSection18A({
      estimatedValueZar: 5000, donorName: '', donorTaxReference: '', donorConsentGiven: false, threshold: 1000,
    })).toBe('qualifying_pending_donor');
  });

  it('treats a name without a tax reference as pending', () => {
    expect(evaluateSection18A({
      estimatedValueZar: 5000, donorName: 'Anon Donor', donorTaxReference: '', donorConsentGiven: true, threshold: 1000,
    })).toBe('qualifying_pending_donor');
  });

  it('leaves the donation unevaluated when no threshold is configured', () => {
    expect(evaluateSection18A({
      estimatedValueZar: 99999, donorName: 'A', donorTaxReference: 'T1', donorConsentGiven: true, threshold: null,
    })).toBe('not_evaluated');
  });

  it('qualifies exactly at the threshold', () => {
    expect(evaluateSection18A({
      estimatedValueZar: 1000, donorName: 'A', donorTaxReference: 'T1', donorConsentGiven: true, threshold: 1000,
    })).toBe('queued');
  });
});

// ─────────────────────────────────────────────────────────────
// Routing (BR-10)
// ─────────────────────────────────────────────────────────────
describe('resolveRouting', () => {
  it('routes matched recipe food to stock', () => {
    expect(resolveRouting({ category: 'recipe_food', productId: 3 })).toBe('allocated');
  });

  it('routes unmatched recipe food to the unmatched queue', () => {
    expect(resolveRouting({ category: 'recipe_food', productId: null })).toBe('unmatched');
  });

  it('routes add-on food with a split to allocated', () => {
    expect(resolveRouting({ category: 'add_on_food', allocationCount: 4 })).toBe('allocated');
  });

  it('leaves add-on food pending when no split could be made', () => {
    expect(resolveRouting({ category: 'add_on_food', allocationCount: 0 })).toBe('pending');
  });

  // Soup-kitchen food is stock, but not ECD stock. Putting it in the
  // single global balance would let a picking slip promise an ECD
  // food that is earmarked elsewhere.
  it('holds soup-kitchen food out of the ECD balance', () => {
    expect(resolveRouting({ category: 'non_recipe_food', productId: 3 }))
      .toBe('awaiting_programme_stock');
  });

  it('never moves stock for non-food', () => {
    expect(resolveRouting({ category: 'non_food', productId: 3 })).toBe('not_stock_bearing');
  });
});

// ─────────────────────────────────────────────────────────────
// createDonation — validation
// ─────────────────────────────────────────────────────────────
describe('createDonation — required fields', () => {
  it('rejects a missing category', async () => {
    await expect(donationService.createDonation(validBody({ category: undefined }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a category outside the four in BR-10', async () => {
    await expect(donationService.createDonation(validBody({ category: 'misc' }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a missing estimated value', async () => {
    await expect(donationService.createDonation(validBody({ estimatedValueZar: undefined }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  // Zero is a real answer — goods with no assessable value still have
  // to be recordable, or the form blocks on the honest response.
  it('accepts an estimated value of zero', async () => {
    await expect(donationService.createDonation(validBody({ estimatedValueZar: 0 }), USER_ID))
      .resolves.toBeTruthy();
  });

  it('rejects a negative estimated value', async () => {
    await expect(donationService.createDonation(validBody({ estimatedValueZar: -5 }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a donation with no items', async () => {
    await expect(donationService.createDonation(validBody({ items: [] }), USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a line with a zero quantity', async () => {
    await expect(donationService.createDonation(
      validBody({ items: [{ description: 'Rice', quantity: 0, unit: 'kg' }] }), USER_ID
    )).rejects.toMatchObject({ status: 400 });
  });

  // A malformed product id would otherwise reach adjustStock inside
  // the transaction and take the whole donation down with it.
  it('rejects a malformed product reference', async () => {
    await expect(donationService.createDonation(
      validBody({ items: [{ productId: 'abc', description: 'Rice', quantity: 5, unit: 'kg' }] }),
      USER_ID
    )).rejects.toMatchObject({ status: 400 });
  });
});

// ─────────────────────────────────────────────────────────────
// createDonation — the never-block rule
// ─────────────────────────────────────────────────────────────
describe('createDonation — records rather than refuses', () => {
  it('records a donation whose items have no product match', async () => {
    const result = await donationService.createDonation(validBody({
      items: [{ description: 'Two crates of unlabelled tinned fish', quantity: 2, unit: 'crate' }],
    }), USER_ID);

    expect(repoMock.createDonation).toHaveBeenCalled();
    const written = repoMock.createDonation.mock.calls[0][0];
    expect(written.items[0].routingStatus).toBe('unmatched');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('records a donation with no donor details at all', async () => {
    await expect(donationService.createDonation(validBody({
      donorName: undefined, donorContact: undefined, donorTaxReference: undefined,
    }), USER_ID)).resolves.toBeTruthy();
  });

  it('records add-on food even when there are no eligible ECDs to split across', async () => {
    repoMock.getEligibleEcdCentres.mockResolvedValue([]);

    const result = await donationService.createDonation(validBody({
      category: 'add_on_food',
      items: [{ description: 'Yoghurt', quantity: 30, unit: 'each' }],
    }), USER_ID);

    expect(repoMock.createDonation).toHaveBeenCalled();
    expect(result.warnings.some((w) => /no active ECD/i.test(w.message))).toBe(true);
  });

  it('warns when a qualifying donation cannot be issued a certificate', async () => {
    const result = await donationService.createDonation(validBody({
      estimatedValueZar: 5000, donorName: '', donorTaxReference: '',
    }), USER_ID);

    const written = repoMock.createDonation.mock.calls[0][0];
    expect(written.section18aStatus).toBe('qualifying_pending_donor');
    expect(result.warnings.some((w) => /Section 18A/.test(w.message))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// createDonation — allocation and trust boundaries
// ─────────────────────────────────────────────────────────────
describe('createDonation — allocation and trust', () => {
  it('attaches a proportional split to add-on food lines', async () => {
    repoMock.getEligibleEcdCentres.mockResolvedValue([
      { id: 1, name: 'A', childCount: 60 },
      { id: 2, name: 'B', childCount: 40 },
    ]);

    await donationService.createDonation(validBody({
      category: 'add_on_food',
      items: [{ description: 'Apples', quantity: 100, unit: 'kg' }],
    }), USER_ID);

    const written = repoMock.createDonation.mock.calls[0][0];
    expect(written.items[0].allocations).toEqual([
      { ecdId: 1, childCount: 60, allocatedQuantity: 60 },
      { ecdId: 2, childCount: 40, allocatedQuantity: 40 },
    ]);
  });

  it('does not split any category other than add-on food', async () => {
    await donationService.createDonation(validBody(), USER_ID);
    expect(repoMock.getEligibleEcdCentres).not.toHaveBeenCalled();
    expect(repoMock.createDonation.mock.calls[0][0].items[0].allocations).toEqual([]);
  });

  // receivedBy comes from the verified JWT. A crafted request must not
  // be able to record a donation as someone else.
  it('takes receivedBy from the session, not the request body', async () => {
    await donationService.createDonation(
      { ...validBody(), receivedBy: 999, userId: 999 }, USER_ID
    );
    expect(repoMock.createDonation.mock.calls[0][0].receivedBy).toBe(USER_ID);
  });
});

// ─────────────────────────────────────────────────────────────
// createDonation — idempotency
// ─────────────────────────────────────────────────────────────
describe('createDonation — retried submit', () => {
  it('returns the original donation without writing again', async () => {
    repoMock.findByIdempotencyKey.mockResolvedValue({ id: 42 });
    repoMock.getDonationById.mockResolvedValue({ id: 42 });

    const result = await donationService.createDonation(
      validBody({ idempotencyKey: 'abc-123' }), USER_ID
    );

    expect(result.duplicate).toBe(true);
    expect(result.donation.id).toBe(42);
    expect(repoMock.createDonation).not.toHaveBeenCalled();
  });

  // The race the pre-check cannot cover: two taps both read "no
  // existing key" before either writes, and the second insert loses
  // the ON CONFLICT. It must still answer with the donation.
  it('handles losing the insert race without erroring', async () => {
    repoMock.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 42 });
    repoMock.createDonation.mockResolvedValue({ duplicate: true });
    repoMock.getDonationById.mockResolvedValue({ id: 42 });

    const result = await donationService.createDonation(
      validBody({ idempotencyKey: 'abc-123' }), USER_ID
    );

    expect(result.duplicate).toBe(true);
    expect(result.donation.id).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────
// Manager actions
// ─────────────────────────────────────────────────────────────
describe('resolveUnmatchedItem', () => {
  it('requires a product', async () => {
    await expect(donationService.resolveUnmatchedItem(1, {}, USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('404s on an unknown line', async () => {
    repoMock.resolveUnmatchedItem.mockResolvedValue({ itemNotFound: true });
    await expect(donationService.resolveUnmatchedItem(1, { productId: 3 }, USER_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  it('409s on a line someone else already resolved', async () => {
    repoMock.resolveUnmatchedItem.mockResolvedValue({ notUnmatched: true, currentStatus: 'allocated' });
    await expect(donationService.resolveUnmatchedItem(1, { productId: 3 }, USER_ID))
      .rejects.toMatchObject({ status: 409 });
  });

  it('passes the resolving user through from the session', async () => {
    repoMock.resolveUnmatchedItem.mockResolvedValue({ resolved: true, movedStock: true });
    await donationService.resolveUnmatchedItem(1, { productId: 3 }, USER_ID);
    expect(repoMock.resolveUnmatchedItem.mock.calls[0][0].resolvedBy).toBe(USER_ID);
  });
});

describe('reclassifyDonation', () => {
  it('requires a reason (BR-10)', async () => {
    await expect(donationService.reclassifyDonation(1, { category: 'non_food' }, USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a blank reason', async () => {
    await expect(donationService.reclassifyDonation(1, { category: 'non_food', reason: '   ' }, USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a category outside the four', async () => {
    await expect(donationService.reclassifyDonation(1, { category: 'misc', reason: 'wrong' }, USER_ID))
      .rejects.toMatchObject({ status: 400 });
  });

  // Stock that already moved is not silently reversed — the change is
  // recorded and the need for a stock correction is surfaced.
  it('flags that stock needs review when moving out of recipe food', async () => {
    repoMock.reclassifyDonation.mockResolvedValue({
      reclassified: true, from: 'recipe_food', to: 'non_food',
    });
    const result = await donationService.reclassifyDonation(
      1, { category: 'non_food', reason: 'Not on any recipe' }, USER_ID
    );
    expect(result.requiresStockReview).toBe(true);
  });

  it('does not flag a stock review when neither side is recipe food', async () => {
    repoMock.reclassifyDonation.mockResolvedValue({
      reclassified: true, from: 'non_food', to: 'add_on_food',
    });
    const result = await donationService.reclassifyDonation(
      1, { category: 'add_on_food', reason: 'Edible after all' }, USER_ID
    );
    expect(result.requiresStockReview).toBe(false);
  });
});
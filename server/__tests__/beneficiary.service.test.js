// ─────────────────────────────────────────────────────────────
// server/__tests__/beneficiary.service.test.js
//
// beneficiary.repository.js is mocked, so these tests exercise the
// service's own rules: name + cohort required, child count optional-
// but-non-negative-if-present, a name clash 409s on both create and
// update, and approval is its own action separate from update — same
// split product.service.test.js uses.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  listBeneficiaries:   vi.fn(),
  getBeneficiaryById:  vi.fn(),
  findByName:          vi.fn(),
  insertBeneficiary:   vi.fn(),
  updateBeneficiary:   vi.fn(),
  setBeneficiaryActive: vi.fn(),
  approveBeneficiary:  vi.fn(),
};

vi.mock('../src/repositories/beneficiary.repository.js', () => ({ default: repoMock }));

const { default: beneficiaryService } = await import('../src/services/beneficiary.service.js');

const BENEFICIARY_ID = 6;

const existingBeneficiary = (over = {}) => ({
  id: BENEFICIARY_ID, name: 'Sunnyside ECD', cohort: 'week1',
  contact_name: 'Jane Doe', child_count: 40,
  is_active: true, approved_at: null, last_collected_date: null, ...over,
});

const body = (over = {}) => ({
  name: 'Sunnyside ECD', cohort: 'week1', contactName: 'Jane Doe', childCount: 40, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findByName.mockResolvedValue(null);
  repoMock.getBeneficiaryById.mockResolvedValue(existingBeneficiary());
  repoMock.insertBeneficiary.mockResolvedValue({ id: 900, ...existingBeneficiary() });
  repoMock.updateBeneficiary.mockResolvedValue(existingBeneficiary());
  repoMock.setBeneficiaryActive.mockResolvedValue(existingBeneficiary());
  repoMock.approveBeneficiary.mockResolvedValue(existingBeneficiary({ approved_at: '2026-08-01' }));
});

describe('listBeneficiaries', () => {
  it('treats the string "true" from a query param as true', async () => {
    repoMock.listBeneficiaries.mockResolvedValue([]);
    await beneficiaryService.listBeneficiaries({ includeInactive: 'true', search: '' });
    expect(repoMock.listBeneficiaries).toHaveBeenCalledWith({ includeInactive: true, search: null });
  });

  it('defaults to excluding inactive beneficiaries and no search filter', async () => {
    repoMock.listBeneficiaries.mockResolvedValue([]);
    await beneficiaryService.listBeneficiaries({});
    expect(repoMock.listBeneficiaries).toHaveBeenCalledWith({ includeInactive: false, search: null });
  });
});

describe('getBeneficiary', () => {
  it('rejects a non-numeric id', async () => {
    await expect(beneficiaryService.getBeneficiary('abc')).rejects.toMatchObject({ status: 400 });
  });

  it('404s when the repository finds nothing', async () => {
    repoMock.getBeneficiaryById.mockResolvedValue(null);
    await expect(beneficiaryService.getBeneficiary(999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('createBeneficiary — validation', () => {
  it('requires a name', async () => {
    await expect(beneficiaryService.createBeneficiary(body({ name: '  ' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('requires a valid cohort', async () => {
    await expect(beneficiaryService.createBeneficiary(body({ cohort: 'week3' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a negative child count', async () => {
    await expect(beneficiaryService.createBeneficiary(body({ childCount: -1 })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts a blank child count as "not recorded", not zero', async () => {
    await beneficiaryService.createBeneficiary(body({ childCount: '' }));
    expect(repoMock.insertBeneficiary).toHaveBeenCalledWith(expect.objectContaining({ childCount: null }));
  });

  it('409s on a name clash', async () => {
    repoMock.findByName.mockResolvedValue(existingBeneficiary());
    await expect(beneficiaryService.createBeneficiary(body())).rejects.toMatchObject({ status: 409 });
  });

  it('is never approved on creation, regardless of what the body claims', async () => {
    await beneficiaryService.createBeneficiary(body({ approvedAt: '2026-01-01' }));
    const call = repoMock.insertBeneficiary.mock.calls[0][0];
    expect(call.approvedAt).toBeUndefined();
  });
});

describe('updateBeneficiary — partial patch semantics', () => {
  it('404s when the target beneficiary does not exist', async () => {
    repoMock.getBeneficiaryById.mockResolvedValue(null);
    await expect(beneficiaryService.updateBeneficiary(BENEFICIARY_ID, { name: 'X' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('rejects an empty patch rather than writing nothing', async () => {
    await expect(beneficiaryService.updateBeneficiary(BENEFICIARY_ID, {}))
      .rejects.toMatchObject({ status: 400 });
  });

  it('only sends fields actually present in the body', async () => {
    await beneficiaryService.updateBeneficiary(BENEFICIARY_ID, { contactName: 'New Contact' });
    const patch = repoMock.updateBeneficiary.mock.calls[0][1];
    expect(patch).toEqual({ contactName: 'New Contact' });
  });

  it('409s when renaming into a name someone else already has', async () => {
    repoMock.findByName.mockResolvedValue(existingBeneficiary({ id: 999 }));
    await expect(beneficiaryService.updateBeneficiary(BENEFICIARY_ID, { name: 'Taken name' }))
      .rejects.toMatchObject({ status: 409 });
  });

  it('excludes the beneficiary\'s own row when checking for a name clash', async () => {
    await beneficiaryService.updateBeneficiary(BENEFICIARY_ID, { name: 'Sunnyside ECD' });
    expect(repoMock.findByName).toHaveBeenCalledWith('Sunnyside ECD', { excludeId: BENEFICIARY_ID });
  });

  it('cannot set approvedAt through a general update', async () => {
    await beneficiaryService.updateBeneficiary(BENEFICIARY_ID, { approvedAt: '2026-01-01', contactName: 'X' });
    const patch = repoMock.updateBeneficiary.mock.calls[0][1];
    expect(patch.approvedAt).toBeUndefined();
  });
});

describe('setBeneficiaryStatus', () => {
  it('requires isActive to be a boolean', async () => {
    await expect(beneficiaryService.setBeneficiaryStatus(BENEFICIARY_ID, { isActive: 'yes' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('404s when the target beneficiary does not exist', async () => {
    repoMock.getBeneficiaryById.mockResolvedValue(null);
    await expect(beneficiaryService.setBeneficiaryStatus(BENEFICIARY_ID, { isActive: false }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('is a no-op (no write) when the status already matches', async () => {
    repoMock.getBeneficiaryById.mockResolvedValue(existingBeneficiary({ is_active: false }));
    const result = await beneficiaryService.setBeneficiaryStatus(BENEFICIARY_ID, { isActive: false });
    expect(repoMock.setBeneficiaryActive).not.toHaveBeenCalled();
    expect(result.is_active).toBe(false);
  });
});

describe('approveBeneficiary', () => {
  it('404s when the target beneficiary does not exist', async () => {
    repoMock.getBeneficiaryById.mockResolvedValue(null);
    await expect(beneficiaryService.approveBeneficiary(BENEFICIARY_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('is a no-op (no write) when already approved', async () => {
    repoMock.getBeneficiaryById.mockResolvedValue(existingBeneficiary({ approved_at: '2026-01-01' }));
    const result = await beneficiaryService.approveBeneficiary(BENEFICIARY_ID);
    expect(repoMock.approveBeneficiary).not.toHaveBeenCalled();
    expect(result.approved_at).toBe('2026-01-01');
  });

  it('approves an unapproved beneficiary', async () => {
    await beneficiaryService.approveBeneficiary(BENEFICIARY_ID);
    expect(repoMock.approveBeneficiary).toHaveBeenCalledWith(BENEFICIARY_ID);
  });
});

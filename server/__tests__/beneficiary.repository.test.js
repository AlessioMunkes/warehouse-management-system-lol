import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMock = { query: vi.fn(), connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit: vi.fn() }));

const { default: repository } = await import('../src/repositories/beneficiary.repository.js');

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.query.mockResolvedValue({ rows: [] });
});

describe('beneficiary.repository contact email mapping', () => {
  it('selects contact_email when listing beneficiaries', async () => {
    await repository.listBeneficiaries();

    expect(poolMock.query.mock.calls[0][0]).toMatch(/e\.contact_email/i);
  });

  it('inserts contact_email on beneficiary creation', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await repository.insertBeneficiary({
      name: 'Little Stars',
      cohort: 'week1',
      contactName: 'Nomsa',
      contactEmail: 'ecd@example.org',
      mobileNumber: '0821234567',
      childCount: 40,
    });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/contact_email/i);
    expect(params).toEqual([
      'Little Stars',
      'week1',
      'Nomsa',
      'ecd@example.org',
      '0821234567',
      40,
    ]);
  });

  it('updates contact_email when contactEmail is supplied', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await repository.updateBeneficiary(1, { contactEmail: null });

    const [sql, params] = poolMock.query.mock.calls[0];
    expect(sql).toMatch(/contact_email = \$1/i);
    expect(params).toEqual([null, 1]);
  });
});

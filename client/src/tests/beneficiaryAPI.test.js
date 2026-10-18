import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
}));

const { apiGet, apiPost, apiPatch } = await import('../services/api');
const api = await import('../services/beneficiaryAPI');

describe('beneficiaryAPI', () => {
  it('maps contact_email to contactEmail', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        id: 1,
        name: 'Little Stars',
        cohort: 'week1',
        contact_name: 'Nomsa',
        contact_email: 'ecd@example.org',
        mobile_number: '0821234567',
        child_count: 40,
        is_active: true,
      },
    });

    await expect(api.getBeneficiary(1)).resolves.toMatchObject({
      contactEmail: 'ecd@example.org',
      mobileNumber: '0821234567',
    });
  });

  it('sends contactEmail unchanged on create and update payloads', async () => {
    const row = {
      id: 1,
      name: 'Little Stars',
      cohort: 'week1',
      contact_email: 'ecd@example.org',
      mobile_number: '0821234567',
      is_active: true,
    };
    apiPost.mockResolvedValueOnce({ data: row });
    apiPatch.mockResolvedValueOnce({ data: row });

    await api.createBeneficiary({ name: 'Little Stars', cohort: 'week1', contactEmail: 'ecd@example.org' });
    await api.updateBeneficiary(1, { contactEmail: 'new@example.org' });

    expect(apiPost).toHaveBeenCalledWith('/api/beneficiaries', {
      name: 'Little Stars',
      cohort: 'week1',
      contactEmail: 'ecd@example.org',
    });
    expect(apiPatch).toHaveBeenCalledWith('/api/beneficiaries/1', { contactEmail: 'new@example.org' });
  });
});

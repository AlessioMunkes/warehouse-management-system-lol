import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/services/donationManagementAPI', () => ({
  default: {
    getPendingDonations: vi.fn(),
  },
  PENDING_DONATION_STATUSES: ['awaiting_resolution', 'committing', 'commit_failed', 'commit_incomplete'],
}));

import donationManagementAPI, { PENDING_DONATION_STATUSES } from '@/services/donationManagementAPI';
import usePendingDonations from '../features/donationManagement/hooks/usePendingDonations';

const DONATION = {
  id: 21,
  donor_name: 'DM Slice1 Intake Verification Donor',
  estimated_value_zar: 90,
  donation_category: 'non_recipe_food',
  status: 'awaiting_resolution',
  created_at: new Date().toISOString(),
  item_counts: { total: 2, resolved: 1, awaiting_resolution: 1, rejected: 0 },
  items: [
    { id: 18, line_no: 1, description: 'accepted line', status: 'resolved', quantity: 3, unit: 'kg' },
    { id: 19, line_no: 2, description: 'awaiting line', status: 'awaiting_resolution', quantity: 2, unit: 'kg' },
  ],
};

describe('usePendingDonations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    donationManagementAPI.getPendingDonations.mockResolvedValue([DONATION]);
  });

  it('loads pending donations across all D4 statuses on mount', async () => {
    const { result } = renderHook(() => usePendingDonations());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(donationManagementAPI.getPendingDonations).toHaveBeenCalledTimes(1);
    expect(donationManagementAPI.getPendingDonations).toHaveBeenCalledWith(PENDING_DONATION_STATUSES);
    expect(result.current.items).toEqual([DONATION]);
    expect(result.current.error).toBe('');
  });

  it('reloads on refresh() and clears any prior error', async () => {
    donationManagementAPI.getPendingDonations.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => usePendingDonations());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('network');

    donationManagementAPI.getPendingDonations.mockResolvedValueOnce([DONATION]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.items).toEqual([DONATION]);
    expect(result.current.error).toBe('');
  });

  it('records a load error instead of throwing', async () => {
    donationManagementAPI.getPendingDonations.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePendingDonations());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.items).toEqual([]);
  });
});

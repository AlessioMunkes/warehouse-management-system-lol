import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/services/donationManagementAPI', () => ({
  default: {
    getFlaggedItems: vi.fn(),
    resolveFlag: vi.fn(),
  },
}));

import donationManagementAPI from '@/services/donationManagementAPI';
import useFlaggedItems from '../features/donationManagement/hooks/useFlaggedItems';

const FLAG = {
  flag_id: 1,
  name: '[Unclassified] Mystery (123)',
  is_active: false,
  quantity_kg: 3,
  reason: 'needs review',
  status: 'pending_classification',
  pending_donation_id: 21,
  pending_donation_item_id: 5,
  donor_name: 'Donor A',
  donation_category: 'non_recipe_food',
};

describe('useFlaggedItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    donationManagementAPI.getFlaggedItems.mockResolvedValue([FLAG]);
  });

  it('loads flagged items on mount', async () => {
    const { result } = renderHook(() => useFlaggedItems());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.items).toEqual([FLAG]);
    expect(donationManagementAPI.getFlaggedItems).toHaveBeenCalledTimes(1);
  });

  it('reloads on refresh() and clears any prior error', async () => {
    donationManagementAPI.getFlaggedItems.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useFlaggedItems());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('boom');

    donationManagementAPI.getFlaggedItems.mockResolvedValueOnce([FLAG]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.items).toEqual([FLAG]);
    expect(result.current.error).toBe('');
  });

  it('submits a resolve, reloads the list, and returns the response', async () => {
    const response = { pendingDonationId: 21, status: 'awaiting_resolution', flagId: 1, finalized: true };
    donationManagementAPI.resolveFlag.mockResolvedValue(response);
    donationManagementAPI.getFlaggedItems.mockResolvedValue([FLAG]);

    const { result } = renderHook(() => useFlaggedItems());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.resolveFlag(1, { accepted: true, category: 'non_recipe_food' });
    });

    expect(donationManagementAPI.resolveFlag).toHaveBeenCalledWith(1, { accepted: true, category: 'non_recipe_food' });
    // refresh() ran again after the resolve (list reloaded).
    expect(donationManagementAPI.getFlaggedItems.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(returned).toEqual(response);
    expect(result.current.error).toBe('');
  });

  it('records a resolve error and returns null (does not throw to the caller)', async () => {
    const boom = new Error('resolve failed');
    donationManagementAPI.resolveFlag.mockRejectedValue(boom);
    donationManagementAPI.getFlaggedItems.mockResolvedValue([FLAG]);

    const { result } = renderHook(() => useFlaggedItems());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.resolveFlag(1, { accepted: true, category: 'x' });
    });

    expect(returned).toBe(null);
    expect(result.current.error).toBe('resolve failed');
  });
});
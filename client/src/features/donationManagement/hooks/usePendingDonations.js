// Data hook for the Pending Donations tab. Loads whole pending_donation
// records (with their item lists) across the D4 scope — the two in-progress
// statuses plus the two failure statuses — in one authenticated call.
// Mirrors useFlaggedItems: the component gets rows + refresh, and a simple
// error string. No resolve/retry submissions live here (those are Flagged
// Items and Reconciliation respectively).

import { useCallback, useEffect, useState } from 'react';
import donationManagementAPI, { PENDING_DONATION_STATUSES } from '@/services/donationManagementAPI';

export default function usePendingDonations() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const rows = await donationManagementAPI.getPendingDonations(PENDING_DONATION_STATUSES);
      setItems(rows);
    } catch (loadError) {
      setError(loadError.message || 'Could not load pending donations.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    items,
    isLoading,
    error,
    refresh,
  };
}
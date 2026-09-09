// Data hook for the Flagged Items tab. Keeps the fetch of
// pending_classification flags plus the resolve submissions in one place,
// mirroring useDonationClassification: the component gets the loaded rows
// and a resolve() it can call; pendingIds holds whichever flag is mid-request.
//
// resolveFlag() returns the unified endpoint's response so the caller can
// read result.status / result.committed / result.finalized to say the right
// thing ("awaiting further resolutions" vs "donation now committing").
// After a successful resolve the list reloads automatically.

import { useCallback, useEffect, useState } from 'react';
import donationManagementAPI from '@/services/donationManagementAPI';

export default function useFlaggedItems() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingFlagIds, setPendingFlagIds] = useState([]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const rows = await donationManagementAPI.getFlaggedItems();
      setItems(rows);
    } catch (loadError) {
      setError(loadError.message || 'Could not load flagged items.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolveFlag = useCallback(async (flagId, payload) => {
    const normalizedId = Number(flagId);

    setPendingFlagIds((current) => (current.includes(normalizedId) ? current : [...current, normalizedId]));
    setError('');

    try {
      const result = await donationManagementAPI.resolveFlag(normalizedId, payload);
      await refresh();
      return result;
    } catch (resolveError) {
      setError(resolveError.message || 'Could not resolve this flag.');
      return null;
    } finally {
      setPendingFlagIds((current) => current.filter((id) => id !== normalizedId));
    }
  }, [refresh]);

  return {
    items,
    isLoading,
    error,
    pendingFlagIds,
    refresh,
    resolveFlag,
  };
}
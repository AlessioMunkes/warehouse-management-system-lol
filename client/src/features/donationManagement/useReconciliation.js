// Data hook for the Reconciliation tab. Reuses getPendingDonations scoped
// to the two failure statuses (commit_failed / commit_incomplete) rather
// than the narrower GET /pending/reconciliation endpoint, so rows arrive
// with full .items / .item_counts already attached — no backend change
// needed to compute "N items already resolved" on commit_incomplete rows.
//
// retryCommit() posts the retry action, then reloads the list on success
// so a resolved row disappears from view. On failure the error is
// attached per-row (via retryingId + retryErrors) rather than replacing
// the whole list with a blanket error banner, so one bad row doesn't hide
// the rest of the queue.

import { useCallback, useEffect, useState } from 'react';
import donationManagementAPI, { RECONCILIATION_STATUSES } from '@/services/donationManagementAPI';

export default function useReconciliationQueue(statuses = RECONCILIATION_STATUSES) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryingIds, setRetryingIds] = useState([]);
  const [rowErrors, setRowErrors] = useState({});

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const rows = await donationManagementAPI.getPendingDonations(statuses);
      setItems(rows);
    } catch (loadError) {
      setError(loadError.message || 'Could not load the reconciliation queue.');
    } finally {
      setIsLoading(false);
    }
  }, [statuses]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const retryCommit = useCallback(async (pendingDonationId) => {
    const normalizedId = Number(pendingDonationId);

    setRetryingIds((current) => (current.includes(normalizedId) ? current : [...current, normalizedId]));
    setRowErrors((current) => {
      const next = { ...current };
      delete next[normalizedId];
      return next;
    });

    try {
      const result = await donationManagementAPI.retryCommit(normalizedId);
      await refresh();
      return result;
    } catch (retryError) {
      setRowErrors((current) => ({
        ...current,
        [normalizedId]: retryError.message || 'Could not retry this commit.',
      }));
      return null;
    } finally {
      setRetryingIds((current) => current.filter((id) => id !== normalizedId));
    }
  }, [refresh]);

  return {
    items,
    isLoading,
    error,
    retryingIds,
    rowErrors,
    refresh,
    retryCommit,
  };
}

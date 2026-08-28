// ─────────────────────────────────────────────────────────────
// features/donationManagement/components/ReconciliationTab.jsx
//
// The Reconciliation tab of the Donation Management page. Shows
// pending_donations stuck in commit_failed / commit_incomplete, each with
// a single Retry commit action — this is the ONLY place in the whole
// feature that offers that action (D3/D4). The Pending Donations tab only
// cross-links here; it never retries directly.
//
// Data comes from getPendingDonations(['commit_failed', 'commit_incomplete'])
// rather than the narrower GET /pending/reconciliation endpoint, so each
// row already carries .items / .item_counts, letting commit_incomplete
// rows show how many items got resolved before the commit failed.
// ─────────────────────────────────────────────────────────────
import { Loader2, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import useReconciliationQueue from '../hooks/useReconciliation';

const fmtValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

const STATUS_META = {
  commit_failed: { label: 'Commit failed' },
  commit_incomplete: { label: 'Commit incomplete' },
};

const statusMeta = (status) => STATUS_META[status] || { label: status || '—' };

const failureTimestamp = (donation) =>
  donation.status === 'commit_failed' ? donation.commit_failed_at : donation.commit_incomplete_at;

const resolvedItemCount = (donation) =>
  (donation.items || []).filter((item) => item.status === 'resolved' || item.status === 'committed').length;

const ErrorBanner = ({ message, onRetry }) => (
  <div className="flex flex-col items-start justify-between gap-3 rounded-[4px] border-2 border-[#ef3a40] bg-[#fff4f2] p-4 text-sm text-[#2b3336] shadow-sm sm:flex-row sm:items-center">
    <span>{message}</span>
    {onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="text-xs font-semibold text-[#ef3a40] underline hover:text-[#2b3336] focus:outline-none sm:text-sm"
      >
        Try again
      </button>
    ) : null}
  </div>
);

const ReconciliationRow = ({ donation, busy, rowError, onRetry }) => {
  const meta = statusMeta(donation.status);
  const isIncomplete = donation.status === 'commit_incomplete';
  const totalItems = donation.item_counts?.total ?? (donation.items || []).length;

  return (
    <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
      <CardHeader className="border-b border-[#e9e3dd] pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#2b3336]">{donation.donor_name || '—'}</span>
              <Badge className="bg-[#fff4e5] text-[#9a4d00] hover:bg-[#fff4e5]">{meta.label}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{fmtValue(donation.estimated_value_zar)}</span>
              <span>{fmtDate(failureTimestamp(donation))}</span>
              {isIncomplete ? (
                <span>{resolvedItemCount(donation)} of {totalItems} item{totalItems === 1 ? '' : 's'} already resolved before the failure</span>
              ) : null}
            </div>
          </div>
          <Button type="button" size="sm" onClick={() => onRetry(donation.id)} disabled={busy}>
            {busy ? <Loader2 className="mr-1 animate-spin" /> : null} Retry commit
          </Button>
        </div>
      </CardHeader>

      {rowError ? (
        <CardContent className="pt-4">
          <ErrorBanner message={rowError} onRetry={() => onRetry(donation.id)} />
        </CardContent>
      ) : null}
    </Card>
  );
};

export default function ReconciliationTab() {
  const {
    items,
    isLoading,
    error,
    retryingIds,
    rowErrors,
    refresh,
    retryCommit,
  } = useReconciliationQueue();

  const busyFor = (id) => retryingIds.includes(Number(id));

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} donation{items.length === 1 ? '' : 's'} stuck in a commit failure state.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
          <RefreshCw className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {isLoading && !error ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {!isLoading && items.length === 0 && !error ? (
        <div className="rounded-[12px] border border-dashed border-[#d9d1cb] bg-white p-8 text-center text-sm text-muted-foreground">
          Nothing needs reconciling right now.
        </div>
      ) : null}

      {!isLoading && items.length > 0 && !error ? (
        <div className="space-y-4">
          {items.map((donation) => (
            <ReconciliationRow
              key={donation.id}
              donation={donation}
              busy={busyFor(donation.id)}
              rowError={rowErrors[donation.id]}
              onRetry={retryCommit}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
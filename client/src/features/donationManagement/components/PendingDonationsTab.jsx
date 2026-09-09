// ─────────────────────────────────────────────────────────────
// features/donationManagement/components/PendingDonationsTab.jsx
//
// The Pending Donations tab of the Donation Management page. Shows whole
// pending_donations records across the D4 scope (awaiting_resolution,
// committing, commit_failed, commit_incomplete) with their full per-item
// breakdown, so an admin sees a donation's context (donor, value,
// category, age, Section 18A status) alongside which items are resolved /
// awaiting / rejected / committed and how each item was routed.
//
// Failure-state donations (commit_failed / commit_incomplete) surface a
// warning badge whose label is a link that jumps to the Reconciliation tab
// (where retry lives) — there is deliberately no retry action here.
//
// Item lists are always shown fully expanded — never collapsed behind a
// click (touch-first PWA). Rejected items are struck through on a greyed
// row with the rejection reason as always-visible text underneath, not a
// hover-only tooltip.
// ─────────────────────────────────────────────────────────────
import { RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import usePendingDonations from '../hooks/usePendingDonations';

const isFailureStatus = (status) => status === 'commit_failed' || status === 'commit_incomplete';



const fmtValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return `R ${Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};


const fmtAge = (value) => {
  if (!value) return '';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatCategoryLabel = (category = '') =>
  category.replace(/_/g, ' ');

// Status display metadata for item chips.
// Donation status badge metadata. Failure states get the warning variant and
// their label text doubles as a link to the Reconciliation tab.
const DONATION_STATUS_META = {
  awaiting_resolution: { label: 'Awaiting resolution', variant: 'neutral' },
  committing: { label: 'Committing', variant: 'neutral' },
  commit_failed: { label: 'Commit failed — reconcile', variant: 'warning' },
  commit_incomplete: { label: 'Commit incomplete — reconcile', variant: 'warning' },
};

const donationStatusMeta = (status) =>
  DONATION_STATUS_META[status] || { label: status || '—', variant: 'neutral' };

// Item status chip metadata.
const ITEM_STATUS_META = {
  awaiting_resolution: { label: 'Awaiting', tone: 'neutral' },
  resolved: { label: 'Resolved', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
  committed: { label: 'Committed', tone: 'success' },
};

const itemStatusMeta = (status) =>
  ITEM_STATUS_META[status] || { label: status || '—', tone: 'neutral' };

const ItemStatusChip = ({ status }) => {
  const meta = itemStatusMeta(status);
  const base = 'inline-flex items-center rounded-[6px] px-2 py-0.5 text-xs font-medium';
  if (meta.tone === 'success') return <span className={`${base} bg-[#e6f4ea] text-[#1d7a3a]`}>{meta.label}</span>;
  if (meta.tone === 'danger') return <span className={`${base} bg-[#ffe3e3] text-[#b42318]`}>{meta.label}</span>;
  return <span className={`${base} bg-[#eef2f4] text-[#2b3336]`}>{meta.label}</span>;
};

const DonationStatusBadge = ({ donation, onStatusClick }) => {
  const meta = donationStatusMeta(donation.status);
  const isFailure = isFailureStatus(donation.status);

  if (isFailure) {
    return (
      <button
        type="button"
        onClick={onStatusClick}
        className="cursor-pointer rounded-[6px] bg-[#fff4e5] px-2.5 py-1 text-xs font-medium text-[#9a4d00] underline"
      >
        {meta.label}
      </button>
    );
  }

  if (donation.status === 'committing') {
    return <Badge className="bg-[#e8f0fe] text-[#1563c0] hover:bg-[#e8f0fe]">Committing</Badge>;
  }

  return (
    <Badge className="bg-[#eef2f4] text-[#2b3336] hover:bg-[#eef2f4]">{meta.label}</Badge>
  );
};

const PendingItemRow = ({ item }) => {
  const isRejected = item.status === 'rejected';

  return (
    <TableRow className={isRejected ? 'bg-[#faf8f6]' : undefined}>
      <TableCell className="font-mono text-xs text-muted-foreground">{item.line_no}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className={isRejected ? 'line-through text-muted-foreground' : ''}>{item.description || item.name || '—'}</span>
          {isRejected && item.rejection_reason ? (
            <span className="mt-1 text-xs text-[#b42318]">{item.rejection_reason}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{item.routing_status || '—'}</TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span>{Number(item.quantity || 0).toLocaleString('en-ZA')} {item.unit || item.default_unit || ''}</span>
          <ItemStatusChip status={item.status} />
        </div>
      </TableCell>
    </TableRow>
  );
};

const PendingDonationCard = ({ donation, onStatusClick }) => {
  const counts = donation.item_counts || {};

  return (
    <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
      <CardHeader className="border-b border-[#e9e3dd] pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#2b3336]">{donation.donor_name || '—'}</span>
              {donation.donation_category ? (
                <Badge className="bg-[#eef2f4] text-[#2b3336] hover:bg-[#eef2f4]">{formatCategoryLabel(donation.donation_category)}</Badge>
              ) : null}
              {donation.section_18a_status ? (
                <Badge className="bg-[#f3ecfb] text-[#5b2a86] hover:bg-[#f3ecfb]">
                  Section 18A: {donation.section_18a_status}
                </Badge>
              ) : null}
              <DonationStatusBadge donation={donation} onStatusClick={onStatusClick} />
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{fmtValue(donation.estimated_value_zar)}</span>
              <span>{fmtAge(donation.created_at)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">
              {counts.total ?? 0} item{counts.total === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="px-4 py-2 text-xs text-muted-foreground border-b border-[#e9e3dd]">
          {counts.resolved ?? 0} resolved · {counts.awaiting_resolution ?? 0} awaiting · {counts.rejected ?? 0} rejected
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Routing</TableHead>
              <TableHead className="text-right">Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(donation.items || []).map((item) => (
              <PendingItemRow key={item.id} item={item} />
            ))}
            {(donation.items || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No items on this donation.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

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

export default function PendingDonationsTab({ onReconcileTab }) {
  const { items: donations, isLoading, error, refresh } = usePendingDonations();

  const handleStatusClick = (donation) => {
    if (isFailureStatus(donation.status) && onReconcileTab) {
      onReconcileTab();
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {donations.length} pending donation{donations.length === 1 ? '' : 's'} across awaiting-resolution, committing and the commit-failure states.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
          <RefreshCw className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {isLoading && !error ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : null}

      {!isLoading && donations.length === 0 && !error ? (
        <div className="rounded-[12px] border border-dashed border-[#d9d1cb] bg-white p-8 text-center text-sm text-muted-foreground">
          No pending donations match the current scope.
        </div>
      ) : null}

      {!isLoading && donations.length > 0 && !error ? (
        <div className="space-y-4">
          {donations.map((donation) => (
            <PendingDonationCard
              key={donation.id}
              donation={donation}
              onStatusClick={() => handleStatusClick(donation)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
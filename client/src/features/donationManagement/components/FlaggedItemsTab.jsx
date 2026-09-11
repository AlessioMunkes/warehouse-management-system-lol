// ─────────────────────────────────────────────────────────────
// features/donationManagement/components/FlaggedItemsTab.jsx
//
// The Flagged Items tab of the Donation Management page. Renders one
// card per warehouse_manager_flags row with status='pending_classification'.
// Two sources: items connected to a donation (pending_donation_id != null,
// shown with donor context, badged "From a donation") and standalone items
// with no donation record behind them (badged "Standalone item"). Every
// resolution — accept/reject of donation-linked items and the
// standalone finalize-style resolve — goes through the single unified
// endpoint via useFlaggedItems().resolveFlag() (D1/D2).
//
// Placeholder indicators: an unmatched intake item's placeholder product is
// named '[Unclassified] …' and kept is_active = false until a manager
// resolves it, so we badge those rows as placeholders.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PRODUCT_CLASSIFICATION_CATEGORIES } from '@/services/donationManagementAPI';
import useFlaggedItems from '../hooks/useFlaggedItems';

const formatCategoryLabel = (category = '') =>
  category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// The unified resolve endpoint returns two shapes. Intake resolutions come
// back as { pendingDonationId, status, committed?, finalized }; legacy
// resolutions are the finalize { product, flag, message }.
const isIntakeResponse = (result) =>
  Boolean(result && result.pendingDonationId != null);

const resolveMessage = (result = {}) => {
  if (!isIntakeResponse(result)) return 'Resolved.';
  if (result.committed === true) return 'Donation now committing — all items resolved.';
  if (result.status === 'committing') return 'Donation now committing.';
  return 'Awaiting further resolutions.';
};

const isPlaceholder = (row = {}) =>
  String(row.name || '').startsWith('[Unclassified]') || row.is_active === false;
const IntakeFlagRow = ({ flag, busy, onResolve }) => {
  const [category, setCategory] = useState(flag.donation_category || '');
  const [rejectReason, setRejectReason] = useState('');
  const [message, setMessage] = useState('');

  const handleClassify = async () => {
    if (!category) return;
    const result = await onResolve(flag.flag_id, { accepted: true, category });
    if (result) setMessage(resolveMessage(result));
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    const result = await onResolve(flag.flag_id, { accepted: false, reason: rejectReason.trim() });
    if (result) setMessage(resolveMessage(result));
  };

  return (
    <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
      <CardHeader className="border-b border-[#e9e3dd] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[#eef2f4] text-[#2b3336] hover:bg-[#eef2f4]">From a donation</Badge>
            {isPlaceholder(flag) ? <Badge variant="outline">Placeholder</Badge> : null}
            <span className="text-sm font-medium text-[#2b3336]">
              {flag.item_description || flag.name || 'Unnamed item'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {flag.quantity_kg != null ? `${flag.quantity_kg} kg` : ''}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {[flag.donor_name, flag.donation_category].filter(Boolean).join(' · ') || '—'}
        </p>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="mb-4 rounded-[8px] bg-[#f7f3ee] p-3 text-sm text-[#4c5659]">
          <strong className="text-[#2b3336]">Staff note:</strong>{' '}
          {flag.reason || 'No extra reason provided.'}
        </div>

        {/* Part B — the full item list that arrived with this donation, so
            the reviewing admin sees what came in alongside the flagged
            line, not just the flagged line itself. Never shown on
            standalone rows (there is no donation behind them). */}
        {Array.isArray(flag.donation_items) && flag.donation_items.length > 0 ? (
          <div className="mb-4 rounded-[8px] border border-[#e9e3dd] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Donation items ({flag.donation_items.length})
            </p>
            <ul className="space-y-1 text-sm text-[#4c5659]">
              {flag.donation_items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{item.line_no}.</span>
                  <span>{item.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit}
                  </span>
                  {item.status && item.status !== 'awaiting_resolution' ? (
                    <Badge variant="outline" className="text-[10px]">
                      {item.status}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {message ? (
          <div className="mb-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[220px] bg-[#f8f5f2]" aria-label="Resolution category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CLASSIFICATION_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{formatCategoryLabel(cat)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={handleClassify} disabled={!category || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Classify
            </Button>
          </div>

          <div className="grid gap-2">
            <Textarea
              aria-label="Rejection reason"
              placeholder="Reason for rejection (required to reject)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
            />
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={handleReject}
                disabled={!rejectReason.trim() || busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : <X className="mr-1" />} Reject
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
const LegacyFlagRow = ({ flag, busy, onResolve }) => {
  const [name, setName] = useState(flag.name || '');
  const [storageType, setStorageType] = useState(flag.storage_type || 'dry');
  const [defaultUnit, setDefaultUnit] = useState(flag.default_unit || 'kg');
  const [category, setCategory] = useState(flag.donation_category || '');
  const [message, setMessage] = useState('');

  // No SKU field: the SKU is a system-generated internal reference, not a
  // business decision. It is deliberately omitted from the payload so the
  // server falls back to its auto-generated placeholder (FLAG-<flagId>),
  // which was the pre-existing fallback behavior.
  const handleResolve = async () => {
    const result = await onResolve(flag.flag_id, {
      accepted: true,
      name,
      storageType,
      defaultUnit,
      category,
    });
    if (result) setMessage(resolveMessage(result));
  };

  return (
    <Card className="rounded-[12px] border border-[#e9e3dd] shadow-sm">
      <CardHeader className="border-b border-[#e9e3dd] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[#fdf1e7] text-[#2b3336] hover:bg-[#fdf1e7]">Standalone item</Badge>
            {isPlaceholder(flag) ? <Badge variant="outline">Placeholder</Badge> : null}
            <span className="text-sm font-medium text-[#2b3336]">
              {flag.name || 'Unnamed item'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {flag.quantity_kg != null ? `${flag.quantity_kg} kg` : ''}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="mb-4 rounded-[8px] bg-[#f7f3ee] p-3 text-sm text-[#4c5659]">
          <strong className="text-[#2b3336]">Staff note:</strong>{' '}
          {flag.reason || 'No extra reason provided.'}
        </div>

        {message ? (
          <div className="mb-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#2b3336]">
            Item name
            <Input className="mt-1 bg-[#f8f5f2]" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-[#2b3336]">
            Storage type
            <Select value={storageType} onValueChange={setStorageType}>
              <SelectTrigger className="mt-1 w-full bg-[#f8f5f2]" aria-label="Storage type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dry">Dry</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm font-medium text-[#2b3336]">
            Default unit
            <Input className="mt-1 bg-[#f8f5f2]" value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-[#2b3336] sm:col-span-2">
            Donation category
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 w-full bg-[#f8f5f2]" aria-label="Donation category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CLASSIFICATION_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{formatCategoryLabel(cat)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={handleResolve} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : null} Resolve
          </Button>
        </div>
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

// Part C — filter values. NOTE: this queue only contains UNRESOLVED flags,
// so no row carries a final routing outcome yet. What exists per row is
// donation_category (the BR-10 four-value enum) on donation-linked rows —
// standalone rows and rows whose donor left the category blank have none.
// The filter therefore works on donation_category, with an explicit
// "No category yet" bucket so awaiting-review rows are never silently
// dropped. Default (no filter) shows everything, as before.
const CATEGORY_FILTER_ALL = 'all';
const CATEGORY_FILTER_NONE = 'none';

export default function FlaggedItemsTab() {
  const {
    items,
    isLoading,
    error,
    pendingFlagIds,
    refresh,
    resolveFlag,
  } = useFlaggedItems();

  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_FILTER_ALL);

  const filteredItems = items.filter((flag) => {
    if (categoryFilter === CATEGORY_FILTER_ALL) return true;
    if (categoryFilter === CATEGORY_FILTER_NONE) return !flag.donation_category;
    return flag.donation_category === categoryFilter;
  });

  const handleResolve = async (flagId, payload) => {
    const result = await resolveFlag(flagId, payload);
    return result;
  };

  const busyFor = (flagId) => pendingFlagIds.includes(Number(flagId));

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {categoryFilter === CATEGORY_FILTER_ALL
            ? `${items.length} flagged item${items.length === 1 ? '' : 's'} awaiting review.`
            : `${filteredItems.length} of ${items.length} flagged item${items.length === 1 ? '' : 's'} shown.`}
        </p>
        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[240px] bg-[#f8f5f2]" aria-label="Filter by category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CATEGORY_FILTER_ALL}>All categories</SelectItem>
              {PRODUCT_CLASSIFICATION_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{formatCategoryLabel(cat)}</SelectItem>
              ))}
              <SelectItem value={CATEGORY_FILTER_NONE}>No category yet</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {isLoading && !error ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : null}

      {!isLoading && items.length === 0 && !error ? (
        <div className="rounded-[12px] border border-dashed border-[#d9d1cb] bg-white p-8 text-center text-sm text-muted-foreground">
          No flagged items pending review.
        </div>
      ) : null}

      {!isLoading && items.length > 0 && filteredItems.length === 0 && !error ? (
        <div className="rounded-[12px] border border-dashed border-[#d9d1cb] bg-white p-8 text-center text-sm text-muted-foreground">
          No flagged items match this category filter.
        </div>
      ) : null}

      {!isLoading && filteredItems.length > 0 && !error ? (
        <div className="space-y-4">
          {filteredItems.map((flag) =>
            flag.pending_donation_id != null ? (
              <IntakeFlagRow key={flag.flag_id} flag={flag} busy={busyFor(flag.flag_id)} onResolve={handleResolve} />
            ) : (
              <LegacyFlagRow key={flag.flag_id} flag={flag} busy={busyFor(flag.flag_id)} onResolve={handleResolve} />
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
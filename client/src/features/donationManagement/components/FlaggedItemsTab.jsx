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
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';

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
import { PRODUCT_CLASSIFICATION_CATEGORIES } from '@/services/donationManagementAPI';
import { ProductMatchCombobox } from '@/features/donation/components/ProductMatchComboBox';
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

const REVIEW_ROUTES = [
  { value: 'recipe_food', label: 'Recipe Food' },
  { value: 'add_on_food', label: 'ECD Add-on' },
  { value: 'non_recipe_food', label: 'Soup Kitchen Add-on' },
];

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
};

const parseSnapshot = (snapshot) => {
  if (!snapshot) return null;
  if (typeof snapshot === 'object') return snapshot;
  try {
    return JSON.parse(snapshot);
  } catch {
    return null;
  }
};

const getSnapshotItem = (flag = {}) => {
  const snapshot = parseSnapshot(flag.draft_snapshot);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  return items.find((item) =>
    Number(item.lineNo ?? item.line_no) === Number(flag.line_no)
    || String(item.description || '').trim() === String(flag.item_description || '').trim()
  ) || null;
};

const IntakeFlagRow = ({ flag, busy, onResolve }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProductCategory, setSelectedProductCategory] = useState('');
  const [newProductName, setNewProductName] = useState(flag.item_description || flag.name || '');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductCategory, setNewProductCategory] = useState(flag.donation_category || '');
  const [message, setMessage] = useState('');

  const snapshotItem = getSnapshotItem(flag);
  const qty = flag.item_quantity ?? snapshotItem?.quantity ?? '-';
  const weight = snapshotItem?.weight ?? snapshotItem?.weightKg ?? snapshotItem?.weight_kg ?? flag.quantity_kg ?? '-';
  const expiry = snapshotItem?.expiryDate ?? snapshotItem?.expiry_date ?? null;
  const donationLabel = flag.pending_donation_id ? `Donation #${flag.pending_donation_id}` : 'Donation';

  const resolve = async (payload) => {
    const result = await onResolve(flag.flag_id, payload);
    if (result) setMessage(resolveMessage(result));
  };

  return (
    <Card className="rounded-[12px] border border-line shadow-sm">
      <CardHeader className="border-b border-line pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-chip text-ink hover:bg-chip">From a donation</Badge>
            {isPlaceholder(flag) ? <Badge variant="outline">Placeholder</Badge> : null}
            <span className="text-sm font-medium text-ink">
              {flag.item_description || flag.name || 'Unnamed item'}
            </span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen((value) => !value)}>
            <ChevronDown className={`mr-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} /> Review
          </Button>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <span><strong className="text-ink">Donation:</strong> {donationLabel}</span>
          <span><strong className="text-ink">Donor:</strong> {flag.donor_name || '-'}</span>
          <span><strong className="text-ink">Qty:</strong> {qty}</span>
          <span><strong className="text-ink">Weight:</strong> {weight === '-' ? '-' : `${weight} kg`}</span>
          <span><strong className="text-ink">Expiry:</strong> {formatDate(expiry)}</span>
          <span><strong className="text-ink">Date:</strong> {formatDate(flag.donation_date || flag.flagged_at)}</span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="mb-4 rounded-[8px] bg-canvas p-3 text-sm text-ink-soft">
          <strong className="text-ink">Staff note:</strong>{' '}
          {flag.reason || 'No extra reason provided.'}
        </div>

        {/* Part B — the full item list that arrived with this donation, so
            the reviewing admin sees what came in alongside the flagged
            line, not just the flagged line itself. Never shown on
            standalone rows (there is no donation behind them). */}
        {Array.isArray(flag.donation_items) && flag.donation_items.length > 0 ? (
          <div className="mb-4 rounded-[8px] border border-line p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Donation items ({flag.donation_items.length})
            </p>
            <ul className="space-y-1 text-sm text-ink-soft">
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
          <div className="mb-4 rounded-[8px] border border-good bg-good-soft px-4 py-3 text-sm text-good">
            {message}
          </div>
        ) : null}

        {isOpen ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-[8px] border border-line p-3">
              <h3 className="text-sm font-semibold text-ink">Match Existing Product</h3>
              <div className="mt-3">
                <ProductMatchCombobox
                  value={selectedProductId}
                  label={selectedProductName}
                  onSelect={(id, label) => {
                    setSelectedProductId(id);
                    setSelectedProductName(label);
                  }}
                />
              </div>
              <div className="mt-3">
                <Select value={selectedProductCategory} onValueChange={setSelectedProductCategory}>
                  <SelectTrigger className="bg-canvas" aria-label="Existing product route">
                    <SelectValue placeholder="Choose route" />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_ROUTES.map((route) => (
                      <SelectItem key={route.value} value={route.value}>{route.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="mt-3"
                onClick={() => resolve({
                  decision: 'match_existing_product',
                  productId: selectedProductId,
                  category: selectedProductCategory,
                })}
                disabled={!selectedProductId || !selectedProductCategory || busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : null} Link Product
              </Button>
            </div>

            <div className="rounded-[8px] border border-line p-3">
              <h3 className="text-sm font-semibold text-ink">Create Product</h3>
              <div className="mt-3 grid gap-3">
                <Input aria-label="New product name" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} />
                <Input aria-label="Brand" placeholder="Brand (optional)" value={newProductBrand} onChange={(e) => setNewProductBrand(e.target.value)} />
                <Select value={newProductCategory} onValueChange={setNewProductCategory}>
                  <SelectTrigger className="bg-canvas" aria-label="Product route">
                    <SelectValue placeholder="Choose route" />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_ROUTES.map((route) => (
                      <SelectItem key={route.value} value={route.value}>{route.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="mt-3"
                onClick={() => resolve({
                  decision: 'create_product',
                  product: {
                    name: newProductName.trim(),
                    brand: newProductBrand.trim() || null,
                    category: newProductCategory,
                  },
                })}
                disabled={!newProductName.trim() || !newProductCategory || busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : null} Save Product
              </Button>
            </div>

            <div className="rounded-[8px] border border-line p-3">
              <h3 className="text-sm font-semibold text-ink">Move to Non-Food</h3>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => resolve({ decision: 'move_to_non_food' })}
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : null} Move to Non-Food
              </Button>
            </div>
          </div>
        ) : null}
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
    <Card className="rounded-[12px] border border-line shadow-sm">
      <CardHeader className="border-b border-line pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-warn-soft text-ink hover:bg-warn-soft">Standalone item</Badge>
            {isPlaceholder(flag) ? <Badge variant="outline">Placeholder</Badge> : null}
            <span className="text-sm font-medium text-ink">
              {flag.name || 'Unnamed item'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {flag.quantity_kg != null ? `${flag.quantity_kg} kg` : ''}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="mb-4 rounded-[8px] bg-canvas p-3 text-sm text-ink-soft">
          <strong className="text-ink">Staff note:</strong>{' '}
          {flag.reason || 'No extra reason provided.'}
        </div>

        {message ? (
          <div className="mb-4 rounded-[8px] border border-good bg-good-soft px-4 py-3 text-sm text-good">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink">
            Item name
            <Input className="mt-1 bg-canvas" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-ink">
            Storage type
            <Select value={storageType} onValueChange={setStorageType}>
              <SelectTrigger className="mt-1 w-full bg-canvas" aria-label="Storage type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dry">Dry</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm font-medium text-ink">
            Default unit
            <Input className="mt-1 bg-canvas" value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-ink sm:col-span-2">
            Route
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 w-full bg-canvas" aria-label="Route">
                <SelectValue placeholder="Select route" />
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
  <div className="flex flex-col items-start justify-between gap-3 rounded-[4px] border-2 border-brand bg-danger-soft p-4 text-sm text-ink shadow-sm sm:flex-row sm:items-center">
    <span>{message}</span>
    {onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="text-xs font-semibold text-brand underline hover:text-ink focus:outline-none sm:text-sm"
      >
        Try again
      </button>
    ) : null}
  </div>
);

export default function FlaggedItemsTab() {
  const {
    items,
    isLoading,
    error,
    pendingFlagIds,
    refresh,
    resolveFlag,
  } = useFlaggedItems();

  const handleResolve = async (flagId, payload) => {
    const result = await resolveFlag(flagId, payload);
    return result;
  };

  const busyFor = (flagId) => pendingFlagIds.includes(Number(flagId));

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} product review item{items.length === 1 ? '' : 's'} awaiting review.
        </p>
        <div className="flex items-center gap-2">
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
        <div className="rounded-[12px] border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-muted-foreground">
          No pending product reviews.
        </div>
      ) : null}

      {!isLoading && items.length > 0 && !error ? (
        <div className="space-y-4">
          {items.map((flag) =>
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

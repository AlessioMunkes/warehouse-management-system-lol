// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/components/ApproveItemsPanel.jsx
//
// "Approve and choose items", and "Choose other items" for an approved
// request whose stock was used by a pallet. The manager sees what the
// caller asked for, then picks real products from the stock list with a
// quantity each, with the amount available beside every one.
//
// Available is what can still be set aside: on hand minus packed
// pallets minus every other approved request. For a request being
// re-chosen, its own approved lines are added back, because they are
// the ones being replaced. The server checks again and has the last
// word.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import DetailPanel from '@/components/ui/detail-panel';
import ErrorBanner from '@/components/ui/error-banner';
import { fmtQty } from '@/lib/quantity';
import ProductPickerDialog from '../../InventoryManagement/components/ProductPickerDialog';
import { shortProductNames } from '../requestViews';

const asNumber = (text) => {
  const n = Number(text);
  return text !== '' && Number.isFinite(n) ? n : null;
};

export default function ApproveItemsPanel({
  request, mode = 'approve', products, onSubmit, onDecline, onClose, busy = false, error = null,
}) {
  const choosingOther = mode === 'rechoose';

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  // What this request already has set aside, per product: those lines
  // are being replaced, so they count as available to it.
  const ownReserved = useMemo(() => {
    const own = new Map();
    for (const i of request.items) {
      if (!i.shortAt) own.set(i.productId, (own.get(i.productId) ?? 0) + i.quantityApproved);
    }
    return own;
  }, [request.items]);

  const availableFor = (productId) => {
    const p = byId.get(productId);
    return p ? p.available + (ownReserved.get(productId) ?? 0) : 0;
  };

  // Choosing other items starts from the lines that are still fine.
  const [lines, setLines] = useState(() => (choosingOther
    ? request.items.filter((i) => !i.shortAt).map((i) => ({
      productId: i.productId, name: i.productName, unit: i.unit, quantity: String(i.quantityApproved),
    }))
    : []));
  const [picking, setPicking] = useState(false);

  const setQuantity = (productId, quantity) =>
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  const remove = (productId) => setLines((ls) => ls.filter((l) => l.productId !== productId));

  const problems = lines.map((l) => {
    const q = asNumber(l.quantity);
    if (q === null || q <= 0) return 'Enter a quantity above zero.';
    const max = availableFor(l.productId);
    if (q > max) return `Only ${fmtQty(Math.max(max, 0), l.unit)} available.`;
    return null;
  });
  const canSubmit = !busy && lines.length > 0 && problems.every((p) => p === null) && products !== null;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })));
  };

  const short = shortProductNames(request);
  const chosen = new Set(lines.map((l) => l.productId));
  const choices = (products ?? []).filter((p) => !chosen.has(p.id));

  return (
    <>
      <DetailPanel
        open
        onClose={onClose}
        eyebrow={choosingOther ? 'Choose other items' : 'Approve and choose items'}
        title={request.callerName || 'An unnamed caller'}
        actions={(
          <>
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              {choosingOther ? 'Save new items' : 'Approve'}
            </Button>
            <Button type="button" variant="outline" onClick={onDecline} disabled={busy}>
              Decline
            </Button>
          </>
        )}
      >
        <ErrorBanner message={error} />

        {choosingOther && short.length ? (
          <p role="status" className="rounded-md bg-warn-soft p-3 text-sm text-warn">
            Pallet packing used the stock set aside for {short.join(', ')}.
            Choose other items, or decline the request.
          </p>
        ) : null}

        <section className="space-y-1 text-sm">
          <h3 className="text-sm font-medium">What they asked for</h3>
          <p className="whitespace-pre-line">{request.itemsRequested}</p>
          {request.quantityNote ? (
            <p className="whitespace-pre-line text-muted-foreground">{request.quantityNote}</p>
          ) : null}
          {request.callerContact ? (
            <p className="text-muted-foreground">{request.callerContact}</p>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Items to give</h3>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => setPicking(true)} disabled={products === null || busy}
            >
              <Plus /> Add a product
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Choose the products and quantities to give. Available stock is shown beside each one.
          </p>

          {products === null ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : lines.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              No products chosen yet.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border" aria-label="Items to give">
              {lines.map((l, index) => (
                <li key={l.productId} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtQty(Math.max(availableFor(l.productId), 0), l.unit)} available
                    </p>
                    {problems[index] && l.quantity !== '' ? (
                      <p role="alert" className="mt-1 text-xs text-danger">{problems[index]}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Input
                      type="number" inputMode="decimal" min="0" step="any"
                      value={l.quantity}
                      onChange={(e) => setQuantity(l.productId, e.target.value)}
                      aria-label={`Quantity of ${l.name}`}
                      aria-invalid={(problems[index] && l.quantity !== '') || undefined}
                      className="h-9 w-24 text-right tabular-nums"
                    />
                    <span className="w-10 text-xs text-muted-foreground">{l.unit}</span>
                    <Button
                      type="button" variant="ghost" size="icon-sm"
                      onClick={() => remove(l.productId)} aria-label={`Remove ${l.name}`}
                    >
                      <X />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DetailPanel>

      {picking ? (
        <ProductPickerDialog
          products={choices}
          title="Add a product"
          description="Which product?"
          onPick={(p) => {
            setLines((ls) => [...ls, { productId: p.id, name: p.name, unit: p.unit, quantity: '' }]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

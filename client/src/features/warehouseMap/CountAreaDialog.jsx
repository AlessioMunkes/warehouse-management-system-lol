// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/CountAreaDialog.jsx
//
// "What is in this area?" A manager stands at an area and records what
// they see: the products already recorded there come filled in with
// about how much the map thinks is left, to be corrected, and anything
// else is added from a search. Saving records the area's count; taking
// a product off the list records that the area no longer holds it.
//
// It never changes stock. The panel shows the count beside what is on
// hand afterwards, and a difference is corrected with Adjust stock.
//
// With nothing typed in the search, the products with the most stock
// not yet placed are suggested, cold products for a cold room and dry
// ones elsewhere: they are what a first walk round the warehouse is
// placing.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtQtyUnit } from '@/lib/stockWording';
import { qtyInput } from '@/lib/quantity';
import { matchesSearch } from '../inventory/inventoryViews';

const SUGGESTED = 5;

const fitsArea = (product, area) => (area.kind === 'cold' ? product.storageType === 'cold' : product.storageType !== 'cold');

export default function CountAreaDialog({ area, products, onSave, onClose, isSaving = false }) {
  const [lines, setLines] = useState(() => area.items
    .filter((i) => i.about > 0)
    .map((i) => ({ productId: i.productId, name: i.name, unit: i.unit, quantity: qtyInput(i.about) })));
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);

  const listed = useMemo(() => new Set(lines.map((l) => l.productId)), [lines]);
  const choices = useMemo(() => {
    const open = products.filter((p) => !listed.has(p.id));
    if (query.trim()) return open.filter((p) => matchesSearch(p, query)).slice(0, 8);
    return open
      .filter((p) => p.unplaced > 0 && fitsArea(p, area))
      .sort((a, b) => b.unplaced - a.unplaced)
      .slice(0, SUGGESTED);
  }, [products, listed, query, area]);

  const add = (p) => {
    setLines((ls) => [...ls, { productId: p.id, name: p.name, unit: p.unit, quantity: p.unplaced > 0 ? qtyInput(p.unplaced) : '' }]);
    setQuery('');
  };
  const change = (productId, quantity) => setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  const remove = (productId) => setLines((ls) => ls.filter((l) => l.productId !== productId));

  const save = async (e) => {
    e.preventDefault();
    const bad = lines.find((l) => l.quantity === '' || !Number.isFinite(Number(l.quantity)) || Number(l.quantity) < 0);
    if (bad) { setError(`Enter how much ${bad.name} you counted, or take it off the list.`); return; }
    setError(null);
    await onSave(lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="contents">
          <DialogHeader>
            <DialogTitle>Count {area.name}</DialogTitle>
            <DialogDescription>Enter what you see in this area. Take off anything that is no longer here.</DialogDescription>
          </DialogHeader>

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Nothing recorded here yet. Add a product below.
            </p>
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border" aria-label="Counted products">
              {lines.map((l) => (
                <li key={l.productId} className="flex items-center gap-2 px-3 py-2">
                  <label htmlFor={`count-${l.productId}`} className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</label>
                  <Input
                    id={`count-${l.productId}`}
                    type="number" inputMode="decimal" min="0" step="any"
                    className="w-24 text-right tabular-nums"
                    value={l.quantity}
                    onChange={(e) => change(l.productId, e.target.value)}
                  />
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">{l.unit}</span>
                  <Button
                    type="button" variant="ghost" size="icon-sm"
                    aria-label={`Take ${l.name} off the list`}
                    onClick={() => remove(l.productId)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search" className="pl-8" placeholder="Add a product by name or SKU"
                aria-label="Add a product by name or SKU" value={query} onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {choices.length > 0 ? (
              <ul className="divide-y rounded-lg border" aria-label={query.trim() ? 'Matching products' : 'Not placed yet'}>
                {!query.trim() ? (
                  <li className="px-3 py-1.5 text-xs text-muted-foreground">Not placed yet</li>
                ) : null}
                {choices.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button" onClick={() => add(p)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">{p.sku}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {p.unplaced > 0 ? `${fmtQtyUnit(p.unplaced, p.unit)} not placed` : `${fmtQtyUnit(p.onHand, p.unit)} on hand`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim() ? (
              <p className="py-2 text-center text-sm text-muted-foreground">No product matches.</p>
            ) : null}
          </div>

          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save count'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

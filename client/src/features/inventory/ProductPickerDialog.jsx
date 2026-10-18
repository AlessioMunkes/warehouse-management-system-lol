// ─────────────────────────────────────────────────────────────
// client/src/features/inventory/ProductPickerDialog.jsx
//
// "Which product?" — the step before an adjustment when it starts from
// the page header rather than from a product's own row or panel.
// Search by name or SKU; picking one hands it back.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fmtQty } from '@/lib/quantity';
import { matchesSearch } from './inventoryViews';

const SHOWN = 8;

export default function ProductPickerDialog({ products, title, description, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(
    () => products.filter((p) => matchesSearch(p, query)).slice(0, SHOWN),
    [products, query],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus type="search" className="pl-8" placeholder="Search by product or SKU"
            aria-label="Search by product or SKU" value={query} onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {matches.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No product matches.</p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Matching products">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">{p.sku}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {fmtQty(p.available, p.unit)} available
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

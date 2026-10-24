// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/PreferredStockPicker.jsx
//
// What an area is meant for, in Warehouse layout: whole product
// categories (every product of "Canned goods"), single products, or
// both. Stock nobody has counted into an area is shown in the area meant
// for it; a product named here wins over its category named elsewhere
// (the server's features/warehouseMap/placement.js).
//
//   products     the catalogue: [{ id, name, sku, category }]
//   productIds   the chosen products
//   categories   the chosen categories
//   onChange     ({ productIds, categories }) => void
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { matchesSearch } from '../inventory/inventoryViews';

const SHOWN = 6;

export default function PreferredStockPicker({ products = [], productIds = [], categories = [], onChange }) {
  const [query, setQuery] = useState('');

  const allCategories = useMemo(
    () => [...new Set(products.map((p) => p.category?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const chosenCategories = new Set(categories.map((c) => c.toLowerCase()));
  const chosen = productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean);
  const matches = query.trim()
    ? products.filter((p) => !productIds.includes(p.id) && matchesSearch(p, query)).slice(0, SHOWN)
    : [];

  const toggleCategory = (c) => onChange({
    productIds,
    categories: chosenCategories.has(c.toLowerCase())
      ? categories.filter((x) => x.toLowerCase() !== c.toLowerCase())
      : [...categories, c],
  });
  const addProduct = (p) => { onChange({ productIds: [...productIds, p.id], categories }); setQuery(''); };
  const removeProduct = (id) => onChange({ productIds: productIds.filter((x) => x !== id), categories });

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Preferred stock</legend>

      {allCategories.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categories">
          {allCategories.map((c) => {
            const on = chosenCategories.has(c.toLowerCase());
            return (
              <button
                key={c} type="button" aria-pressed={on} onClick={() => toggleCategory(c)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  on ? 'border-ink bg-ink text-on-ink' : 'border-line text-muted-foreground hover:bg-muted',
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      ) : null}

      {chosen.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Preferred products">
          {chosen.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1 text-xs">
              {p.name}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => removeProduct(p.id)} className="rounded-full p-0.5 hover:bg-muted">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <Search aria-hidden="true" className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search" className="pl-8" placeholder="Add a product"
          aria-label="Add a preferred product" value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {matches.length > 0 ? (
        <ul className="divide-y rounded-lg border" aria-label="Matching products">
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => addProduct(p)} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50">
                {p.name}
                <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}

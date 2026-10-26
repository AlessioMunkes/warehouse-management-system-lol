// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/CountAreaDialog.jsx
//
// "What is in this area?" A manager stands at an area and records what
// they see: the products the map shows there (counted before, or
// expected because the area is meant for them) come filled in with about
// how much the map thinks is there, to be corrected, and anything else is
// added from a search. Saving records the area's count; taking
// a product off the list records that the area no longer holds it.
//
// It never changes stock. The panel shows the count beside what is on
// hand afterwards, and a difference is corrected with Adjust stock.
//
// With nothing typed in the search, suggestions come first from the
// stock the area is meant for, then the products with the most stock
// not yet placed (cold products for a cold room, dry ones elsewhere):
// they are what a walk round the warehouse is placing.
//
// SCANNING. The Barcode box (a USB or Bluetooth scanner types into it)
// and the camera count by scan, the same way Receiving does: the first
// scan of a product replaces the figure it came in with, each one
// after adds its units per scan, and a product not yet on the list is
// added. A code nobody has linked is pointed at the name search, which
// is how this count worked before.
// ─────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from 'react';
import { Camera, Search, X } from 'lucide-react';
import useBarcodeReader from '../scan/useBarcodeReader';
import PalletScanner from '../scan/PalletScanner';
import ScanFlash from '../scan/ScanFlash';
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
  const [lines, setLines] = useState(() => {
    // A product can be both counted here and expected here: one line, both added.
    const byProduct = new Map();
    for (const i of area.items.filter((x) => x.about > 0)) {
      const line = byProduct.get(i.productId) ?? { productId: i.productId, name: i.name, unit: i.unit, total: 0 };
      line.total += i.about;
      byProduct.set(i.productId, line);
    }
    return [...byProduct.values()].map(({ total, ...l }) => ({ ...l, quantity: qtyInput(Math.round(total * 1000) / 1000) }));
  });
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);

  const listed = useMemo(() => new Set(lines.map((l) => l.productId)), [lines]);
  const choices = useMemo(() => {
    const open = products.filter((p) => !listed.has(p.id));
    if (query.trim()) return open.filter((p) => matchesSearch(p, query)).slice(0, 8);
    const ids = new Set(area.preferredProductIds ?? []);
    const categories = new Set((area.preferredCategories ?? []).map((c) => c.toLowerCase()));
    const meant = open.filter((p) => ids.has(p.id) || categories.has(String(p.category ?? '').toLowerCase()));
    const spare = open
      .filter((p) => !meant.includes(p) && p.unplaced > 0 && fitsArea(p, area))
      .sort((a, b) => b.unplaced - a.unplaced);
    return [...meant, ...spare].slice(0, SUGGESTED);
  }, [products, listed, query, area]);

  const add = (p) => {
    setLines((ls) => [...ls, { productId: p.id, name: p.name, unit: p.unit, quantity: p.unplaced > 0 ? qtyInput(p.unplaced) : '' }]);
    setQuery('');
  };
  // What each product has been scanned up to. A ref so two scans
  // answered at once both count.
  const scanned = useRef(new Map());
  const [barcode, setBarcode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTrouble, setCameraTrouble] = useState(false);

  const countScan = (match) => {
    const count = Math.round(((scanned.current.get(match.productId) ?? 0) + match.unitsPerScan) * 1000) / 1000;
    scanned.current.set(match.productId, count);
    const unit = products.find((p) => p.id === match.productId)?.unit ?? match.defaultUnit ?? '';
    setLines((ls) => (ls.some((l) => l.productId === match.productId)
      ? ls.map((l) => (l.productId === match.productId ? { ...l, quantity: qtyInput(count) } : l))
      : [...ls, { productId: match.productId, name: match.productName, unit, quantity: qtyInput(count) }]));
    return `${match.productName}: ${count} counted.`;
  };
  const reader = useBarcodeReader({ onMatch: countScan, screen: 'stock_count', referenceId: area.id ?? null });

  const scanTyped = (e) => {
    // Enter is how a scanner ends a code; it must not save the count.
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = barcode;
    setBarcode('');
    if (text.trim()) reader.read(text);
  };

  const change = (productId, quantity) => {
    // A typed correction is where the next scan adds from.
    if (scanned.current.has(productId)) scanned.current.set(productId, Number(quantity) || 0);
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  };
  const remove = (productId) => {
    scanned.current.delete(productId);
    setLines((ls) => ls.filter((l) => l.productId !== productId));
  };

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
        <ScanFlash signal={reader.scanned} label="Scanned" />
        <form onSubmit={save} className="contents">
          <DialogHeader>
            <DialogTitle>Manage {area.name}</DialogTitle>
            <DialogDescription>Enter what you see in this area. Take off anything that is no longer here.</DialogDescription>
          </DialogHeader>

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Nothing recorded here yet. Add a product below.
            </p>
          ) : (
            <ul className="max-h-[min(18rem,35dvh)] divide-y overflow-y-auto rounded-lg border" aria-label="Counted products">
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
            <div className="flex gap-2">
              <Input
                aria-label="Barcode" placeholder="Scan or type a barcode" autoComplete="off"
                value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={scanTyped}
              />
              <Button
                type="button" variant="outline" aria-pressed={cameraOpen}
                onClick={() => { setCameraOpen((o) => !o); setCameraTrouble(false); }}
              >
                <Camera />
                {cameraOpen ? 'Close camera' : 'Camera'}
              </Button>
            </div>
            {cameraOpen ? (
              cameraTrouble
                ? <p className="text-sm text-muted-foreground">The camera could not start. Type the numbers under the bars instead.</p>
                : <PalletScanner kind="product" label="Camera for barcodes" torchLabel="Torch" onCode={reader.read} onUnavailable={() => setCameraTrouble(true)} />
            ) : null}
            {reader.looking ? <p role="status" className="text-sm text-muted-foreground">Looking it up</p> : null}
            {reader.unknownCode ? (
              <p role="status" className="text-sm text-muted-foreground">
                {reader.unknownCode} is not linked to a product yet. Add the product by name below.
              </p>
            ) : reader.message ? (
              <p role="status" className={`text-sm ${reader.message.tone === 'warn' ? 'text-danger' : 'text-muted-foreground'}`}>
                {reader.message.text}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search" className="pl-8" placeholder="Add a product by name or SKU"
                aria-label="Add a product by name or SKU" value={query} onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {choices.length > 0 ? (
              <ul className="divide-y rounded-lg border" aria-label={query.trim() ? 'Matching products' : 'Suggested products'}>
                {!query.trim() ? (
                  <li className="px-3 py-1.5 text-xs text-muted-foreground">Suggested</li>
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
                        {p.unplaced > 0 ? `${fmtQtyUnit(p.unplaced, p.unit)} not placed` : `${fmtQtyUnit(p.shelf ?? p.onHand, p.unit)} on the shelves`}
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

          {/* Pinned to the bottom of the dialog, so Save is always in
              reach however long the list of products grows. */}
          <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 border-t bg-popover px-6 pt-3 pb-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save count'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

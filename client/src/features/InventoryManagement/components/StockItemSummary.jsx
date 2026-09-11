// ─────────────────────────────────────────────────────────────
// client/src/features/InventoryManagement/components/StockItemSummary.jsx
//
// One product, everything about it, opened by clicking its row.
//
// The manifest row is a line in a table: eight numbers you read
// sideways. This is the same product read downwards — the figures with
// their labels, the catalogue facts that never fitted in a column, and
// the balance over time. It is what the row was always pointing at.
//
// WHY IT CARRIES THE CATALOGUE FIELDS
// Category, storage type, perishability and weight are product master
// data, and until now the only way to see them was the Products screen.
// Putting them here is what makes it honest to take Products off the
// manager's sidebar: the manager reads them where they are already
// looking, and the one thing this panel cannot do — change them — is a
// single click away at the bottom.
//
// The two existing actions come along rather than being replaced.
// Adjust and History were on the row and are still reachable from it;
// they are here too because this is where somebody decides they need
// them.
// ─────────────────────────────────────────────────────────────
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { Pencil, History, SlidersHorizontal } from 'lucide-react';
import BalanceChart from './BalanceChart';
import { ADMIN } from '../../../routes/paths';

const num = (v, unit) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}${unit ? ` ${unit}` : ''}`;
};

const text = (v) => {
  const s = (v ?? '').toString().trim();
  return s === '' ? '—' : s;
};

const titleCase = (v) => {
  const s = text(v);
  return s === '—' ? s : s.charAt(0).toUpperCase() + s.slice(1);
};

// The four figures, in the order the warehouse reasons about them:
// what is here, what is already promised, what is left, and the line
// under which "what is left" is a problem.
const Figure = ({ label, value, tone = 'ink' }) => (
  <div className="min-w-0">
    <dt className="text-xs text-[#676767]">{label}</dt>
    <dd className={`text-lg font-semibold ${tone === 'warn' ? 'text-[#ef3a40]' : 'text-[#2b3336]'}`}>
      {value}
    </dd>
  </div>
);

const Fact = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs text-[#676767]">{label}</dt>
    <dd className="break-words text-sm text-[#2b3336]">{value}</dd>
  </div>
);

export default function StockItemSummary({
  product,
  movements = [],
  isLoading = false,
  error = null,
  canAdjust = false,
  // Whether this person can edit the catalogue at all. A manager can
  // adjust stock but not change a product, so offering them a button
  // into Product Management would land them on a screen with every
  // control disabled.
  canEditCatalogue = false,
  onAdjust,
  onViewHistory,
  onClose,
}) {
  const navigate = useNavigate();
  if (!product) return null;

  const unit = product.unit || product.defaultUnit || '';
  const statusLabel = product.isShortfall ? 'Shortfall'
    : product.isLowStock ? 'Low stock'
    : 'In stock';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          {/* break-words on both: generated product names and 30-character
              SKUs have no spaces to wrap at, and an unbreakable string in
              a grid child sets the width of the whole dialog. */}
          <DialogTitle className="min-w-0 break-words">{product.name}</DialogTitle>
          <DialogDescription className="min-w-0 break-words">
            {text(product.sku)} · {statusLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="On hand"   value={num(product.onHand, unit)} />
            <Figure label="Committed" value={num(product.committed, unit)} />
            <Figure label="Available" value={num(product.available, unit)}
                    tone={product.isShortfall || product.isLowStock ? 'warn' : 'ink'} />
            <Figure label="Reorder at" value={num(product.reorderAt, unit)} />
          </dl>

          <section>
            <h3 className="mb-1 text-sm font-semibold text-[#2b3336]">Balance over time</h3>
            {error ? (
              <p className="py-4 text-sm text-[#ef3a40]">{error}</p>
            ) : isLoading ? (
              <Skeleton className="h-[150px] w-full" />
            ) : (
              <BalanceChart
                movements={movements}
                onHand={product.onHand}
                reorderAt={product.reorderAt}
                unit={unit}
              />
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-[#2b3336]">Catalogue</h3>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Fact label="Category"     value={text(product.category)} />
              <Fact label="Default unit" value={text(product.defaultUnit || product.unit)} />
              <Fact label="Storage"      value={titleCase(product.storageType)} />
              <Fact label="Perishable"   value={product.isPerishable === undefined ? '—' : (product.isPerishable ? 'Yes' : 'No')} />
              <Fact label="Weight"       value={product.weightKg === null || product.weightKg === undefined ? '—' : `${product.weightKg} kg`} />
              <Fact label="Cost per item" value={product.unitCost === null || product.unitCost === undefined
                ? '—'
                : `R ${product.unitCost.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              <Fact label="Ledger unit"  value={text(product.unit)} />
            </dl>
          </section>

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap">
            {canAdjust ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onAdjust(product)}>
                <SlidersHorizontal />
                Adjust stock
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => onViewHistory(product)}>
              <History />
              Full movement history
            </Button>
            {/* The one thing this panel deliberately cannot do. Editing
                the catalogue — and the reorder threshold the figures
                above are judged against — lives on one screen, and this
                is the way there rather than a second editor that could
                disagree with it.

                Admin only now. A manager sees the catalogue facts above
                and can adjust stock; changing what a product IS is not
                theirs, so offering the button would land them on a
                screen with every control disabled.

                navigate() rather than a <Link> inside a Button: this
                project's Button has no asChild, so wrapping one would
                nest an anchor in a button — invalid, and the staff
                shell's `a` rule has repainted a button's text to
                invisible once already this project. */}
            {canEditCatalogue ? (
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => { onClose(); navigate(ADMIN.products); }}
              >
                <Pencil />
                Edit in Product Management
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

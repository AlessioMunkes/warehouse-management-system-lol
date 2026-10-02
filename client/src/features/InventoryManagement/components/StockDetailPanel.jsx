// ─────────────────────────────────────────────────────────────
// client/src/features/InventoryManagement/components/StockDetailPanel.jsx
//
// One product, everything about it, in the panel its name opens.
//
// This replaces two things that each held half of it: a centred
// summary dialog (figures, chart, catalogue) and a separate history
// drawer reached from a second icon on the row. One panel means one
// way in and nothing to choose between.
//
// Read downwards in the order the warehouse reasons:
//   1. the four figures — here, promised, left, and the line under
//      which "left" is a problem
//   2. the balance over time, with that line drawn on it
//   3. expiry by delivery, soonest first — what to pick first
//   4. recent movements, with the rest one click away
//   5. the catalogue facts that never fitted in a column
//
// EXPIRY IS PER RECEIPT LINE, NOT PER UNIT LEFT. stock_levels holds
// one balance per product, so how much of a delivery is still on the
// shelf is not known. The list says "received", and says why.
//
// The panel fetches its own movements and expiry lines, keyed by the
// product it was opened for — the page mounts it with key={product.id}
// so a second product never shows the first one's history mid-load.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, SlidersHorizontal } from 'lucide-react';
import DetailPanel from '@/components/ui/detail-panel';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtQty } from '@/lib/quantity';
import BalanceChart from './BalanceChart';
import { getBatches, getMovements } from '../../../services/stockAPI';
import { ADMIN } from '../../../routes/paths';
import {
  STOCK_STATUS_LABEL, expiryLabel, expiryState, stockStatus,
} from '../inventoryViews';

// Keys are the values the database stores — the movement_type CHECK
// constraint, mirrored in reportCatalog.js's MOVEMENT_TYPES.
const TYPE_LABEL = {
  adjustment: 'Manual adjustment',
  decanted:   'Decanting',
  dispatched: 'Dispatched to beneficiary',
  donated:    'Donation received',
  picked:     'Picked for dispatch',
  received:   'Goods received',
  wastage:    'Wastage',
};

// Enough to answer "what happened lately"; the rest is one click.
const RECENT = 8;

const fmtDay = (day) => (day
  ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
  : '—');

const fmtWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const text = (v) => {
  const s = (v ?? '').toString().trim();
  return s === '' ? '—' : s;
};

const Section = ({ title, note, children }) => (
  <section>
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
    {children}
  </section>
);

const Figure = ({ label, value, emphasis }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={`text-lg tabular-nums ${emphasis ? 'font-semibold' : 'font-medium'}`}>{value}</dd>
  </div>
);

const Fact = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="break-words text-sm">{value}</dd>
  </div>
);

export default function StockDetailPanel({
  product,
  canAdjust = false,
  // A manager can adjust stock but not change a product, so offering
  // them a button into Product Management would land them on a screen
  // with every control disabled.
  canEditCatalogue = false,
  onAdjust,
  onClose,
}) {
  const navigate = useNavigate();
  const [movements, setMovements] = useState({ rows: [], loading: true, error: null });
  const [batches, setBatches] = useState({ rows: [], loading: true, error: null });
  const [showAll, setShowAll] = useState(false);

  // Two independent reads. Either failing costs its own section only:
  // the figures above them came with the manifest and are still right.
  useEffect(() => {
    let cancelled = false;
    getMovements(product.id)
      .then((rows) => { if (!cancelled) setMovements({ rows, loading: false, error: null }); })
      .catch((err) => {
        if (!cancelled) setMovements({ rows: [], loading: false, error: err.message || 'Could not load the movement history.' });
      });
    getBatches(product.id)
      .then((rows) => { if (!cancelled) setBatches({ rows, loading: false, error: null }); })
      .catch((err) => {
        if (!cancelled) setBatches({ rows: [], loading: false, error: err.message || 'Could not load expiry dates.' });
      });
    return () => { cancelled = true; };
  }, [product.id]);

  const unit = product.unit || product.defaultUnit || '';
  const status = stockStatus(product);
  const earliest = expiryState(product.earliestExpiry);
  const shown = showAll ? movements.rows : movements.rows.slice(0, RECENT);

  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={[product.sku, product.category].filter(Boolean).join(' · ')}
      title={product.name}
      badges={(
        <>
          <StatusBadge kind="inventory" status={status}>{STOCK_STATUS_LABEL[status]}</StatusBadge>
          {earliest?.status === 'soon' ? (
            <StatusBadge kind="expiry" status="soon">
              Earliest delivery {expiryLabel(earliest).toLowerCase()}
            </StatusBadge>
          ) : null}
        </>
      )}
      actions={(
        <>
          {canAdjust ? (
            <Button type="button" size="sm" onClick={() => onAdjust?.(product)}>
              <SlidersHorizontal />
              Adjust stock
            </Button>
          ) : null}
          {/* navigate() rather than a <Link> inside a Button: this
              project's Button has no asChild, so wrapping one would nest
              an anchor in a button. */}
          {canEditCatalogue ? (
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => { onClose(); navigate(ADMIN.products); }}
            >
              <Pencil />
              Edit in Product Management
            </Button>
          ) : null}
        </>
      )}
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="On hand"    value={fmtQty(product.onHand, unit)} />
        <Figure label="Committed"  value={fmtQty(product.committed, unit)} />
        <Figure label="Available"  value={fmtQty(product.available, unit)} emphasis />
        <Figure label="Reorder at" value={fmtQty(product.reorderAt, unit)} />
      </dl>

      <Section title="Balance over time" note={product.reorderAt > 0 ? 'Dashed line: reorder level' : undefined}>
        {movements.error ? (
          <p className="py-4 text-sm text-danger">{movements.error}</p>
        ) : movements.loading ? (
          <Skeleton className="h-[150px] w-full" />
        ) : (
          <BalanceChart
            movements={movements.rows}
            onHand={product.onHand}
            reorderAt={product.reorderAt}
            unit={unit}
            width={520}
          />
        )}
      </Section>

      <Section title="Expiry by delivery" note="Soonest first">
        {batches.error ? (
          <p className="text-sm text-danger">{batches.error}</p>
        ) : batches.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : batches.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expiry dates recorded for this product. Expiry is captured when a purchase-order delivery is received.
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {batches.rows.map((b) => {
                const state = expiryState(b.expiryDate);
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium tabular-nums">{fmtDay(b.expiryDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        Received {fmtDay(b.receivedOn)}{b.supplierName ? ` · ${b.supplierName}` : ''}
                        {' · '}<span className="tabular-nums">{fmtQty(b.receivedQuantity, b.unit)}</span>
                      </p>
                    </div>
                    <StatusBadge kind="expiry" status={state.status}>{expiryLabel(state)}</StatusBadge>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Quantities are what each delivery brought in, not what is left of it — stock is held as one balance per product.
            </p>
          </>
        )}
      </Section>

      <Section
        title="Movements"
        note={movements.rows.length ? `${movements.rows.length} in total` : undefined}
      >
        {movements.error ? (
          <p className="text-sm text-danger">{movements.error}</p>
        ) : movements.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : movements.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements recorded for this product yet.</p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {shown.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <StatusBadge kind="ledger" status={m.movementType}>
                      {TYPE_LABEL[m.movementType] ?? m.movementType}
                    </StatusBadge>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {fmtWhen(m.createdAt)} · {m.performedByName}{m.reason ? ` · ${m.reason}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-medium tabular-nums ${m.quantity < 0 ? 'text-danger' : 'text-good'}`}>
                    {m.quantity > 0 ? '+' : ''}{fmtQty(m.quantity, m.unit)}
                  </span>
                </li>
              ))}
            </ul>
            {movements.rows.length > RECENT ? (
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show recent only' : `Show all ${movements.rows.length} movements`}
              </Button>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Catalogue">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label="Category"      value={text(product.category)} />
          <Fact label="Default unit"  value={text(product.defaultUnit || product.unit)} />
          <Fact label="Ledger unit"   value={text(product.unit)} />
          <Fact label="Storage"       value={product.storageType ? product.storageType.charAt(0).toUpperCase() + product.storageType.slice(1) : '—'} />
          <Fact label="Perishable"    value={product.isPerishable === undefined ? '—' : (product.isPerishable ? 'Yes' : 'No')} />
          <Fact label="Weight"        value={product.weightKg === null || product.weightKg === undefined ? '—' : `${product.weightKg} kg`} />
          <Fact label="Cost per item" value={product.unitCost === null || product.unitCost === undefined
            ? '—'
            : `R ${product.unitCost.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        </dl>
      </Section>
    </DetailPanel>
  );
}

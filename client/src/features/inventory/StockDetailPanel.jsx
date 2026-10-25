// ─────────────────────────────────────────────────────────────
// client/src/features/inventory/StockDetailPanel.jsx
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
//   3. expiry by delivery, soonest first — what to pick first, with
//      about how much of each is left, and a manager's way to dismiss a
//      warning the estimate has wrong
//   4. recent movements, with the rest one click away
//   5. the catalogue facts that never fitted in a column
//
// EXPIRY IS PER RECEIPT LINE, NOT PER UNIT LEFT. stock_levels holds
// one balance per product, so how much of a delivery is still on the
// shelf is an ESTIMATE (the server assumes the oldest stock goes out
// first). The list shows about how much is left, says it is an
// estimate, and lets a manager dismiss a delivery's warning, with a
// reason, when the estimate is wrong.
//
// The panel fetches its own movements and expiry lines, keyed by the
// product it was opened for — the page mounts it with key={product.id}
// so a second product never shows the first one's history mid-load.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, SlidersHorizontal } from 'lucide-react';
import DetailPanel from '@/components/ui/detail-panel';
import PrintLabels from '../products/PrintLabels';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtQty } from '@/lib/quantity';
import { fmtQtyUnit } from '@/lib/stockWording';
import BalanceChart from './BalanceChart';
import { dismissExpiryWarning, getBatches, getMovements, restoreExpiryWarning } from '../../services/stockAPI';
import DismissExpiryDialog from './DismissExpiryDialog';
import { ADMIN } from '../../routes/paths';
import {
  EXPIRY_ESTIMATE_HINT, STOCK_STATUS_LABEL, expiryLabel, expiryState, isExpiringSoon, stockStatus,
} from './inventoryViews';
import { formatCalendarDay as fmtDay } from '@/lib/dates';

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

const fmtWhen = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const text = (v) => {
  const s = (v ?? '').toString().trim();
  return s === '' ? '-' : s;
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

// The number large and the unit small beside it, on one line — "30"
// over "crate" read as two figures.
const Figure = ({ label, value, unit, emphasis }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="whitespace-nowrap">
      <span className={`text-lg tabular-nums ${emphasis ? 'font-semibold' : 'font-medium'}`}>{fmtQty(value)}</span>
      {unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
    </dd>
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
  // Managers and admins may dismiss a delivery's expiry warning, as they
  // may adjust stock. `onExpiryChanged` re-reads the manifest after, so
  // the Expiring tab and the earliest expiry follow.
  canDismissExpiry = canAdjust,
  onAdjust,
  onExpiryChanged,
  onClose,
}) {
  const navigate = useNavigate();
  const [movements, setMovements] = useState({ rows: [], loading: true, error: null });
  const [batches, setBatches] = useState({ rows: [], loading: true, error: null });
  const [showAll, setShowAll] = useState(false);
  const [dismissing, setDismissing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);

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

  const reloadBatches = () => getBatches(product.id)
    .then((rows) => setBatches({ rows, loading: false, error: null }))
    .catch((err) => setBatches({ rows: [], loading: false, error: err.message || 'Could not load expiry dates.' }));

  const dismiss = async (reason) => {
    setSaving(true);
    setActionError(null);
    try {
      await dismissExpiryWarning(product.id, dismissing.id, reason);
      setDismissing(null);
      await reloadBatches();
      onExpiryChanged?.();
    } catch (err) {
      setActionError(err.message || 'Could not dismiss the warning.');
    } finally {
      setSaving(false);
    }
  };

  const restore = async (batch) => {
    setActionError(null);
    try {
      await restoreExpiryWarning(product.id, batch.id);
      await reloadBatches();
      onExpiryChanged?.();
    } catch (err) {
      setActionError(err.message || 'Could not bring the warning back.');
    }
  };

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
          {isExpiringSoon(earliest) ? (
            <span title={EXPIRY_ESTIMATE_HINT}>
              <StatusBadge kind="expiry" status={earliest.status}>
                Earliest delivery {expiryLabel(earliest).toLowerCase()}
              </StatusBadge>
            </span>
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
        <Figure label="On hand"    value={product.onHand}    unit={unit} />
        <Figure label="Committed"  value={product.committed} unit={unit} />
        <Figure label="Available"  value={product.available} unit={unit} emphasis />
        <Figure label="Reorder at" value={product.reorderAt} unit={unit} />
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
          />
        )}
      </Section>

      <Section title="Expiry by delivery" note="Soonest first, estimated">
        {batches.error ? (
          <p className="text-sm text-danger">{batches.error}</p>
        ) : batches.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : batches.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No delivery with an expiry date is estimated to be on the shelf. Dates are captured when a delivery is received.
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border" title={EXPIRY_ESTIMATE_HINT}>
              {batches.rows.map((b) => {
                const state = expiryState(b.expiryDate);
                const expired = state.status === 'expired';
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium tabular-nums">{fmtDay(b.expiryDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        Received {fmtDay(b.receivedOn)}{b.supplierName ? ` · ${b.supplierName}` : ''}
                        {' · '}
                        <span className="tabular-nums">
                          {b.quantityLeft === null
                            ? fmtQtyUnit(b.receivedQuantity, b.unit)
                            : `about ${fmtQtyUnit(b.quantityLeft, b.unit)} left of ${fmtQty(b.receivedQuantity)}`}
                        </span>
                      </p>
                      {b.dismissal ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Warning dismissed by {b.dismissal.byName}
                          {b.dismissal.at ? ` on ${fmtWhen(b.dismissal.at)}` : ''}: {b.dismissal.reason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {b.dismissal ? (
                        <StatusBadge tone="neutral">Warning dismissed</StatusBadge>
                      ) : (
                        <StatusBadge kind="expiry" status={state.status}>{expiryLabel(state)}</StatusBadge>
                      )}
                      {canDismissExpiry && b.dismissal ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => restore(b)}>
                          Bring warning back
                        </Button>
                      ) : null}
                      {canDismissExpiry && !b.dismissal && !expired ? (
                        <Button
                          type="button" variant="outline" size="sm"
                          onClick={() => { setActionError(null); setDismissing(b); }}
                        >
                          Dismiss warning
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {actionError && !dismissing ? <p role="alert" className="mt-2 text-sm text-danger">{actionError}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {EXPIRY_ESTIMATE_HINT}. Stock is not tracked by delivery, so how much is left of each is
              worked out from what came in and went out. Deliveries estimated to be used up are not listed.
              {canDismissExpiry ? ' If a warning is wrong, dismiss it and say why.' : ''}
            </p>
          </>
        )}
      </Section>

      {dismissing ? (
        <DismissExpiryDialog
          product={product}
          batch={dismissing}
          expiresOn={fmtDay(dismissing.expiryDate)}
          saving={saving}
          error={actionError}
          onConfirm={dismiss}
          onClose={() => setDismissing(null)}
        />
      ) : null}

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

      {/* Barcode stickers for loose stock (products/PrintLabels.jsx). */}
      <PrintLabels product={product} />

      <Section title="Catalogue">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label="Category"      value={text(product.category)} />
          <Fact label="Default unit"  value={text(product.defaultUnit || product.unit)} />
          <Fact label="Ledger unit"   value={text(product.unit)} />
          <Fact label="Storage"       value={product.storageType ? product.storageType.charAt(0).toUpperCase() + product.storageType.slice(1) : '-'} />
          <Fact label="Perishable"    value={product.isPerishable === undefined ? '-' : (product.isPerishable ? 'Yes' : 'No')} />
          <Fact label="Weight"        value={product.weightKg === null || product.weightKg === undefined ? '-' : `${product.weightKg} kg`} />
          <Fact label="Cost per item" value={product.unitCost === null || product.unitCost === undefined
            ? '-'
            : `R ${product.unitCost.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        </dl>
      </Section>
    </DetailPanel>
  );
}

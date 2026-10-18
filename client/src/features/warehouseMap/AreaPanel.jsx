// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/AreaPanel.jsx
//
// One area of the map, opened from the map: what it holds, when it was
// counted, and the button to count it again.
//
// Each product shows about how much is here now. That is the newest
// count, scaled down when stock has gone out since (the server's
// features/warehouseMap/placement.js), so a count from last week does
// not claim stock that has since been dispatched.
//
// Under each product, its count in every area beside what is on hand.
// That pair is the stock take: when they differ, Adjust stock corrects
// the ledger, with a reason, the same as from the Inventory list.
//
// The same panel lists what is not placed: stock in the building that
// no counted area holds (`area` null, `unplaced` set).
// ─────────────────────────────────────────────────────────────
import { ClipboardList, SlidersHorizontal } from 'lucide-react';
import DetailPanel from '@/components/ui/detail-panel';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { fmtQtyUnit } from '@/lib/stockWording';
import { formatShortDate } from '@/lib/dates';
import { EXPIRY_ESTIMATE_HINT, expiryLabel, expiryState, isExpiringSoon } from '../inventory/inventoryViews';
import { countedWhen } from './mapOverlays';
import { kindById } from './mapGeometry';

const near = (a, b) => Math.abs(a - b) < 0.001;

function StockTake({ product, canAdjust, onAdjust }) {
  if (!product) return null;
  const differs = !near(product.countedTotal, product.onHand);
  return (
    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className={differs ? 'text-warn' : undefined}>
        All areas: {fmtQtyUnit(product.countedTotal, product.unit)} counted, {fmtQtyUnit(product.onHand, product.unit)} on hand
      </span>
      {differs && canAdjust ? (
        <Button type="button" variant="outline" size="xs" onClick={() => onAdjust(product.id)}>
          <SlidersHorizontal /> Adjust stock
        </Button>
      ) : null}
    </div>
  );
}

function ExpiryBadge({ product, today }) {
  const state = expiryState(product?.earliestExpiry, today ?? undefined);
  if (!state || !(isExpiringSoon(state) || state.status === 'expired')) return null;
  return (
    <span title={EXPIRY_ESTIMATE_HINT}>
      <StatusBadge kind="expiry" status={state.status}>{expiryLabel(state)}</StatusBadge>
    </span>
  );
}

export default function AreaPanel({
  area = null,
  unplaced = null,
  productsById,
  today,
  canCount = false,
  canAdjust = false,
  onCount,
  onAdjust,
  onClose,
}) {
  if (!area) {
    const rows = unplaced ?? [];
    return (
      <DetailPanel open onClose={onClose} eyebrow="Stock in no counted area" title="Not placed">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything on hand is in a counted area.</p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Not placed">
            {rows.map((p) => (
              <li key={p.id} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">{fmtQtyUnit(p.unplaced, p.unit)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{p.sku}</span>
                  <ExpiryBadge product={p} today={today} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </DetailPanel>
    );
  }

  const items = area.items.filter((i) => i.about > 0);
  const areaExpiry = expiryState(area.earliestExpiry, today ?? undefined);
  const by = items.find((i) => i.countedByName)?.countedByName;

  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={`${kindById(area.kind).label} · ${countedWhen(area.lastCountedAt)}${by && area.lastCountedAt ? ` by ${by}` : ''}`}
      title={area.name}
      badges={areaExpiry && isExpiringSoon(areaExpiry) ? (
        <span title={EXPIRY_ESTIMATE_HINT}>
          <StatusBadge kind="expiry" status={areaExpiry.status}>Soonest {expiryLabel(areaExpiry).toLowerCase()}</StatusBadge>
        </span>
      ) : null}
      actions={canCount ? (
        <Button type="button" size="sm" onClick={onCount}>
          <ClipboardList /> Count this area
        </Button>
      ) : null}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {area.lastCountedAt ? 'Empty at the last count.' : 'Nothing counted here yet. Count this area to record what it holds.'}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border" aria-label={`In ${area.name}`}>
          {items.map((i) => {
            const product = productsById.get(i.productId);
            return (
              <li key={i.productId} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">{i.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {i.scaled ? `about ${fmtQtyUnit(i.about, i.unit)}` : fmtQtyUnit(i.about, i.unit)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {i.scaled
                      ? `${fmtQtyUnit(i.counted, i.unit)} counted on ${formatShortDate(i.countedAt)}. Some has gone out since.`
                      : `Counted on ${formatShortDate(i.countedAt)}`}
                  </span>
                  <ExpiryBadge product={product} today={today} />
                </div>
                <StockTake product={product} canAdjust={canAdjust} onAdjust={onAdjust} />
              </li>
            );
          })}
        </ul>
      )}
    </DetailPanel>
  );
}

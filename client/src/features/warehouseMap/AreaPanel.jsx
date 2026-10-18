// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/AreaPanel.jsx
//
// One area of the map, opened from the map: how full it is, what it
// holds, when it was counted, and the button to count it again.
//
// Each product is one of two things (the server's
// features/warehouseMap/placement.js):
//   counted   the newest count, scaled down when stock has since gone
//             out or onto a pallet, so last week's count does not claim
//             stock that has left. "about" when scaled.
//   expected  stock nobody has counted, shown in the area meant for it
//             (Warehouse layout's preferred stock). Counting the area
//             confirms it.
//
// Under each counted product, its count in every area beside what is on
// the shelves (on hand, less what is packed on pallets). That pair is
// the stock take: when they differ, Adjust stock corrects the ledger,
// with a reason, the same as from the Inventory list.
//
// A staging area lists the packed pallets waiting in it; they leave the
// map when they are dispatched. The same panel, with `area` null, lists
// what is not placed anywhere.
// ─────────────────────────────────────────────────────────────
import { ClipboardList, SlidersHorizontal } from 'lucide-react';
import DetailPanel from '@/components/ui/detail-panel';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { fmtQty } from '@/lib/quantity';
import { fmtQtyUnit } from '@/lib/stockWording';
import { formatCalendarDay, formatShortDate } from '@/lib/dates';
import { EXPIRY_ESTIMATE_HINT, expiryLabel, expiryState, isExpiringSoon } from '../inventory/inventoryViews';
import { countedWhen, fillTone, percent } from './mapOverlays';
import { holdsStock, isStaging, kindById } from './mapGeometry';

const near = (a, b) => Math.abs(a - b) < 0.001;
const kg = (n) => `${fmtQty(Math.round(Number(n) || 0))} kg`;
const TONE_TEXT = { bad: 'text-danger', warn: 'text-warn', good: 'text-good', neutral: 'text-muted-foreground' };

function StockTake({ product, canAdjust, onAdjust }) {
  if (!product) return null;
  const differs = !near(product.countedTotal, product.shelf);
  return (
    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className={differs ? 'text-warn' : undefined}>
        All areas: {fmtQtyUnit(product.countedTotal, product.unit)} counted, {fmtQtyUnit(product.shelf, product.unit)} on the shelves
        {product.onPallets > 0 ? ` (${fmtQtyUnit(product.onPallets, product.unit)} more on packed pallets)` : ''}
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

function PalletList({ pallets, label }) {
  if (pallets.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border" aria-label={label}>
      {pallets.map((p) => (
        <li key={p.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{p.beneficiary || 'Pallet'}</span>
            <span className="block text-xs text-muted-foreground">{p.ref || `Slip ${p.id}`}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Collection {formatCalendarDay(p.dispatchDate)}</span>
        </li>
      ))}
    </ul>
  );
}

// "About 240 kg of 500 kg · 48%", in the fill colour.
function CapacityLine({ area }) {
  if (isStaging(area)) {
    const n = area.pallets.length;
    return (
      <p className={`text-sm ${TONE_TEXT[fillTone(area.fill)]}`}>
        {n} pallet{n === 1 ? '' : 's'}{area.palletSpaces ? ` of ${area.palletSpaces} spaces · ${percent(area.fill)}` : ''}
      </p>
    );
  }
  return (
    <p className={`text-sm ${TONE_TEXT[fillTone(area.fill)]}`}>
      About {kg(area.heldKg)}{area.capacityKg ? ` of ${kg(area.capacityKg)} · ${percent(area.fill)}` : ' held. No capacity set.'}
      {area.unweighed > 0 ? <span className="text-muted-foreground"> {area.unweighed} with no weight on record.</span> : null}
    </p>
  );
}

export default function AreaPanel({
  area = null,
  unplaced = null,
  unstagedPallets = [],
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
      <DetailPanel open onClose={onClose} eyebrow="Stock in no area" title="Not placed">
        {rows.length === 0 && unstagedPallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything on the shelves is in an area.</p>
        ) : null}
        {rows.length > 0 ? (
          <ul className="divide-y rounded-lg border" aria-label="Not placed">
            {rows.map((p) => (
              <li key={p.id} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">{fmtQtyUnit(p.unplaced, p.unit)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{[p.sku, p.category].filter(Boolean).join(' · ')}</span>
                  <ExpiryBadge product={p} today={today} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {unstagedPallets.length > 0 ? (
          <>
            <p className="text-sm font-medium">Packed pallets with no staging area</p>
            <PalletList pallets={unstagedPallets} label="Packed pallets with no staging area" />
          </>
        ) : null}
      </DetailPanel>
    );
  }

  const items = area.items.filter((i) => i.about > 0);
  const areaExpiry = expiryState(area.earliestExpiry, today ?? undefined);
  const by = items.find((i) => i.countedByName)?.countedByName;
  const eyebrow = holdsStock(area)
    ? `${kindById(area.kind).label} · ${countedWhen(area.lastCountedAt)}${by && area.lastCountedAt ? ` by ${by}` : ''}`
    : kindById(area.kind).label;

  return (
    <DetailPanel
      open
      onClose={onClose}
      eyebrow={eyebrow}
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
      <CapacityLine area={area} />

      {isStaging(area) ? (
        area.pallets.length === 0
          ? <p className="text-sm text-muted-foreground">No packed pallets waiting here.</p>
          : <PalletList pallets={area.pallets} label={`Pallets in ${area.name}`} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {area.lastCountedAt ? 'Empty at the last count.' : 'Nothing counted here yet. Count this area to record what it holds.'}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border" aria-label={`In ${area.name}`}>
          {items.map((i) => {
            const product = productsById.get(i.productId);
            const counted = i.source === 'counted';
            return (
              <li key={`${i.productId}-${i.source}`} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">{i.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {i.scaled || !counted ? `about ${fmtQtyUnit(i.about, i.unit)}` : fmtQtyUnit(i.about, i.unit)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {counted ? (
                    <span>
                      {i.scaled
                        ? `${fmtQtyUnit(i.counted, i.unit)} counted on ${formatShortDate(i.countedAt)}. Some has gone out since.`
                        : `Counted on ${formatShortDate(i.countedAt)}`}
                    </span>
                  ) : (
                    <StatusBadge tone="neutral">Expected here</StatusBadge>
                  )}
                  <ExpiryBadge product={product} today={today} />
                </div>
                {counted ? <StockTake product={product} canAdjust={canAdjust} onAdjust={onAdjust} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </DetailPanel>
  );
}

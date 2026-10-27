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
// A staging area lists the packed pallets waiting in it, the ones past
// their collection day first, each marked as the map marks it; they
// leave the map when they are dispatched. Under the title, every alert
// the map's badge stands for (mapIndicators.js), so the panel and the
// map never disagree. A product's name lights up everywhere it is on
// the map (onFind). A gate shows its day: the dispatch gate the pallets
// ready to collect, the receiving gate the deliveries late, expected and
// arrived today. The same panel, with `area` null, lists
// what is not placed anywhere.
// ─────────────────────────────────────────────────────────────
import {
  AlertCircle, CalendarClock, CheckCircle2, ClipboardList, HelpCircle, PackageOpen, SlidersHorizontal, Truck,
} from 'lucide-react';
import DetailPanel from '@/components/ui/detail-panel';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { fmtQty } from '@/lib/quantity';
import { fmtQtyUnit } from '@/lib/stockWording';
import { formatCalendarDay, formatShortDate } from '@/lib/dates';
import { EXPIRY_ESTIMATE_HINT, expiryLabel, expiryState, isExpiringSoon } from '../inventory/inventoryViews';
import { countedWhen, fillTone, percent } from './mapOverlays';
import { holdsStock, isStaging, kindById } from './mapGeometry';
import { alertsFor, palletDue } from './mapIndicators';
import { dayLabel } from './mapActivity';

const ALERT_LOOK = {
  bad:   { tone: 'bad', icon: AlertCircle },
  warn:  { tone: 'warn', icon: AlertCircle },
  info:  { tone: 'info', icon: Truck },
  muted: { tone: 'neutral', icon: HelpCircle },
};

const DUE_ORDER = { overdue: 0, today: 1, tomorrow: 2, later: 3 };
const DAY_MS = 86_400_000;
const daysLate = (day, today) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(day).slice(0, 10)}T00:00:00Z`)) / DAY_MS);

function DueBadge({ pallet, today }) {
  const due = palletDue(pallet, today);
  if (due === 'overdue') {
    const n = daysLate(pallet.dispatchDate, today);
    return <StatusBadge tone="bad" icon={AlertCircle}>{n === 1 ? '1 day overdue' : `${n} days overdue`}</StatusBadge>;
  }
  if (due === 'today') return <StatusBadge tone="warn" icon={Truck}>Collected today</StatusBadge>;
  if (due === 'tomorrow') return <StatusBadge tone="info" icon={CalendarClock}>Tomorrow</StatusBadge>;
  return null;
}

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

// What of this product is still to be packed: wanted on picking slips
// nobody has finished, with how many pallets and the first collection
// day. One line per unit the slips ask in ("12 kg", "40 each").
function ToPackLine({ product }) {
  const toPack = product?.toPack ?? [];
  if (!toPack.length) return null;
  const pallets = Math.max(...toPack.map((t) => t.pallets));
  const first = toPack.map((t) => t.firstDay).filter(Boolean).sort()[0];
  return (
    <p className="mt-1 text-xs">
      <span className="font-medium text-warn">
        Still to pack: {toPack.map((t) => fmtQtyUnit(t.quantity, t.unit)).join(' and ')}
      </span>
      <span className="text-muted-foreground">
        {' '}for {pallets} {pallets === 1 ? 'pallet' : 'pallets'}{first ? `, the earliest due ${formatCalendarDay(first)}` : ''}
      </span>
    </p>
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

function PalletList({ pallets, label, today }) {
  if (pallets.length === 0) return null;
  const sorted = [...pallets].sort((a, b) => (DUE_ORDER[palletDue(a, today)] - DUE_ORDER[palletDue(b, today)])
    || String(a.dispatchDate ?? '').localeCompare(String(b.dispatchDate ?? '')));
  return (
    <ul className="divide-y rounded-lg border" aria-label={label}>
      {sorted.map((p) => {
        const overdue = palletDue(p, today) === 'overdue';
        return (
          <li key={p.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${overdue ? 'bg-danger-soft/60' : ''}`}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{p.beneficiary || 'Pallet'}</span>
              <span className="block text-xs text-muted-foreground">
                {p.ref || `Slip ${p.id}`} · Collection {formatCalendarDay(p.dispatchDate)}
              </span>
            </span>
            <DueBadge pallet={p} today={today} />
          </li>
        );
      })}
    </ul>
  );
}

// Every alert on the area, as the map's badge sums them up.
function AlertBadges({ area, today }) {
  const alerts = alertsFor(area, { today, now: new Date() });
  if (alerts.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5" title={EXPIRY_ESTIMATE_HINT}>
      {alerts.map((a) => {
        const look = ALERT_LOOK[a.level];
        return <StatusBadge key={a.text} tone={look.tone} icon={look.icon}>{a.text}</StatusBadge>;
      })}
    </span>
  );
}

// The receiving gate's purchase orders: late ones marked by how late.
function DeliveryList({ orders, today, label }) {
  if (!orders.length) return null;
  return (
    <ul className="divide-y rounded-lg border" aria-label={label}>
      {orders.map((po) => {
        const late = po.expected_on && po.expected_on < today ? daysLate(po.expected_on, today) : 0;
        return (
          <li key={po.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${late ? 'bg-warn-soft/60' : ''}`}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{po.supplier}</span>
              <span className="block text-xs text-muted-foreground">
                {po.po_number}{po.lines ? ` · ${po.lines} line${po.lines === 1 ? '' : 's'}` : ''}{po.expected_on ? ` · Expected ${formatCalendarDay(po.expected_on)}` : ''}
              </span>
            </span>
            {late
              ? <StatusBadge tone="warn" icon={AlertCircle}>{late === 1 ? '1 day late' : `${late} days late`}</StatusBadge>
              : (po.expected_on === today ? <StatusBadge tone="info" icon={Truck}>Today</StatusBadge> : null)}
          </li>
        );
      })}
    </ul>
  );
}

// Today's collections at the dispatch gate, by where each centre is.
const COLLECTION_GROUPS = [
  { state: 'waiting',  title: 'At the gate',    badge: { tone: 'info', icon: Truck, text: 'Here to collect' } },
  { state: 'missed',   title: 'Not collected',  badge: { tone: 'bad', icon: AlertCircle, text: 'Not collected' } },
  { state: 'packing',  title: 'Still packing',  badge: { tone: 'warn', icon: PackageOpen, text: 'Packing' } },
  { state: 'to_pack',  title: 'Not packed yet', badge: { tone: 'neutral', icon: PackageOpen, text: 'To pack' } },
  { state: 'collected', title: 'Collected',     badge: { tone: 'good', icon: CheckCircle2, text: 'Collected' } },
];
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '');

function CollectionsToday({ g }) {
  const pct = g.total ? Math.round((g.collected.length / g.total) * 100) : 0;
  return (
    <>
      <div>
        <p className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{g.collected.length} of {g.total} centres collected</span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </p>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label="Collected today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {COLLECTION_GROUPS.map((group) => {
        const list = g.collections.filter((c) => c.state === group.state);
        if (!list.length) return null;
        return (
          <section key={group.state} aria-label={group.title}>
            <p className="mb-1.5 text-sm font-medium">{group.title} <span className="font-normal text-muted-foreground">{list.length}</span></p>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {list.map((c) => (
                <li key={c.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${group.state === 'missed' ? 'bg-danger-soft/60' : ''}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[c.palletRef, c.state === 'collected' && c.collectedAt ? `at ${timeOf(c.collectedAt)}` : null].filter(Boolean).join(' · ') || 'No pallet yet'}
                    </span>
                  </span>
                  <StatusBadge tone={group.badge.tone} icon={group.badge.icon}>{group.badge.text}</StatusBadge>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function GateDay({ area, today }) {
  const g = area.gate;
  if (g.kind === 'dispatch') {
    return (
      <>
        {g.total ? <CollectionsToday g={g} /> : (
          <p className="text-sm text-muted-foreground">
            No collections today.
            {g.nextCollection ? ` Next: ${dayLabel(g.nextCollection.day)}, ${g.nextCollection.centres} centre${g.nextCollection.centres === 1 ? '' : 's'}.` : ''}
          </p>
        )}
        {g.overdue.length ? (
          <>
            <p className="text-sm font-medium text-danger">Missed on an earlier day</p>
            <PalletList pallets={g.overdue} label="Missed on an earlier day" today={today} />
          </>
        ) : null}
      </>
    );
  }
  return (
    <>
      {g.truckCount === 0 && g.receivedToday.length === 0
        ? <p className="text-sm text-muted-foreground">No deliveries expected today.</p>
        : null}
      <DeliveryList orders={[...g.late, ...g.expected]} today={today} label={`Expected at ${area.name}`} />
      {g.receivedToday.length ? (
        <>
          <p className="text-sm font-medium">Received today</p>
          <ul className="divide-y rounded-lg border" aria-label="Received today">
            {g.receivedToday.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm">{d.supplier}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{d.po_number}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

// A manager changes what an area holds from here, without redrawing the
// plan: kilograms for a store, pallet spaces for staging. Blank clears it.
function CapacityEditor({ area, onSave }) {
  const staging = isStaging(area);
  const current = staging ? area.palletSpaces : area.capacityKg;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!editing) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => { setValue(current ?? ''); setError(null); setEditing(true); }}>
        {current ? 'Edit capacity' : 'Set capacity'}
      </Button>
    );
  }
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const amount = value === '' ? null : Number(value);
      await onSave(staging ? { palletSpaces: amount } : { capacityKg: amount });
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Could not save the capacity.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number" min="1" step={staging ? '1' : 'any'} inputMode={staging ? 'numeric' : 'decimal'}
          aria-label={staging ? `Pallet spaces in ${area.name}` : `Capacity of ${area.name} in kg`}
          placeholder="Not set" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-32"
        />
        <span className="text-sm text-muted-foreground">{staging ? 'pallet spaces' : 'kg'}</span>
        <Button type="button" size="sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
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
  // Set: a manager may change the area's capacity here.
  onSaveCapacity = null,
  onAdjust,
  onFind,
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
                  {onFind ? (
                    <button type="button" className="min-w-0 truncate text-left text-sm font-medium hover:underline" title="Show where it is on the map" onClick={() => onFind(p.name)}>{p.name}</button>
                  ) : <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>}
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
            <PalletList pallets={unstagedPallets} label="Packed pallets with no staging area" today={today} />
          </>
        ) : null}
      </DetailPanel>
    );
  }

  const items = (area.items ?? []).filter((i) => i.about > 0);
  // How many of the products here are wanted on pallets not packed yet.
  const stillNeeded = new Set(items.filter((i) => productsById.get(i.productId)?.toPack?.length).map((i) => i.productId)).size;
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
      badges={<AlertBadges area={area} today={today} />}
      actions={canCount ? (
        <Button type="button" size="sm" onClick={onCount}>
          <ClipboardList /> Manage this area
        </Button>
      ) : null}
    >
      {area.gate ? null : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CapacityLine area={area} />
          {onSaveCapacity ? <CapacityEditor key={`${area.id}|${area.capacityKg}|${area.palletSpaces}`} area={area} onSave={onSaveCapacity} /> : null}
        </div>
      )}

      {area.gate ? <GateDay area={area} today={today} /> : isStaging(area) ? (
        area.pallets.length === 0
          ? <p className="text-sm text-muted-foreground">No packed pallets waiting here.</p>
          : <PalletList pallets={area.pallets} label={`Pallets in ${area.name}`} today={today} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {area.lastCountedAt ? 'Empty at the last count.' : 'Nothing counted here yet. Choose Manage this area to record what it holds.'}
        </p>
      ) : (<>
        {stillNeeded > 0 ? (
          <p className="text-sm">
            <span className="font-medium">{stillNeeded} of these {stillNeeded === 1 ? 'product is' : 'products are'} still to be packed</span>
            <span className="text-muted-foreground"> for pallets that have not been packed yet.</span>
          </p>
        ) : null}
        <ul className="divide-y rounded-lg border" aria-label={`In ${area.name}`}>
          {items.map((i) => {
            const product = productsById.get(i.productId);
            const counted = i.source === 'counted';
            return (
              <li key={`${i.productId}-${i.source}`} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  {onFind ? (
                    <button type="button" className="min-w-0 truncate text-left text-sm font-medium hover:underline" title="Show where it is on the map" onClick={() => onFind(i.name)}>{i.name}</button>
                  ) : <span className="min-w-0 truncate text-sm font-medium">{i.name}</span>}
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
                <ToPackLine product={product} />
                {counted ? <StockTake product={product} canAdjust={canAdjust} onAdjust={onAdjust} /> : null}
              </li>
            );
          })}
        </ul>
      </>)}
    </DetailPanel>
  );
}

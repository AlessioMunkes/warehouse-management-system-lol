// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/CapacitySummary.jsx
//
// Under the map: how full the warehouse is. The storage total and each
// kind of store by weight, the staging areas by pallets, then every area
// on its own, each a bar against the capacity set in Warehouse layout.
// Choosing an area's row opens it, the same as on the map.
//
// Only areas with a capacity count towards a total's capacity, and only
// what they hold is compared with it, so one area left unset does not
// make the warehouse look emptier than it is. Stock with no known weight
// (an item with no weight on its product) is left out and said so.
// ─────────────────────────────────────────────────────────────
import { fmtQty } from '@/lib/quantity';
import { cn } from '@/lib/utils';
import { holdsStock, isStaging, kindById } from './mapGeometry';
import { fillTone, percent } from './mapOverlays';

const BAR = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-danger', neutral: 'bg-line-strong' };

const kg = (n) => `${fmtQty(Math.round(Number(n) || 0))} kg`;

function Meter({ label, held, capacity, fill, onClick }) {
  const tone = fillTone(fill);
  const width = fill === null || fill === undefined ? 0 : Math.min(fill, 1) * 100;
  const Row = onClick ? 'button' : 'div';
  return (
    <Row
      {...(onClick ? { type: 'button', onClick } : {})}
      className={cn('block w-full rounded-lg px-2 py-1.5 text-left', onClick && 'hover:bg-muted/60')}
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {held}{capacity ? ` of ${capacity}` : ''}{fill !== null && fill !== undefined ? ` · ${percent(fill)}` : ''}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={fill === null || fill === undefined ? undefined : Math.round(fill * 100)}
      >
        <div className={cn('h-full rounded-full', BAR[tone])} style={{ width: `${width}%` }} />
      </div>
    </Row>
  );
}

const ratio = (held, capacity) => (capacity ? held / capacity : null);

export default function CapacitySummary({ areas, totals, onOpen }) {
  if (!totals) return null;
  const { storage, byKind, pallets } = totals;
  const stores = areas.filter(holdsStock);
  const staging = areas.filter(isStaging);

  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="capacity-heading">
      <h2 id="capacity-heading" className="text-sm font-medium">Capacity</h2>
      <div className="mt-3 grid gap-x-6 gap-y-1 md:grid-cols-2">
        <Meter
          label="All storage"
          held={kg(storage.capacityKg ? storage.heldInSizedKg : storage.heldKg)}
          capacity={storage.capacityKg ? kg(storage.capacityKg) : null}
          fill={ratio(storage.heldInSizedKg, storage.capacityKg)}
        />
        {staging.length > 0 || pallets.total > 0 ? (
          <Meter
            label="Pallet staging"
            held={`${pallets.total} pallet${pallets.total === 1 ? '' : 's'}`}
            capacity={pallets.spaces ? `${pallets.spaces} spaces` : null}
            fill={ratio(pallets.total, pallets.spaces)}
          />
        ) : null}
        {['dry', 'cold', 'floor'].filter((k) => byKind[k]?.areas > 0).map((k) => {
          const held = stores.filter((a) => a.kind === k && a.capacityKg).reduce((s, a) => s + a.heldKg, 0);
          return (
            <Meter
              key={k}
              label={`${kindById(k).label}s`.replace('Floors', 'Floor areas')}
              held={kg(byKind[k].capacityKg ? held : byKind[k].heldKg)}
              capacity={byKind[k].capacityKg ? kg(byKind[k].capacityKg) : null}
              fill={ratio(held, byKind[k].capacityKg)}
            />
          );
        })}
      </div>

      {stores.length + staging.length > 0 ? (
        <>
          <h3 className="mt-4 text-xs font-medium text-muted-foreground">By area</h3>
          <div className="mt-1 grid gap-x-6 gap-y-0.5 md:grid-cols-2">
            {[...stores, ...staging].map((a) => (
              <Meter
                key={a.id}
                label={a.name}
                held={isStaging(a) ? `${a.pallets.length} pallet${a.pallets.length === 1 ? '' : 's'}` : kg(a.heldKg)}
                capacity={isStaging(a) ? (a.palletSpaces ? `${a.palletSpaces}` : null) : (a.capacityKg ? kg(a.capacityKg) : null)}
                fill={a.fill}
                onClick={onOpen ? () => onOpen(a) : undefined}
              />
            ))}
          </div>
        </>
      ) : null}

      {storage.unweighed > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {storage.unweighed} stock line{storage.unweighed === 1 ? ' has' : 's have'} no weight on record and {storage.unweighed === 1 ? 'is' : 'are'} not in these totals. Add a weight on the Products screen.
        </p>
      ) : null}
    </section>
  );
}

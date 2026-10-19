// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/WarehouseMapTab.jsx
//
// The Map tab on Inventory: the floor plan an admin drew, each area
// coloured by what the manager chose (expiry, programme, how long since
// it was counted, or the kind of area), a search that lights up the
// areas holding a product, and the panel an area opens.
//
// A MANAGER'S STOCK TAKE. Nothing on the floor records where stock is
// put, and nothing is asked of the floor. A manager walks the
// warehouse, opens an area and records what is there; the map holds
// that until the next count, scaled down as stock goes out or onto a
// packed pallet. Stock nobody counted shows in the area meant for it
// (preferred stock, set in Warehouse layout); whatever has no area is
// "Not placed", one click from the toolbar. Packed pallets stand in the
// staging areas until they are dispatched.
//
// Under the map, Capacity: how full each area and the whole warehouse is.
//
// FRESH WITHOUT A PUSH CHANNEL. The map is read again every minute
// while the tab is in front and no count is being typed: the same
// rhythm as the bell, and gentle on the free hosting and its few
// database connections.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Box, Map as MapIcon, Search, Square } from 'lucide-react';
import { Input } from '@/components/ui/input';
import NativeSelect from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import { useToast } from '@/components/ui/toastContext';
import { fmtQtyUnit } from '@/lib/stockWording';
import { cn } from '@/lib/utils';
import { getWarehouseMap, recordAreaCount } from '../../services/warehouseMapAPI';
import { matchesSearch } from '../inventory/inventoryViews';
import WarehouseMap from './WarehouseMap';
import AreaPanel from './AreaPanel';
import CountAreaDialog from './CountAreaDialog';
import CapacitySummary from './CapacitySummary';
import { holdsStock, isOpenable, isStaging } from './mapGeometry';
import { OVERLAYS, TONES, areasMatching, legendFor, percent, programmeTones, toneFor } from './mapOverlays';
import { BADGE_CLASS, PALLET_DUE, badgeFor, stockLines, stockMode } from './mapIndicators';

const REFRESH_MS = 60_000;
const UNPLACED = 'unplaced';

// The second line on an area: what it holds, and how full it is.
const areaNote = (area) => {
  const full = percent(area.fill);
  if (isStaging(area)) {
    const n = area.pallets?.length ?? 0;
    return [n === 0 ? 'No pallets' : `${n} pallet${n === 1 ? '' : 's'}`, full].filter(Boolean).join(' · ');
  }
  if (!holdsStock(area)) return null;
  // One product: how much of it (500 each); more: how many. The fill
  // only where it means something (stockMode 'fill').
  const lines = stockLines(area);
  const held = lines.length === 0 ? 'Empty'
    : lines.length === 1 ? `${Math.round(lines[0].about).toLocaleString('en-ZA')} ${lines[0].unit ?? ''}`.trim()
      : `${lines.length} products`;
  return [held, stockMode(area) === 'fill' ? full : null].filter(Boolean).join(' · ');
};

// What the marks on the map mean, whatever it is coloured by.
const BADGE_LEGEND = [
  { level: 'bad', glyph: '!', label: 'Over capacity, expiring or overdue' },
  { level: 'warn', glyph: '!', label: 'Nearly full or expiring this month' },
  { level: 'info', glyph: '1', label: 'Pallets to collect today' },
  { level: 'muted', glyph: '?', label: 'Not counted for a month' },
];

function MarksLegend({ view, hasPallets }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="What the marks mean">
      {BADGE_LEGEND.map((b) => (
        <li key={b.level} className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
            <circle r="6" className={BADGE_CLASS[b.level].fill} />
            <text y="3.2" textAnchor="middle" fontSize="8.5" className="fill-white font-bold">{b.glyph}</text>
          </svg>
          {b.label}
        </li>
      ))}
      {hasPallets ? PALLET_DUE.map((p) => (
        <li key={p.id} className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" className={cn(p.fill, p.stroke)} /></svg>
          {p.label}
        </li>
      )) : null}
      {view === '3d'
        ? <li>Solid block: stock against capacity. Red top: over capacity. Stacks: each product, where no capacity is set or a weight is missing.</li>
        : <li>Bar: how full the area is. Squares: each product, where no capacity is set or a weight is missing.</li>}
    </ul>
  );
}

function Legend({ entries }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
      {entries.map((e) => {
        const t = TONES[e.tone];
        return (
          <li key={`${e.tone}-${e.label}`} className="inline-flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden="true">
              <rect x="1" y="1" width="12" height="12" rx="3" className={cn(t.fill, t.stroke)} strokeWidth="1.25" strokeDasharray={t.dashed ? '3 2' : undefined} />
            </svg>
            {e.label}
          </li>
        );
      })}
    </ul>
  );
}

export default function WarehouseMapTab({ canAdjust = false, onAdjust }) {
  const toast = useToast();
  const [map, setMap] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [overlay, setOverlay] = useState('expiry');
  const [view, setView] = useState('top');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      setMap(await getWarehouseMap());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || 'Could not load the warehouse map.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getWarehouseMap()
      .then((next) => { if (!cancelled) { setMap(next); setLoadError(null); } })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'Could not load the warehouse map.'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (counting) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, counting]);

  const areas = useMemo(() => map?.areas ?? [], [map]);
  const products = useMemo(() => map?.products ?? [], [map]);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const unplaced = useMemo(
    () => products.filter((p) => p.unplaced > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const ctx = useMemo(() => ({ today: map?.today, programmeTones: programmeTones(products) }), [map, products]);
  // Areas with an urgent or warning badge: the Needs attention toggle
  // lights these up and dims the rest.
  const needing = useMemo(() => {
    const ctxNow = { today: map?.today, now: new Date() };
    return new Set(areas.filter((a) => ['bad', 'warn'].includes(badgeFor(a, ctxNow)?.level)).map((a) => a.id));
  }, [areas, map]);
  const highlighted = useMemo(
    () => (attentionOnly ? needing : areasMatching(areas, query)),
    [attentionOnly, needing, areas, query],
  );

  // A search for something no counted area holds says where it is instead.
  const searchNote = useMemo(() => {
    if (!query.trim() || highlighted?.size) return null;
    const found = products.filter((p) => matchesSearch(p, query) && p.unplaced > 0);
    if (found.length === 0) return 'No counted area holds a product like that.';
    if (found.length === 1) return `${found[0].name}: ${fmtQtyUnit(found[0].unplaced, found[0].unit)} not placed in any area.`;
    return `${found.length} matching products are not placed in any area.`;
  }, [query, highlighted, products]);

  const openArea = openId && openId !== UNPLACED ? areas.find((a) => a.id === openId) ?? null : null;

  const saveCount = async (lines) => {
    setSaving(true);
    try {
      const next = await recordAreaCount(openArea.id, lines);
      setMap(next);
      setCounting(false);
      const differ = lines
        .map((l) => next.products.find((p) => p.id === l.productId))
        .filter((p) => p && Math.abs(p.countedTotal - p.onHand) >= 0.001);
      toast({
        variant: 'success',
        title: `Counted ${openArea.name}`,
        description: differ.length === 0
          ? 'The counts match what is on hand.'
          : `${differ.length} product${differ.length === 1 ? '' : 's'} counted differently from what is on hand. Check each in the panel.`,
      });
    } catch (err) {
      toast({ variant: 'error', title: 'Could not save the count', description: err.message || 'Nothing was recorded.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError && !map) return <ErrorBanner message={loadError} onRetry={load} />;
  if (!map) return <Skeleton className="aspect-[5/3] w-full rounded-xl" />;

  if (!map.ready || areas.length === 0) {
    return (
      <EmptyState
        icon={MapIcon}
        title="No warehouse map yet"
        description={map.ready
          ? 'An admin draws the dry stores, cold rooms and floor areas in Warehouse layout.'
          : 'This warehouse needs the latest database update before it can have a map.'}
      />
    );
  }

  return (
    <div className="space-y-4">
      {loadError ? <ErrorBanner message={loadError} onRetry={load} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search aria-hidden="true" className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search" className="pl-8" placeholder="Find a product"
            aria-label="Find a product on the map" value={query} onChange={(e) => { setQuery(e.target.value); setAttentionOnly(false); }}
          />
        </div>
        <NativeSelect aria-label="Colour by" value={overlay} onChange={(e) => setOverlay(e.target.value)} className="w-40">
          {OVERLAYS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </NativeSelect>
        <div className="inline-flex rounded-4xl border p-0.5" role="group" aria-label="View">
          <Button type="button" size="sm" variant={view === 'top' ? 'secondary' : 'ghost'} aria-pressed={view === 'top'} onClick={() => setView('top')}>
            <Square /> Top
          </Button>
          <Button type="button" size="sm" variant={view === '3d' ? 'secondary' : 'ghost'} aria-pressed={view === '3d'} onClick={() => setView('3d')}>
            <Box /> 3D
          </Button>
        </div>
        <Button
          type="button" size="sm" variant={attentionOnly ? 'secondary' : 'outline'} aria-pressed={attentionOnly}
          className="ml-auto" disabled={needing.size === 0 && !attentionOnly}
          onClick={() => { setAttentionOnly((v) => !v); setQuery(''); }}
        >
          <AlertTriangle className={needing.size ? 'text-danger' : undefined} /> Needs attention <span className="tabular-nums text-muted-foreground">{needing.size}</span>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(UNPLACED)}>
          Not placed <span className="tabular-nums text-muted-foreground">{unplaced.length}</span>
        </Button>
      </div>

      {searchNote ? <p className="text-sm text-muted-foreground" role="status">{searchNote}</p> : null}

      <div className="overflow-hidden rounded-xl border bg-card p-2">
        <WarehouseMap
          today={map.today}
          matchProduct={query}
          grid={map.grid}
          areas={areas}
          view={view}
          toneOf={(a) => toneFor(a, overlay, ctx)}
          noteOf={areaNote}
          selectedId={openArea?.id ?? null}
          highlighted={highlighted}
          onSelect={(a) => setOpenId(a.id)}
        />
      </div>

      <Legend entries={legendFor(overlay, { products })} />
      <MarksLegend view={view} hasPallets={areas.some(isStaging)} />

      <CapacitySummary areas={areas} totals={map.totals} onOpen={(a) => isOpenable(a) && setOpenId(a.id)} />

      {openId === UNPLACED ? (
        <AreaPanel
          unplaced={unplaced}
          unstagedPallets={map.unstagedPallets ?? []}
          productsById={productsById}
          today={map.today}
          onFind={(name) => { setQuery(name); setAttentionOnly(false); }}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {openArea ? (
        <AreaPanel
          key={openArea.id}
          area={openArea}
          productsById={productsById}
          today={map.today}
          canCount={holdsStock(openArea)}
          canAdjust={canAdjust}
          onCount={() => setCounting(true)}
          onAdjust={(productId) => onAdjust?.(productId)}
          onFind={(name) => { setQuery(name); setAttentionOnly(false); }}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {counting && openArea ? (
        <CountAreaDialog
          area={openArea}
          products={products}
          onSave={saveCount}
          onClose={() => setCounting(false)}
          isSaving={saving}
        />
      ) : null}
    </div>
  );
}

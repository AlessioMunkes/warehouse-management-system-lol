// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/LayoutBuilder.jsx
//
// The admin's drawing board for the floor plan. Add a dry store, cold
// room, floor area, pallet staging area or door; drag it into place;
// drag its corner to size it. The form beside the plan names it and sets
// its capacity (kilograms for a store, pallet spaces for staging) and
// the stock it is meant for. The 3D preview shows the
// plan the way managers can view it.
//
// Controlled: the page holds the plan (so its header can save it) and
// passes it in with onChange. Areas not saved yet carry a negative id.
//
// THE KEYBOARD DOES EVERYTHING THE MOUSE DOES. Tab to an area, arrows
// move it one square, Shift and the arrows size it, Delete removes it.
//
// Overlapping areas are drawn red and the plan cannot be saved until
// they are apart: a count has to mean one place. The server checks the
// same (features/warehouseMap/layout.js).
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { Box, Plus, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import NativeSelect from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import WarehouseMap from './WarehouseMap';
import PreferredStockPicker from './PreferredStockPicker';
import {
  CELL, DEFAULT_GRID, KINDS, MAX_LEVELS, clamp, freeSpot, keepOnGrid, kindById, nextName, overlapping,
} from './mapGeometry';
import { TONES, toneFor } from './mapOverlays';

const HANDLE = 10;

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

let tempId = 0;
const newId = () => { tempId -= 1; return tempId; };

/** Where a pointer event is on the grid, in squares (fractions kept). */
const cellAt = (svg, e) => {
  const ctm = svg?.getScreenCTM?.();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x / CELL, y: p.y / CELL };
};

// An empty box is no capacity, not 0.
const positiveOrNull = (v) => (v === '' || !(Number(v) > 0) ? null : Number(v));

function AreaForm({ area, grid, products, countedProducts, onChange, onRemove }) {
  const kind = kindById(area.kind);
  const set = (patch) => onChange(keepOnGrid({ ...area, ...patch }, grid));
  const whole = (v, min, max) => clamp(Math.round(Number(v) || min), min, max);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="area-name">Name</Label>
        <Input id="area-name" value={area.name} maxLength={40} onChange={(e) => onChange({ ...area, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="area-kind">Type</Label>
        <NativeSelect id="area-kind" className="w-full" value={area.kind} onChange={(e) => set({ kind: e.target.value })}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="area-w">Width</Label>
          <Input id="area-w" type="number" min="1" max={grid.cols} value={area.w} onChange={(e) => set({ w: whole(e.target.value, 1, grid.cols) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="area-h">Depth</Label>
          <Input id="area-h" type="number" min="1" max={grid.rows} value={area.h} onChange={(e) => set({ h: whole(e.target.value, 1, grid.rows) })} />
        </div>
      </div>
      {kind.id === 'dry' || kind.id === 'cold' ? (
        <div className="space-y-1.5">
          <Label htmlFor="area-levels">Shelf levels</Label>
          <Input id="area-levels" type="number" min="1" max={MAX_LEVELS} value={area.levels} onChange={(e) => set({ levels: whole(e.target.value, 1, MAX_LEVELS) })} />
        </div>
      ) : null}
      {kind.holdsStock ? (
        <div className="space-y-1.5">
          <Label htmlFor="area-capacity">Capacity (kg)</Label>
          <Input
            id="area-capacity" type="number" min="1" step="any" inputMode="decimal" placeholder="Not set"
            value={area.capacityKg ?? ''} onChange={(e) => onChange({ ...area, capacityKg: positiveOrNull(e.target.value) })}
          />
        </div>
      ) : null}
      {kind.id === 'staging' ? (
        <div className="space-y-1.5">
          <Label htmlFor="area-pallets">Pallet spaces</Label>
          <Input
            id="area-pallets" type="number" min="1" step="1" placeholder="Not set"
            value={area.palletSpaces ?? ''}
            onChange={(e) => onChange({ ...area, palletSpaces: positiveOrNull(e.target.value) && Math.round(Number(e.target.value)) })}
          />
        </div>
      ) : null}
      {kind.holdsStock ? (
        <PreferredStockPicker
          products={products}
          productIds={area.preferredProductIds ?? []}
          categories={area.preferredCategories ?? []}
          onChange={({ productIds, categories }) => onChange({ ...area, preferredProductIds: productIds, preferredCategories: categories })}
        />
      ) : null}
      <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
        <Trash2 /> Remove area
      </Button>
      {countedProducts > 0 ? (
        <p className="text-xs text-muted-foreground">
          {countedProducts} product{countedProducts === 1 ? ' is' : 's are'} counted here. Removed, {countedProducts === 1 ? 'it shows' : 'they show'} as not placed.
        </p>
      ) : null}
    </div>
  );
}

export default function LayoutBuilder({ areas, onChange, grid = DEFAULT_GRID, products = [], countedOf = () => 0 }) {
  const svgRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('plan');
  const [drag, setDrag] = useState(null);

  const clash = overlapping(areas);
  const selected = areas.find((a) => a.id === selectedId) ?? null;

  const update = (next) => onChange(areas.map((a) => (a.id === next.id ? next : a)));
  const remove = (id) => { onChange(areas.filter((a) => a.id !== id)); setSelectedId(null); };

  const add = (kindId) => {
    const kind = kindById(kindId);
    const spot = freeSpot(areas, kind.size, grid);
    const area = {
      id: newId(), name: nextName(areas, kindId), kind: kindId, ...spot, ...kind.size, levels: kind.levels,
      capacityKg: null, palletSpaces: null, preferredProductIds: [], preferredCategories: [],
    };
    onChange([...areas, area]);
    setSelectedId(area.id);
    setView('plan');
  };

  const startDrag = (e, area, mode) => {
    e.stopPropagation();
    setSelectedId(area.id);
    const at = cellAt(svgRef.current, e);
    if (!at) return;
    svgRef.current.setPointerCapture?.(e.pointerId);
    setDrag({ id: area.id, mode, at, from: area });
  };

  const moveDrag = (e) => {
    if (!drag) return;
    const at = cellAt(svgRef.current, e);
    if (!at) return;
    const dx = Math.round(at.x - drag.at.x);
    const dy = Math.round(at.y - drag.at.y);
    const { from } = drag;
    const next = drag.mode === 'move'
      ? { ...from, x: from.x + dx, y: from.y + dy }
      : { ...from, w: Math.max(from.w + dx, 1), h: Math.max(from.h + dy, 1) };
    const fitted = drag.mode === 'move'
      ? keepOnGrid(next, grid)
      : { ...next, w: Math.min(next.w, grid.cols - from.x), h: Math.min(next.h, grid.rows - from.y) };
    const current = areas.find((a) => a.id === drag.id);
    if (current && (current.x !== fitted.x || current.y !== fitted.y || current.w !== fitted.w || current.h !== fitted.h)) {
      update({ ...current, x: fitted.x, y: fitted.y, w: fitted.w, h: fitted.h });
    }
  };

  const keyDown = (e, area) => {
    const arrow = ARROWS[e.key];
    if (arrow) {
      e.preventDefault();
      const [dx, dy] = arrow;
      update(keepOnGrid(e.shiftKey
        ? { ...area, w: Math.max(area.w + dx, 1), h: Math.max(area.h + dy, 1) }
        : { ...area, x: area.x + dx, y: area.y + dy }, grid));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(area.id);
    }
  };

  const width = grid.cols * CELL;
  const height = grid.rows * CELL;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <Button key={k.id} type="button" variant="outline" size="sm" onClick={() => add(k.id)}>
              <Plus /> {k.label}
            </Button>
          ))}
          <div className="ml-auto inline-flex rounded-4xl border p-0.5" role="group" aria-label="View">
            <Button type="button" size="sm" variant={view === 'plan' ? 'secondary' : 'ghost'} aria-pressed={view === 'plan'} onClick={() => setView('plan')}>
              <Square /> Plan
            </Button>
            <Button type="button" size="sm" variant={view === '3d' ? 'secondary' : 'ghost'} aria-pressed={view === '3d'} onClick={() => setView('3d')}>
              <Box /> 3D preview
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card p-2">
          {view === '3d' ? (
            <WarehouseMap grid={grid} areas={areas} view="3d" toneOf={(a) => (clash.has(a.id) ? 'bad' : toneFor(a, 'kind'))} title="Plan preview" />
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              className="h-auto w-full touch-none select-none"
              role="group"
              aria-label="Warehouse plan. Choose an area, then drag it or use the arrow keys."
              onPointerMove={moveDrag}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
              onPointerDown={() => setSelectedId(null)}
            >
              <defs>
                <pattern id="wm-build-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                  <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" className="stroke-line" strokeWidth={0.75} />
                </pattern>
              </defs>
              <rect width={width} height={height} className="fill-surface-2" />
              <rect width={width} height={height} fill="url(#wm-build-grid)" />
              {areas.map((a) => {
                const t = TONES[clash.has(a.id) ? 'bad' : toneFor(a, 'kind')];
                const on = a.id === selectedId;
                const [x, y, w, h] = [a.x * CELL, a.y * CELL, a.w * CELL, a.h * CELL];
                return (
                  <g
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${a.name}, ${kindById(a.kind).label}, ${a.w} by ${a.h}`}
                    aria-pressed={on}
                    className={cn('outline-none', drag?.id === a.id ? 'cursor-grabbing' : 'cursor-grab')}
                    onPointerDown={(e) => startDrag(e, a, 'move')}
                    onFocus={() => setSelectedId(a.id)}
                    onKeyDown={(e) => keyDown(e, a)}
                  >
                    <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={4} className={cn(t.fill, t.stroke)} strokeWidth={on ? 3 : 1.25} />
                    <text
                      x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={11}
                      className={cn('pointer-events-none font-medium', a.kind === 'door' && !clash.has(a.id) ? 'fill-on-brand' : 'fill-ink')}
                    >
                      {a.name.length * 6.2 <= w - 6 ? a.name : ''}
                    </text>
                    {on ? (
                      <rect
                        x={x + w - HANDLE - 2} y={y + h - HANDLE - 2} width={HANDLE} height={HANDLE} rx={2}
                        className="cursor-nwse-resize fill-ink stroke-surface"
                        aria-hidden="true"
                        onPointerDown={(e) => startDrag(e, a, 'resize')}
                      />
                    ) : null}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        {clash.size > 0 ? (
          <p role="alert" className="text-sm text-danger">Areas in red overlap. Move them apart to save the plan.</p>
        ) : null}
      </div>

      <aside className="rounded-xl border bg-card p-4" aria-label="Chosen area">
        {selected ? (
          <AreaForm
            key={selected.id}
            area={selected}
            grid={grid}
            products={products}
            countedProducts={countedOf(selected.id)}
            onChange={update}
            onRemove={() => remove(selected.id)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {areas.length === 0 ? 'Add an area to start the plan.' : 'Choose an area to name it, size it or remove it.'}
          </p>
        )}
      </aside>
    </div>
  );
}

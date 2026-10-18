// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/WarehouseMap.jsx
//
// The floor plan, drawn: every area a shape coloured by the tone it is
// given, in the top view or the 3D view (mapGeometry.js has the
// arithmetic for both). Hand-drawn SVG, like the process map on
// Operations reports. Packed pallets stand in staging areas as small
// boxes in 3D and small squares from the top.
//
//   areas       [{ id, name, kind, x, y, w, h, levels, pallets?, ... }]
//   view        'top' | '3d'
//   toneOf      (area) => a tone name from mapOverlays.js TONES
//   noteOf      (area) => a short second line ("3 products"), optional
//   selectedId  the area to outline
//   highlighted a Set of area ids a search matched; the rest dim. null
//               when nothing is being searched for.
//   onSelect    (area) => void; makes each area but a door a button.
//               Leave it off for a picture only.
//
// TURNING THE 3D VIEW. Drag across it to turn the floor round, drag up
// or down to look from higher or lower. The buttons turn it a quarter
// at a time and put it back, and the arrow keys do the same once the
// view has focus. A drag never counts as choosing an area.
// ─────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from 'react';
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CELL, DEFAULT_CAMERA, DEFAULT_GRID, TILT_RANGE, areaBox, boxFaces, camera, clamp, drawOrder,
  floorOutline, isOpenable, kindById, palletBoxes,
} from './mapGeometry';
import { TONES } from './mapOverlays';
import { cn } from '@/lib/utils';

const FONT = 11;
const DRAG_START_PX = 4;
const YAW_PER_PX = 0.4;
const TILT_PER_PX = 0.25;

// About how many characters fit across a width, at the label size.
const fits = (text, width) => text.length * FONT * 0.56 <= width - 6;
const shorten = (text, width) => {
  if (fits(text, width)) return text;
  const room = Math.floor((width - 6) / (FONT * 0.56)) - 1;
  return room >= 3 ? `${text.slice(0, room)}…` : '';
};

const pressable = (area, onSelect) => (onSelect ? {
  role: 'button',
  tabIndex: 0,
  onClick: () => onSelect(area),
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect(area); }
  },
  className: 'cursor-pointer outline-none focus-visible:[&>*:first-child]:stroke-[3]',
} : {});

function TopArea({ area, tone, note, selected, dimmed, onSelect, label }) {
  const t = TONES[tone] ?? TONES.neutral;
  const x = area.x * CELL;
  const y = area.y * CELL;
  const w = area.w * CELL;
  const h = area.h * CELL;
  const name = shorten(area.name, w);
  const showNote = note && h >= 2 * CELL && fits(note, w);
  const pallets = palletBoxes(area, area.pallets?.length ?? 0).filter((p) => p.z0 < 0.1);
  return (
    <g {...pressable(area, onSelect)} aria-label={label} opacity={dimmed ? 0.3 : 1}>
      <rect
        x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={4}
        className={cn(t.fill, t.stroke)}
        strokeWidth={selected ? 3 : 1.25}
        strokeDasharray={t.dashed ? '4 3' : undefined}
      />
      {pallets.map((p) => (
        <rect
          key={p.id} x={p.x * CELL} y={p.y * CELL} width={p.w * CELL} height={p.h * CELL} rx={2}
          className="pointer-events-none fill-chart-tan stroke-gold" strokeWidth={1}
        />
      ))}
      {name ? (
        <text
          x={x + w / 2} y={y + h / 2 + (showNote ? -3 : 4)} textAnchor="middle"
          className={cn('pointer-events-none select-none font-medium', tone === 'door' ? 'fill-on-brand' : 'fill-ink')}
          fontSize={FONT}
        >
          {name}
        </text>
      ) : null}
      {showNote ? (
        <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" className="pointer-events-none select-none fill-ink-soft" fontSize={FONT - 1}>
          {note}
        </text>
      ) : null}
    </g>
  );
}

function Box({ faces, className, strokeWidth = 1, dashed }) {
  return (
    <>
      <polygon points={faces.top} className={className} strokeWidth={strokeWidth} strokeLinejoin="round" strokeDasharray={dashed ? '4 3' : undefined} />
      {faces.walls.map((wall) => (
        <g key={wall.points}>
          <polygon points={wall.points} className={className} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <polygon points={wall.points} className="pointer-events-none fill-black" fillOpacity={wall.shade} />
        </g>
      ))}
    </>
  );
}

function ThreeD({ grid, areas, shared, title, className }) {
  const [cam, setCam] = useState(DEFAULT_CAMERA);
  const drag = useRef(null);
  const moved = useRef(false);
  const view = useMemo(() => camera(cam, grid), [cam, grid]);

  // Areas and their pallets, as one list of boxes, far first.
  const boxes = useMemo(() => drawOrder([
    ...areas.map((area) => ({ ...areaBox(area), area })),
    ...areas.flatMap((area) => palletBoxes(area, area.pallets?.length ?? 0).map((p) => ({ ...p, palletOf: area }))),
  ], view), [areas, view]);

  const turn = (deg) => setCam((c) => ({ ...c, yaw: (c.yaw + deg + 360) % 360 }));
  const lean = (deg) => setCam((c) => ({ ...c, tilt: clamp(c.tilt + deg, TILT_RANGE.min, TILT_RANGE.max) }));

  const down = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, from: cam, active: false };
    moved.current = false;
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active && Math.hypot(dx, dy) < DRAG_START_PX) return;
    if (!d.active) { d.active = true; e.currentTarget.setPointerCapture?.(e.pointerId); }
    moved.current = true;
    setCam({
      yaw: (d.from.yaw - dx * YAW_PER_PX + 360) % 360,
      tilt: clamp(d.from.tilt + dy * TILT_PER_PX, TILT_RANGE.min, TILT_RANGE.max),
    });
  };
  const up = () => { drag.current = null; };
  // The click that ends a drag is not a choice: stopped before it
  // reaches the area under the pointer.
  const swallowDragClick = (e) => {
    if (!moved.current) return;
    moved.current = false;
    e.stopPropagation();
  };

  const keyDown = (e) => {
    const step = { ArrowLeft: () => turn(15), ArrowRight: () => turn(-15), ArrowUp: () => lean(5), ArrowDown: () => lean(-5) }[e.key];
    if (step && e.target === e.currentTarget) { e.preventDefault(); step(); }
  };

  return (
    <div className="relative">
      <svg
        viewBox={view.viewBox()}
        role="group"
        tabIndex={0}
        aria-label={`${title}, 3D view. Drag or use the arrow keys to turn it.`}
        className={cn('h-auto w-full cursor-grab touch-none select-none outline-none active:cursor-grabbing', className)}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={keyDown}
        onClickCapture={swallowDragClick}
      >
        <polygon points={floorOutline(view, grid)} className="fill-surface-2 stroke-line" strokeWidth={1} />
        {boxes.map((box) => {
          const faces = boxFaces(box, view);
          if (box.palletOf) {
            const s = shared(box.palletOf);
            return (
              <g key={box.id} className="pointer-events-none" opacity={s.dimmed ? 0.3 : 1}>
                <Box faces={faces} className="fill-chart-tan stroke-gold" strokeWidth={0.75} />
              </g>
            );
          }
          const s = shared(box.area);
          const t = TONES[s.tone] ?? TONES.neutral;
          const name = shorten(box.area.name, Math.min(box.area.w, box.area.h) * 22 * 1.4);
          return (
            <g key={box.area.id} {...pressable(box.area, s.onSelect)} aria-label={s.label} opacity={s.dimmed ? 0.3 : 1}>
              <Box faces={faces} className={cn(t.fill, t.stroke)} strokeWidth={s.selected ? 2.5 : 1} dashed={t.dashed} />
              {name && box.area.kind !== 'door' ? (
                <text
                  x={faces.label.px} y={faces.label.py + 4} textAnchor="middle"
                  className="pointer-events-none select-none fill-ink font-medium" fontSize={FONT - 1}
                >
                  {name}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="absolute right-2 top-2 flex gap-1 rounded-4xl border bg-card/90 p-0.5 shadow-sm" role="group" aria-label="Turn the view">
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Turn left" title="Turn left" onClick={() => turn(90)}><RotateCcw /></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Turn right" title="Turn right" onClick={() => turn(-90)}><RotateCw /></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Reset the view" title="Reset the view" onClick={() => setCam(DEFAULT_CAMERA)}><Undo2 /></Button>
      </div>
    </div>
  );
}

export default function WarehouseMap({
  grid = DEFAULT_GRID,
  areas,
  view = 'top',
  toneOf,
  noteOf,
  selectedId = null,
  highlighted = null,
  onSelect,
  title = 'Warehouse map',
  className,
}) {
  const labelOf = (area) => [area.name, kindById(area.kind).label, noteOf?.(area)].filter(Boolean).join(', ');
  const shared = (area) => ({
    area,
    tone: toneOf(area),
    selected: area.id === selectedId,
    dimmed: highlighted ? !highlighted.has(area.id) : false,
    onSelect: isOpenable(area) ? onSelect : undefined,
    label: labelOf(area),
  });

  if (view === '3d') {
    return <ThreeD grid={grid} areas={areas} shared={shared} title={title} className={className} />;
  }

  const width = grid.cols * CELL;
  const height = grid.rows * CELL;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${title}, top view`} className={cn('h-auto w-full', className)}>
      <defs>
        <pattern id="wm-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" className="stroke-line" strokeWidth={0.75} />
        </pattern>
      </defs>
      <rect width={width} height={height} className="fill-surface-2" />
      <rect width={width} height={height} fill="url(#wm-grid)" />
      {areas.map((area) => <TopArea key={area.id} {...shared(area)} note={noteOf?.(area)} />)}
    </svg>
  );
}

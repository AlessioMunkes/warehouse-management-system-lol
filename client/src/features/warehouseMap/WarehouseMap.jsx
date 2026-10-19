// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/WarehouseMap.jsx
//
// The floor plan, drawn: every area a shape coloured by the tone it is
// given, in the top view or the 3D view (mapGeometry.js has the
// arithmetic for both). Hand-drawn SVG, like the process map on
// Operations reports: no 3D library, nothing extra to download.
//
//   areas       [{ id, name, kind, x, y, w, h, levels, pallets?, fill?, ... }]
//   view        'top' | '3d'
//   toneOf      (area) => a tone name from mapOverlays.js TONES
//   noteOf      (area) => a short second line ("3 products"), optional
//   selectedId  the area to outline
//   highlighted a Set of area ids a search matched; the rest dim. null
//               when nothing is being searched for.
//   onSelect    (area) => void; makes each area but a door a button.
//               Leave it off for a picture only.
//   today       the server's 'YYYY-MM-DD', for expiry and pallet days
//
// WHAT THE 3D VIEW SHOWS, on top of the colour:
//   - an area with a capacity (and weights for all it holds) is a glass
//     frame with its stock as a solid block inside, as high as it is
//     full; past full, a red cap rises out of the top. Any other area
//     with stock is glass with a stack per product inside, as tall as
//     its quantity, so stock with no weight or no capacity still shows.
//     Shelf levels are lines on the walls.
//   - hovering a stack names the product and how much; a product search
//     lights up its own stacks (matchProduct).
//   - a badge floats over an area that needs someone (mapIndicators.js),
//     pulsing when it is urgent, on a label with its name and figure.
//   - packed pallets are coloured by their collection day; today's
//     breathe.
//   - shadows and a floor grid for depth, a compass that turns with the
//     view, and a card on hover with everything about the area.
//   - the day (mapActivity.js): on a collection day, each centre whose
//     pallet is packed waits at the dispatch gate in its own bakkie,
//     named, until it collects; a supplier's truck at the receiving gate
//     while a delivery is expected (amber if late); a moving line along
//     the floor where goods are on their way. A vehicle opens its gate.
//
// ZOOMING (useMapZoom.js, both views). It opens fitted to the drawn
// plan. The + and - buttons, scrolling once the map has been clicked,
// pinching, or the + - 0 keys zoom in and out; Fit puts the whole plan
// back. In the top view a drag moves the plan; in 3D Shift-drag does.
//
// TURNING IT. Drag across it to turn the floor round, up or down to look
// from higher or lower. The buttons turn it a quarter at a time, put it
// back, or set it turning slowly by itself; the arrow keys turn it once
// the view has focus. A drag never counts as choosing an area. Under
// Reduce movement every turn is instant and there is no slow turning.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Pause, Play, Plus, RotateCcw, RotateCw, Tags, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtQty } from '@/lib/quantity';
import {
  CELL, DEFAULT_CAMERA, DEFAULT_GRID, LEVEL_HEIGHT, TILT_RANGE, anchorAbove, areaBox, boxFaces, camera, clamp,
  drawOrder, floorGrid, floorOutline, holdsStock, isOpenable, isStaging, kindById, northBearing, palletBoxes,
  planFocus, productStacks, shadowPoints, shelfLines, truckBoxes, withOutside,
} from './mapGeometry';
import { routesFor } from './mapActivity';
import useMapZoom from './useMapZoom';
import { TONES, fillTone } from './mapOverlays';
import {
  BADGE_CLASS, alertsFor, badgeFor, figureOf, heldText, palletDue, palletLook, stockLines, stockMode,
} from './mapIndicators';
import { cn } from '@/lib/utils';

const FONT = 11;
const DRAG_START_PX = 4;
const YAW_PER_PX = 0.4;
const TILT_PER_PX = 0.25;
const TURN_MS = 450;
const SPIN_DEG_PER_S = 8;

const lessMotion = () => typeof document !== 'undefined' && (
  document.documentElement.getAttribute('data-stf-motion') === 'reduced'
  || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));

// About how many characters fit across a width, at the label size.
const fits = (text, width) => text.length * FONT * 0.56 <= width - 6;
const shorten = (text, width) => {
  if (fits(text, width)) return text;
  const room = Math.floor((width - 6) / (FONT * 0.56)) - 1;
  return room >= 3 ? `${text.slice(0, room)}…` : '';
};
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

const pressable = (area, onSelect) => (onSelect ? {
  role: 'button',
  tabIndex: 0,
  onClick: () => onSelect(area),
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect(area); }
  },
  className: 'cursor-pointer outline-none focus-visible:[&>*:first-child]:stroke-[3]',
} : {});

// Stock with nothing to flag looks like goods, not like an empty grey box.
const STACK_LOOK = { neutral: 'fill-chart-tan stroke-gold', empty: 'fill-chart-tan stroke-gold' };
const fmtCount = (n) => Math.round(Number(n) || 0).toLocaleString('en-ZA');
const matches = (item, q) => Boolean(q) && [item.name, item.sku].some((v) => v?.toLowerCase().includes(q));

// A badge: a filled circle with a glyph, and a spreading ring when urgent.
function Badge({ x, y, badge, r = 7 }) {
  const look = BADGE_CLASS[badge.level];
  return (
    <g className="pointer-events-none" aria-hidden="true">
      {badge.level === 'bad' ? <circle cx={x} cy={y} r={r} className={cn('wm-ping', look.fill)} /> : null}
      <circle cx={x} cy={y} r={r} className={cn(look.fill, 'stroke-surface')} strokeWidth={1.5} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={r + 3} className={cn('select-none font-bold', look.text)}>
        {badge.glyph.length > 2 ? '9+' : badge.glyph}
      </text>
    </g>
  );
}

// ── Top view ──────────────────────────────────────────────────
function TopArea({ area, tone, note, selected, dimmed, onSelect, label, badge, today, matchProduct }) {
  const t = TONES[tone] ?? TONES.neutral;
  const x = area.x * CELL;
  const y = area.y * CELL;
  const w = area.w * CELL;
  const h = area.h * CELL;
  const name = shorten(area.name, w);
  const showNote = note && h >= 2 * CELL && fits(note, w);
  const pallets = palletBoxes(area, area.pallets?.length ?? 0).filter((p) => p.z0 < 0.1);
  const mode = stockMode(area);
  const bar = mode === 'fill' || (isStaging(area) && area.fill !== null && area.fill !== undefined);
  // No fill to show: a marker per product along the bottom instead, so an
  // area holding stock never looks empty. Up to as many as fit.
  const markers = mode === 'stacks' ? stockLines(area).slice(0, Math.max(Math.floor((w - 10) / 11), 0)) : [];
  const q = matchProduct?.trim().toLowerCase() || '';
  return (
    <g {...pressable(area, onSelect)} aria-label={label} opacity={dimmed ? 0.3 : 1}>
      <rect
        x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={4}
        className={cn(t.fill, t.stroke)}
        strokeWidth={selected ? 3 : 1.25}
        strokeDasharray={t.dashed ? '4 3' : undefined}
      />
      {pallets.map((p, i) => {
        const look = palletLook(palletDue(area.pallets[i], today));
        return (
          <rect
            key={p.id} x={p.x * CELL} y={p.y * CELL} width={p.w * CELL} height={p.h * CELL} rx={2}
            className={cn('pointer-events-none', look.fill, look.stroke)} strokeWidth={1}
          />
        );
      })}
      {bar && w > 3 * CELL ? (
        <g className="pointer-events-none" aria-hidden="true">
          <rect x={x + 5} y={y + h - 8} width={w - 10} height={3.5} rx={1.75} className="fill-surface-2" />
          <rect
            x={x + 5} y={y + h - 8} width={Math.max((w - 10) * Math.min(area.fill, 1), 0)} height={3.5} rx={1.75}
            className={TONES[fillTone(area.fill)].solid}
          />
        </g>
      ) : null}
      {markers.length ? (
        <g className="pointer-events-none" aria-hidden="true">
          {markers.map((m, i) => (
            <rect
              key={m.productId} x={x + 5 + i * 11} y={y + h - 13} width={9} height={9} rx={2}
              className={matches(m, q) ? 'fill-info stroke-ink' : (STACK_LOOK[tone] ?? cn(t.solid, t.stroke))} strokeWidth={matches(m, q) ? 1.2 : 0.75}
              opacity={q && !matches(m, q) ? 0.35 : (m.expected ? 0.6 : 1)}
            />
          ))}
        </g>
      ) : null}
      {name ? (
        <text
          x={x + w / 2} y={y + h / 2 + (showNote ? -3 : 4)} textAnchor="middle"
          className={cn('pointer-events-none select-none font-medium', tone === 'door' ? 'fill-on-brand' : 'fill-ink stroke-surface')}
          fontSize={FONT} strokeWidth={tone === 'door' ? 0 : 3} paintOrder="stroke" strokeLinejoin="round"
        >
          {name}
        </text>
      ) : null}
      {showNote ? (
        <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" className="pointer-events-none select-none fill-ink-soft stroke-surface" fontSize={FONT - 1} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
          {note}
        </text>
      ) : null}
      {badge ? <Badge x={x + w - 4} y={y + 4} badge={badge} r={6.5} /> : null}
    </g>
  );
}

// ── 3D view ───────────────────────────────────────────────────
function Box({ faces, className, strokeWidth = 1, dashed, fillOpacity }) {
  return (
    <>
      {faces.walls.map((wall) => (
        <g key={wall.points}>
          <polygon points={wall.points} className={className} strokeWidth={strokeWidth} strokeLinejoin="round" fillOpacity={fillOpacity} />
          <polygon points={wall.points} className="pointer-events-none fill-black" fillOpacity={wall.shade * (fillOpacity ?? 1)} />
        </g>
      ))}
      <polygon points={faces.top} className={className} strokeWidth={strokeWidth} strokeLinejoin="round" strokeDasharray={dashed ? '4 3' : undefined} fillOpacity={fillOpacity} />
    </>
  );
}

// An area in 3D: its frame, and inside it the stock as high as it is full.
function Area3D({ box, view, s }) {
  const { area } = box;
  const t = TONES[s.tone] ?? TONES.neutral;
  const stroke = s.selected ? 2.5 : (s.hovered ? 1.8 : 1);
  const mode = stockMode(area);
  const glass = mode === 'fill' || (mode === 'stacks' && area.kind !== 'floor');
  const stacks = mode === 'stacks' ? drawOrder(productStacks(area, stockLines(area)), view) : [];
  const H = box.z1;
  const inset = 0.1;
  const inner = mode === 'fill' && area.fill > 0
    ? { x: box.x + inset, y: box.y + inset, w: box.w - 2 * inset, h: box.h - 2 * inset, z0: 0, z1: Math.max(Math.min(area.fill, 1) * H, 0.03) }
    : null;
  const cap = mode === 'fill' && area.fill > 1
    ? { ...inner, z0: H, z1: H + Math.min(area.fill - 1, 0.6) * H }
    : null;
  const levels = (area.kind === 'dry' || area.kind === 'cold') ? Math.round(H / LEVEL_HEIGHT) : 0;
  const shelves = levels > 1 ? shelfLines(box, view, Array.from({ length: levels - 1 }, (_, i) => (i + 1) * LEVEL_HEIGHT)) : [];

  return (
    <g
      {...pressable(area, s.onSelect)}
      aria-label={s.label}
      opacity={s.dimmed ? 0.25 : 1}
      className={cn(s.onSelect ? 'cursor-pointer outline-none focus-visible:[&_polygon]:stroke-[2.5]' : '', 'wm-lift')}
      transform={s.hovered ? 'translate(0 -4)' : undefined}
      onPointerEnter={s.onHover}
      onPointerMove={s.onHover}
      onPointerLeave={s.onLeave}
    >
      {area.kind === 'floor' ? <Box faces={boxFaces(box, view)} className={cn(t.fill, t.stroke)} strokeWidth={stroke} dashed={t.dashed} /> : null}
      {stacks.map((st) => {
        const hit = matches(st.item, s.matchProduct);
        return (
          <g
            key={st.id}
            onPointerEnter={(e) => s.onHover(e, st.item)}
            onPointerMove={(e) => s.onHover(e, st.item)}
            opacity={s.matchProduct && !hit ? 0.35 : 1}
          >
            <title>{`${st.item.name}: ${fmtCount(st.item.about)} ${st.item.unit}`}</title>
            <Box
              faces={boxFaces(st, view)}
              className={cn(hit ? 'fill-info stroke-ink' : (STACK_LOOK[s.tone] ?? cn(t.solid, t.stroke)), st.item.expected && !hit && 'opacity-60')}
              strokeWidth={hit ? 1.5 : 0.6}
              fillOpacity={0.95}
            />
          </g>
        );
      })}
      {inner ? <Box faces={boxFaces(inner, view)} className={cn(t.solid, t.stroke)} strokeWidth={0.75} fillOpacity={0.92} /> : null}
      {cap ? <Box faces={boxFaces(cap, view)} className="fill-danger stroke-danger" strokeWidth={0.75} fillOpacity={0.85} /> : null}
      {area.kind === 'floor' ? null : (
        <Box faces={boxFaces(box, view)} className={cn(t.fill, t.stroke)} strokeWidth={stroke} dashed={t.dashed} fillOpacity={glass ? (mode === 'stacks' ? 0.22 : 0.3) : undefined} />
      )}
      {shelves.map((l) => (
        <line key={`${l.x1},${l.y1}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={cn('pointer-events-none', t.stroke)} strokeWidth={0.75} strokeOpacity={0.6} />
      ))}
    </g>
  );
}

// The label that floats over an area: badge, name and figure, on a line
// down to the top of its box.
function Label3D({ box, view, s, showText }) {
  const { area } = box;
  // Above what stands on or by it: pallets, or the centres' name tags.
  const lift = (isStaging(area) && area.pallets?.length) ? 3.2 : (area.gate?.trucks ? 3.4 : 1.1);
  const { top, float } = anchorAbove(box, view, showText ? lift : 0.7);
  const name = clip(area.name, 18);
  const figure = area.kind === 'door' ? null : figureOf(area);
  const text = figure ? `${name} · ${figure}` : name;
  const width = text.length * 5.9 + (s.badge ? 26 : 14);
  if (!showText && !s.badge) return null;
  // A dispatch gate with centres queued has its label at the head of
  // their names instead (drawn with the name tags).
  if (showText && area.gate?.kind === 'dispatch' && area.gate.trucks) return null;
  return (
    <g className="pointer-events-none" opacity={s.dimmed ? 0.25 : 1} transform={s.hovered ? 'translate(0 -4)' : undefined}>
      <line x1={top.px} y1={top.py} x2={float.px} y2={float.py} className="stroke-ink-soft" strokeWidth={0.75} strokeDasharray="2 2" />
      {showText ? (
        <>
          <rect
            x={float.px - width / 2} y={float.py - 9} width={width} height={18} rx={9}
            className={cn('fill-surface', s.selected || s.hovered ? 'stroke-ink' : 'stroke-line-strong')} strokeWidth={s.selected ? 1.5 : 1}
          />
          <text x={float.px + (s.badge ? 6 : 0)} y={float.py + 3.5} textAnchor="middle" fontSize={FONT - 1} className="select-none fill-ink font-medium">
            {text}
          </text>
          {s.badge ? <Badge x={float.px - width / 2 + 9} y={float.py} badge={s.badge} r={6.5} /> : null}
        </>
      ) : <Badge x={float.px} y={float.py} badge={s.badge} />}
    </g>
  );
}

// Everything about an area, by the pointer.
function HoverCard({ area, at, today, stack }) {
  const alerts = alertsFor(area, { today, now: new Date() });
  const products = stockLines(area);
  const lines = [];
  if (area.gate?.kind === 'dispatch') {
    const g = area.gate;
    if (g.total) {
      lines.push(`${g.collected.length} of ${g.total} centres collected`);
      if (g.waiting.length) lines.push(`At the gate: ${g.waiting.slice(0, 3).map((c) => c.name).join(', ')}${g.waiting.length > 3 ? ` and ${g.waiting.length - 3} more` : ''}`);
      if (g.packing.length + g.toPack.length) lines.push(`${g.packing.length + g.toPack.length} still packing`);
    } else {
      lines.push('No collections today');
    }
  } else if (area.gate?.kind === 'receiving') {
    const g = area.gate;
    [...g.late, ...g.expected].slice(0, 3).forEach((po) => lines.push(`${po.supplier} · ${po.po_number}${po.expected_on < today ? ' (late)' : ''}`));
    if (!g.truckCount) lines.push('No deliveries expected');
    lines.push(`${g.receivedToday.length} received today`);
  } else if (isStaging(area)) {
    lines.push(`${area.pallets?.length ?? 0} packed pallet${area.pallets?.length === 1 ? '' : 's'}${area.palletSpaces ? ` of ${area.palletSpaces} spaces` : ''}`);
  } else if (holdsStock(area) && Array.isArray(area.items)) {
    const held = heldText(area);
    lines.push(held
      ? (area.capacityKg ? `${held} · capacity ${fmtQty(area.capacityKg)} kg` : held)
      : 'Empty');
    if (!area.capacityKg) lines.push('No capacity set');
    else if (area.unweighed > 0) lines.push('Some stock has no weight on record, so how full it is is not shown');
  }
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-56 rounded-xl border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
      style={{ left: at.x + 14, top: at.y + 14 }}
    >
      <p className="text-sm font-medium">{area.name}</p>
      <p className="text-muted-foreground">{kindById(area.kind).label}</p>
      {stack ? (
        <p className="mt-1 rounded-md bg-info-soft px-2 py-1 font-medium text-info">
          {stack.name}: {fmtCount(stack.about)} {stack.unit}{stack.expected ? ' (expected)' : ''}
        </p>
      ) : null}
      {lines.map((l) => <p key={l} className={cn('mt-0.5', l === 'No capacity set' && 'text-muted-foreground')}>{l}</p>)}
      {products.length && !isStaging(area) ? (
        <ul className="mt-1 space-y-0.5">
          {products.slice(0, 4).map((p) => (
            <li key={p.productId} className="flex justify-between gap-2">
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{fmtCount(p.about)} {p.unit}</span>
            </li>
          ))}
          {products.length > 4 ? <li className="text-muted-foreground">and {products.length - 4} more</li> : null}
        </ul>
      ) : null}
      {alerts.length ? (
        <ul className="mt-1.5 space-y-0.5 border-t pt-1.5">
          {alerts.map((a) => (
            <li key={a.text} className={cn('flex items-center gap-1.5', a.level === 'bad' ? 'text-danger' : a.level === 'warn' ? 'text-warn' : a.level === 'info' ? 'text-info' : 'text-muted-foreground')}>
              <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-current" />
              {a.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Compass({ bearing }) {
  return (
    <svg width="52" height="52" viewBox="-26 -26 52 52" role="img" aria-label={`North points ${Math.round((bearing + 360) % 360)} degrees round`} className="drop-shadow-sm">
      <circle r="24" className="fill-card stroke-line" strokeWidth="1" />
      <g transform={`rotate(${bearing})`}>
        <path d="M0 -12 L4.5 1 L0 -1.5 L-4.5 1 Z" className="fill-danger" />
        <path d="M0 12 L4.5 -1 L0 1.5 L-4.5 -1 Z" className="fill-ink-faint" />
        <text y="-14.5" textAnchor="middle" fontSize="8" className="fill-ink font-bold">N</text>
      </g>
    </svg>
  );
}

// A centre's bakkie: each in its own colour so the queue reads as
// different centres. A supplier's truck: the trailer in its gate's tone
// (amber when late) and a white cab. Wheels black.
const BAKKIE_COLOURS = ['info', 'violet', 'good', 'tan'];
const vehicleLook = (box) => {
  if (box.part === 'wheel') return 'fill-ink stroke-ink';
  const gate = box.truckOf.gate;
  if (gate.kind === 'dispatch') {
    const t = TONES[BAKKIE_COLOURS[box.truck % BAKKIE_COLOURS.length]];
    return box.part === 'cab' ? cn(t.solid, t.stroke) : cn(t.fill, t.stroke);
  }
  if (box.part === 'cab') return 'fill-surface stroke-ink-soft';
  return cn(TONES[gate.tone]?.solid ?? 'fill-info', TONES[gate.tone]?.stroke ?? 'stroke-info');
};

/**
 * Every vehicle at a gate today, as boxes, each knowing its gate and, at
 * the dispatch gate, the centre it is: { ...box, truckOf, centre }.
 */
const trucksOf = (areas) => areas
  .filter((a) => a.gate?.trucks)
  .flatMap((gate) => truckBoxes(gate, areas, gate.gate.trucks, gate.gate.kind === 'dispatch' ? 'bakkie' : 'truck')
    .map((b) => ({ ...b, truckOf: gate, centre: gate.gate.vehicles?.[b.truck]?.name ?? null })));

// + / - / Fit, bottom right, and the scroll hint while it is needed.
function ZoomControls({ z }) {
  return (
    <>
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 rounded-2xl border bg-card/90 p-0.5 shadow-sm backdrop-blur" role="group" aria-label="Zoom">
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={z.zoomIn}><Plus /></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={z.zoomOut}><Minus /></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Fit the plan" title="Fit the plan" onClick={z.fitPlan}><Maximize2 /></Button>
      </div>
      {z.zoom.k !== 1 ? (
        <span className="pointer-events-none absolute bottom-3 right-14 rounded-full bg-card/90 px-2 py-0.5 text-xs tabular-nums text-muted-foreground shadow-sm">
          {Math.round(z.zoom.k * 100)}%
        </span>
      ) : null}
      {z.hint ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full bg-ink/80 px-3 py-1.5 text-xs text-on-ink shadow">
          Click the map, then scroll to zoom
        </div>
      ) : null}
    </>
  );
}

function ThreeD({ grid, areas, shared, title, className, today, matchProduct }) {
  const [cam, setCam] = useState(DEFAULT_CAMERA);
  const [showLabels, setShowLabels] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [hover, setHover] = useState(null); // { id, x, y }
  const [calm] = useState(lessMotion);
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);
  const frame = useRef(0);
  const camRef = useRef(cam);
  const trucks = useMemo(() => trucksOf(areas), [areas]);
  const routes = useMemo(() => routesFor(areas), [areas]);
  const focus = useMemo(() => planFocus(withOutside(areas, trucks), grid), [areas, trucks, grid]);
  const view = useMemo(() => camera(cam, grid, focus), [cam, grid, focus]);
  const fit = useMemo(() => view.fit(), [view]);
  const z = useMapZoom({ fit, svgRef });

  useEffect(() => { camRef.current = cam; }, [cam]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Turning by itself, slowly, until anything else touches the view.
  useEffect(() => {
    if (!spinning || calm) return undefined;
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      if (document.visibilityState === 'visible') setCam((c) => ({ ...c, yaw: (c.yaw - SPIN_DEG_PER_S * dt + 360) % 360 }));
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [spinning, calm]);

  // A smooth turn to a camera, the short way round.
  const animateTo = (target) => {
    cancelAnimationFrame(frame.current);
    setSpinning(false);
    if (calm) { setCam(target); return; }
    const from = camRef.current;
    const dYaw = ((target.yaw - from.yaw + 540) % 360) - 180;
    const dTilt = target.tilt - from.tilt;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / TURN_MS, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      setCam({ yaw: (from.yaw + dYaw * e + 360) % 360, tilt: from.tilt + dTilt * e });
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };
  const turn = (deg) => animateTo({ ...camRef.current, yaw: (camRef.current.yaw + deg + 360) % 360 });

  const items = useMemo(() => [
    ...trucks,
    ...areas.map((area) => ({ ...areaBox(area), area })),
    ...areas.flatMap((area) => palletBoxes(area, area.pallets?.length ?? 0).map((p, i) => ({
      ...p, palletOf: area, due: palletDue(area.pallets[i % area.pallets.length], today),
    }))),
  ], [areas, trucks, today]);
  const ordered = useMemo(() => drawOrder(items, view), [items, view]);
  const labelled = useMemo(
    () => ordered.filter((b) => b.area && (isOpenable(b.area) || b.area.kind === 'door')),
    [ordered],
  );

  const down = (e) => {
    cancelAnimationFrame(frame.current);
    setSpinning(false);
    moved.current = false;
    // A pinch or a Shift-drag is the zoom's; anything else turns the floor.
    if (z.onPointerDown(e)) { drag.current = null; setHover(null); return; }
    drag.current = { x: e.clientX, y: e.clientY, from: camRef.current, active: false };
  };
  const move = (e) => {
    if (z.onPointerMove(e)) return;
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active && Math.hypot(dx, dy) < DRAG_START_PX) return;
    if (!d.active) { d.active = true; e.currentTarget.setPointerCapture?.(e.pointerId); setHover(null); }
    moved.current = true;
    setCam({
      yaw: (d.from.yaw - dx * YAW_PER_PX + 360) % 360,
      tilt: clamp(d.from.tilt + dy * TILT_PER_PX, TILT_RANGE.min, TILT_RANGE.max),
    });
  };
  const up = (e) => {
    if (z.onPointerUp(e)) moved.current = true;
    drag.current = null;
  };
  // The click that ends a drag is not a choice: stopped before it
  // reaches the area under the pointer.
  const swallowDragClick = (e) => {
    if (!moved.current) return;
    moved.current = false;
    e.stopPropagation();
  };

  const keyDown = (e) => {
    if (e.target === e.currentTarget && z.onKeyDown(e)) { e.preventDefault(); return; }
    const step = {
      ArrowLeft: () => turn(15), ArrowRight: () => turn(-15),
      ArrowUp: () => animateTo({ ...camRef.current, tilt: clamp(camRef.current.tilt + 5, TILT_RANGE.min, TILT_RANGE.max) }),
      ArrowDown: () => animateTo({ ...camRef.current, tilt: clamp(camRef.current.tilt - 5, TILT_RANGE.min, TILT_RANGE.max) }),
    }[e.key];
    if (step && e.target === e.currentTarget) { e.preventDefault(); step(); }
  };

  // Over an area, or over one of its stacks (then the card names it).
  const hoverOn = (area) => (e, stack = null) => {
    if (drag.current?.active) return;
    e.stopPropagation?.();
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ id: area.id, x: e.clientX - box.left, y: e.clientY - box.top, stack });
  };
  const s3 = (area) => ({
    ...shared(area),
    hovered: hover?.id === area.id,
    onHover: hoverOn(area),
    matchProduct: matchProduct?.trim().toLowerCase() || '',
    onLeave: () => setHover((h) => (h?.id === area.id ? null : h)),
  });
  const hovered = hover ? areas.find((a) => a.id === hover.id) : null;

  return (
    <div ref={wrapRef} className="relative overflow-hidden rounded-lg bg-linear-to-b from-surface to-surface-2">
      <svg
        ref={svgRef}
        viewBox={z.viewBox}
        role="group"
        tabIndex={0}
        aria-label={`${title}, 3D view. Drag or use the arrow keys to turn it; plus and minus zoom.`}
        className={cn('h-auto w-full cursor-grab touch-none select-none outline-none active:cursor-grabbing', className)}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={keyDown}
        onClickCapture={swallowDragClick}
      >
        <polygon points={floorOutline(view, grid)} className="fill-surface-2 stroke-line-strong" strokeWidth={1.25} />
        <g className="pointer-events-none" aria-hidden="true">
          {floorGrid(view, grid, 2).map((l) => (
            <line key={`${l.x1.toFixed(1)},${l.y1.toFixed(1)}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="stroke-line" strokeWidth={0.5} />
          ))}
          {ordered.filter((b) => (b.area && b.z1 >= 0.3) || b.part === 'trailer' || b.part === 'bed').map((b) => (
            <polygon key={`shadow-${b.id ?? b.area.id}`} points={shadowPoints(b, view)} className="fill-black" fillOpacity={b.area && shared(b.area).dimmed ? 0.03 : 0.09} />
          ))}
          {routes.map((r) => {
            const a = view.project(r.from.x, r.from.y, 0.03);
            const b = view.project(r.to.x, r.to.y, 0.03);
            return (
              <g key={r.id}>
                <line x1={a.px} y1={a.py} x2={b.px} y2={b.py} className={cn('wm-flow', TONES[r.tone]?.stroke ?? 'stroke-info')} strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={b.px} cy={b.py} r={4} className={TONES[r.tone]?.solid ?? 'fill-info'} />
              </g>
            );
          })}
        </g>
        {ordered.map((box) => {
          if (box.truckOf) {
            const gate = box.truckOf;
            const sg = shared(gate);
            return (
              <g
                key={box.id}
                className={cn(sg.onSelect && 'cursor-pointer')}
                opacity={sg.dimmed ? 0.3 : 1}
                onClick={sg.onSelect ? () => sg.onSelect(gate) : undefined}
                onPointerEnter={(e) => s3(gate).onHover(e)}
                onPointerLeave={s3(gate).onLeave}
              >
                {box.centre && box.part === 'cab' ? <title>{`${box.centre}, here to collect`}</title> : null}
                <Box faces={boxFaces(box, view)} className={vehicleLook(box)} strokeWidth={box.part === 'wheel' ? 0.5 : 0.9} />
              </g>
            );
          }
          if (box.palletOf) {
            const look = palletLook(box.due);
            return (
              <g key={box.id} className={cn('pointer-events-none', box.due === 'today' && 'wm-breathe')} opacity={shared(box.palletOf).dimmed ? 0.25 : 1}>
                <Box faces={boxFaces(box, view)} className={cn(look.fill, look.stroke)} strokeWidth={0.75} />
              </g>
            );
          }
          return <Area3D key={box.area.id} box={box} view={view} s={s3(box.area)} />;
        })}
        {labelled.map((box) => <Label3D key={`label-${box.area.id}`} box={box} view={view} s={s3(box.area)} showText={showLabels} />)}
        {showLabels ? (() => {
          // The centres' names as a tidy column over the queue: one above
          // the other, 17 apart, each on a line down to its own bakkie,
          // so neighbouring names never sit on one another.
          const tags = trucks
            .filter((b) => b.centre && b.part === 'cab')
            .map((b) => ({ b, top: anchorAbove(b, view, 0).top }))
            .sort((p, q) => q.top.py - p.top.py);
          if (!tags.length) return null;
          const base = Math.min(...tags.map((t) => t.top.py)) - 22;
          const gate = tags[0].b.truckOf;
          const sg = { ...shared(gate), hovered: hover?.id === gate.id };
          const headY = base - tags.length * 17 - 6;
          const headX = tags[tags.length - 1].top.px;
          const head = `${clip(gate.name, 18)} · ${figureOf(gate)}`;
          const headW = head.length * 5.9 + (sg.badge ? 26 : 14);
          const heading = (
            <g key="tag-head" className="pointer-events-none" opacity={sg.dimmed ? 0.3 : 1}>
              <rect x={headX - headW / 2} y={headY - 9} width={headW} height={18} rx={9} className={cn('fill-surface', sg.selected || sg.hovered ? 'stroke-ink' : 'stroke-line-strong')} strokeWidth={1} />
              <text x={headX + (sg.badge ? 6 : 0)} y={headY + 3.5} textAnchor="middle" fontSize={FONT - 1} className="select-none fill-ink font-medium">{head}</text>
              {sg.badge ? <Badge x={headX - headW / 2 + 9} y={headY} badge={sg.badge} r={6.5} /> : null}
            </g>
          );
          return [heading, ...tags.map(({ b, top }, k) => {
            const y = base - k * 17;
            const name = clip(b.centre, 16);
            const width = name.length * 5.4 + 12;
            return (
              <g key={`tag-${b.id}`} className="pointer-events-none" opacity={shared(b.truckOf).dimmed ? 0.3 : 1}>
                <line x1={top.px} y1={top.py} x2={top.px} y2={y} className="stroke-ink-soft" strokeWidth={0.6} />
                <rect x={top.px - width / 2} y={y - 8} width={width} height={15} rx={7.5} className="fill-ink" fillOpacity={0.88} />
                <text x={top.px} y={y + 3} textAnchor="middle" fontSize={FONT - 2} className="select-none fill-on-ink font-medium">{name}</text>
              </g>
            );
          })];
        })() : null}
      </svg>

      {hovered ? <HoverCard area={hovered} at={hover} today={today} stack={hover.stack} /> : null}

      <div className="absolute bottom-2 left-2"><Compass bearing={northBearing(view)} /></div>
      <ZoomControls z={z} />

      <div className="absolute right-2 top-2 flex gap-1 rounded-4xl border bg-card/90 p-0.5 shadow-sm backdrop-blur" role="group" aria-label="Turn the view">
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Turn left" title="Turn left" onClick={() => turn(90)}><RotateCcw /></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Turn right" title="Turn right" onClick={() => turn(-90)}><RotateCw /></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Reset the view" title="Reset the view" onClick={() => { animateTo(DEFAULT_CAMERA); z.fitPlan(); }}><Undo2 /></Button>
        {calm ? null : (
          <Button
            type="button" size="icon-sm" variant={spinning ? 'secondary' : 'ghost'} aria-pressed={spinning}
            aria-label={spinning ? 'Stop turning' : 'Turn slowly'} title={spinning ? 'Stop turning' : 'Turn slowly'}
            onClick={() => { cancelAnimationFrame(frame.current); setSpinning((v) => !v); }}
          >
            {spinning ? <Pause /> : <Play />}
          </Button>
        )}
        <Button
          type="button" size="icon-sm" variant={showLabels ? 'secondary' : 'ghost'} aria-pressed={showLabels}
          aria-label="Show labels" title="Show labels" onClick={() => setShowLabels((v) => !v)}
        >
          <Tags />
        </Button>
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
  today = null,
  matchProduct = '',
}) {
  const ctx = { today, now: new Date() };
  const labelOf = (area) => {
    const badge = badgeFor(area, ctx);
    return [area.name, kindById(area.kind).label, noteOf?.(area), badge?.text].filter(Boolean).join(', ');
  };
  const shared = (area) => ({
    area,
    tone: toneOf(area),
    selected: area.id === selectedId,
    dimmed: highlighted ? !highlighted.has(area.id) : false,
    onSelect: isOpenable(area) ? onSelect : undefined,
    label: labelOf(area),
    badge: badgeFor(area, ctx),
  });

  if (view === '3d') {
    return <ThreeD grid={grid} areas={areas} shared={shared} title={title} className={className} today={today} matchProduct={matchProduct} />;
  }

  return <TopView grid={grid} areas={areas} shared={shared} noteOf={noteOf} title={title} className={className} today={today} matchProduct={matchProduct} />;
}

// The plan from above, fitted to what is drawn with a square of room round it.
function TopView({ grid, areas, shared, noteOf, title, className, today, matchProduct }) {
  const svgRef = useRef(null);
  const width = grid.cols * CELL;
  const height = grid.rows * CELL;
  const trucks = useMemo(() => trucksOf(areas).filter((b) => b.part !== 'wheel'), [areas]);
  // A centre's name by its bakkie, from above.
  const tags = trucks.filter((b) => b.centre && b.part === 'cab');
  const routes = useMemo(() => routesFor(areas), [areas]);
  const fit = useMemo(() => {
    if (!areas.length) return { x: 0, y: 0, w: width, h: height };
    // Trucks stand outside the plan, so the view reaches a little past it.
    const all = withOutside(areas, trucks);
    const x0 = Math.max(Math.min(...all.map((a) => a.x)) - 1, -6) * CELL;
    const y0 = Math.max(Math.min(...all.map((a) => a.y)) - 1, -6) * CELL;
    const x1 = Math.min(Math.max(...all.map((a) => a.x + a.w)) + 1, grid.cols + 6) * CELL;
    const y1 = Math.min(Math.max(...all.map((a) => a.y + a.h)) + 1, grid.rows + 6) * CELL;
    // Kept to the map's own shape, so a thin plan is not stretched.
    const w = Math.max(x1 - x0, (y1 - y0) * (width / height));
    const h = Math.max(y1 - y0, w * (height / width));
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
  }, [areas, trucks, grid, width, height]);
  const z = useMapZoom({ fit, svgRef, dragPans: true });
  const panned = useRef(false);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={z.viewBox}
        role="group"
        tabIndex={0}
        aria-label={`${title}, top view. Drag to move round it; plus and minus zoom.`}
        className={cn('h-auto w-full touch-none outline-none', className)}
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={(e) => { panned.current = false; z.onPointerDown(e); }}
        onPointerMove={z.onPointerMove}
        onPointerUp={(e) => { if (z.onPointerUp(e)) panned.current = true; }}
        onPointerCancel={z.onPointerUp}
        onKeyDown={(e) => { if (e.target === e.currentTarget && z.onKeyDown(e)) e.preventDefault(); }}
        onClickCapture={(e) => { if (panned.current) { panned.current = false; e.stopPropagation(); } }}
      >
      <defs>
        <pattern id="wm-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" className="stroke-line" strokeWidth={0.75} />
        </pattern>
      </defs>
      <rect width={width} height={height} className="fill-surface-2" />
      <rect width={width} height={height} fill="url(#wm-grid)" />
      {routes.map((r) => (
        <line
          key={r.id} x1={r.from.x * CELL} y1={r.from.y * CELL} x2={r.to.x * CELL} y2={r.to.y * CELL}
          className={cn('wm-flow pointer-events-none', TONES[r.tone]?.stroke ?? 'stroke-info')} strokeWidth={3} strokeLinecap="round"
        />
      ))}
      {areas.map((area) => <TopArea key={area.id} {...shared(area)} note={noteOf?.(area)} today={today} matchProduct={matchProduct} />)}
      {tags.map((b) => (
        <text
          key={`tag-${b.id}`} x={(b.x + b.w / 2) * CELL} y={(b.y + b.h) * CELL + 10} textAnchor="middle" fontSize={8}
          className="pointer-events-none select-none fill-ink stroke-surface font-medium" strokeWidth={2.5} paintOrder="stroke"
        >
          {clip(b.centre, 14)}
        </text>
      ))}
      {trucks.map((b) => {
        const gate = b.truckOf;
        const sg = shared(gate);
        return (
          <rect
            key={b.id} x={b.x * CELL} y={b.y * CELL} width={b.w * CELL} height={b.h * CELL} rx={b.part === 'cab' ? 5 : 3}
            className={cn(vehicleLook(b), sg.onSelect && 'cursor-pointer')} strokeWidth={1}
            onClick={sg.onSelect ? () => sg.onSelect(gate) : undefined}
          >
            <title>{b.centre ? `${b.centre}, here to collect` : `${gate.name}: ${figureOf(gate)}`}</title>
          </rect>
        );
      })}
      </svg>
      <ZoomControls z={z} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/WarehouseMap.jsx
//
// The floor plan, drawn: every area a shape coloured by the tone it is
// given, in the top view or the 3D view (mapGeometry.js has the
// arithmetic for both). Hand-drawn SVG, like the process map on
// Operations reports.
//
//   areas       [{ id, name, kind, x, y, w, h, levels, ... }]
//   view        'top' | '3d'
//   toneOf      (area) => a tone name from mapOverlays.js TONES
//   noteOf      (area) => a short second line ("3 products"), optional
//   selectedId  the area to outline
//   highlighted a Set of area ids a search matched; the rest dim. null
//               when nothing is being searched for.
//   onSelect    (area) => void; makes each area that holds stock a
//               button (a door is only drawn). Leave it off for a
//               picture only.
//
// An area is a button, so the keyboard reaches it: Tab to it, Enter or
// Space to open it.
// ─────────────────────────────────────────────────────────────
import { CELL, DEFAULT_GRID, boxFaces, drawOrder, floorOutline, holdsStock, isoViewBox, kindById } from './mapGeometry';
import { TONES } from './mapOverlays';
import { cn } from '@/lib/utils';

const FONT = 11;

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
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(area); }
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
  return (
    <g {...pressable(area, onSelect)} aria-label={label} opacity={dimmed ? 0.3 : 1}>
      <rect
        x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={4}
        className={cn(t.fill, t.stroke)}
        strokeWidth={selected ? 3 : 1.25}
        strokeDasharray={t.dashed ? '4 3' : undefined}
      />
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

function IsoArea({ area, tone, selected, dimmed, onSelect, label }) {
  const t = TONES[tone] ?? TONES.neutral;
  const faces = boxFaces(area);
  const name = shorten(area.name, Math.min(area.w, area.h) * 22 * 1.4);
  const stroke = { className: cn(t.fill, t.stroke), strokeWidth: selected ? 2.5 : 1, strokeLinejoin: 'round' };
  return (
    <g {...pressable(area, onSelect)} aria-label={label} opacity={dimmed ? 0.3 : 1}>
      <polygon points={faces.top} {...stroke} strokeDasharray={t.dashed ? '4 3' : undefined} />
      <polygon points={faces.left} {...stroke} />
      <polygon points={faces.left} className="pointer-events-none fill-black" fillOpacity={0.1} />
      <polygon points={faces.right} {...stroke} />
      <polygon points={faces.right} className="pointer-events-none fill-black" fillOpacity={0.2} />
      {name && area.kind !== 'door' ? (
        <text
          x={faces.label.px} y={faces.label.py + 4} textAnchor="middle"
          className="pointer-events-none select-none fill-ink font-medium" fontSize={FONT - 1}
        >
          {name}
        </text>
      ) : null}
    </g>
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
    onSelect: holdsStock(area) ? onSelect : undefined,
    label: labelOf(area),
  });

  if (view === '3d') {
    return (
      <svg viewBox={isoViewBox(grid)} role="group" aria-label={`${title}, 3D view`} className={cn('h-auto w-full', className)}>
        <polygon points={floorOutline(grid)} className="fill-surface-2 stroke-line" strokeWidth={1} />
        {drawOrder(areas).map((area) => <IsoArea key={area.id} {...shared(area)} />)}
      </svg>
    );
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

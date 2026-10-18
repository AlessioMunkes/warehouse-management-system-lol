// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/mapGeometry.js
//
// Where things go on the warehouse map, with no React in it: the grid,
// the kinds of area, and the arithmetic for both views.
//
//   Top view  the grid as it is, one square CELL units wide.
//   3D view   the same plan drawn isometric: each area a box, as tall
//             as its levels. Plain SVG polygons, no 3D library, so the
//             view costs nothing to download and nothing to install on
//             a floor tablet.
//
// The grid size and the kinds mirror server/src/constants/warehouseMap.js.
// ─────────────────────────────────────────────────────────────

export const DEFAULT_GRID = Object.freeze({ cols: 40, rows: 24 });
export const MAX_LEVELS = 4;
export const CELL = 24;

export const KINDS = [
  { id: 'dry',   label: 'Dry store', size: { w: 6, h: 2 }, levels: 2, holdsStock: true },
  { id: 'cold',  label: 'Cold room', size: { w: 6, h: 5 }, levels: 2, holdsStock: true },
  { id: 'floor', label: 'Floor',     size: { w: 4, h: 4 }, levels: 1, holdsStock: true },
  { id: 'door',  label: 'Door',      size: { w: 3, h: 1 }, levels: 1, holdsStock: false },
];

export const kindById = (id) => KINDS.find((k) => k.id === id) ?? KINDS[0];
export const holdsStock = (area) => kindById(area.kind).holdsStock;

// ── Plan arithmetic ───────────────────────────────────────────
export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Ids of every area that overlaps another. */
export const overlapping = (areas) => {
  const ids = new Set();
  for (let i = 0; i < areas.length; i += 1) {
    for (let j = i + 1; j < areas.length; j += 1) {
      if (overlaps(areas[i], areas[j])) { ids.add(areas[i].id); ids.add(areas[j].id); }
    }
  }
  return ids;
};

export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/** Keeps an area on the grid, moving it rather than shrinking it. */
export const keepOnGrid = (area, grid = DEFAULT_GRID) => {
  const w = clamp(area.w, 1, grid.cols);
  const h = clamp(area.h, 1, grid.rows);
  return { ...area, w, h, x: clamp(area.x, 0, grid.cols - w), y: clamp(area.y, 0, grid.rows - h) };
};

/** The first top-left square where a w by h area fits, or the corner. */
export const freeSpot = (areas, { w, h }, grid = DEFAULT_GRID) => {
  for (let y = 0; y + h <= grid.rows; y += 1) {
    for (let x = 0; x + w <= grid.cols; x += 1) {
      const candidate = { x, y, w, h };
      if (!areas.some((a) => overlaps(a, candidate))) return { x, y };
    }
  }
  return { x: 0, y: 0 };
};

/** The next "Dry store 3" for a kind, not used by any area yet. */
export const nextName = (areas, kind) => {
  const base = kindById(kind).label;
  const used = new Set(areas.map((a) => a.name.trim().toLowerCase()));
  for (let n = 1; ; n += 1) {
    const name = `${base} ${n}`;
    if (!used.has(name.toLowerCase())) return name;
  }
};

// ── 3D view ───────────────────────────────────────────────────
// Isometric: x runs down to the right, y down to the left, height
// straight up. ISO is one grid square's length on screen.
const ISO = 22;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const LEVEL = 0.9; // one level, in squares

export const project = (x, y, z = 0) => ({
  px: (x - y) * COS * ISO,
  py: (x + y) * SIN * ISO - z * ISO,
});

/** How tall an area is drawn, in squares. A floor area is a low pallet. */
export const heightOf = (area) => {
  if (area.kind === 'door') return 0.06;
  if (area.kind === 'floor') return 0.35;
  return clamp(Number(area.levels) || 1, 1, MAX_LEVELS) * LEVEL;
};

const points = (corners) => corners.map(([x, y, z]) => {
  const { px, py } = project(x, y, z);
  return `${px.toFixed(1)},${py.toFixed(1)}`;
}).join(' ');

/** The three faces of an area's box the viewer can see. */
export const boxFaces = (area) => {
  const { x, y, w, h } = area;
  const z = heightOf(area);
  return {
    top:   points([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]]),
    left:  points([[x, y + h, 0], [x + w, y + h, 0], [x + w, y + h, z], [x, y + h, z]]),
    right: points([[x + w, y, 0], [x + w, y + h, 0], [x + w, y + h, z], [x + w, y, z]]),
    label: project(x + w / 2, y + h / 2, z),
  };
};

export const floorOutline = (grid = DEFAULT_GRID) =>
  points([[0, 0, 0], [grid.cols, 0, 0], [grid.cols, grid.rows, 0], [0, grid.rows, 0]]);

/** The 3D view's viewBox: the floor and the tallest possible box. */
export const isoViewBox = (grid = DEFAULT_GRID, pad = 12) => {
  const left = project(0, grid.rows).px;
  const right = project(grid.cols, 0).px;
  const top = project(0, 0, MAX_LEVELS * LEVEL).py;
  const bottom = project(grid.cols, grid.rows).py;
  return `${(left - pad).toFixed(1)} ${(top - pad).toFixed(1)} ${(right - left + 2 * pad).toFixed(1)} ${(bottom - top + 2 * pad).toFixed(1)}`;
};

// A box hides the boxes behind it, so the far ones are drawn first. On a
// grid with no overlaps, A is behind B when it ends before B starts
// along x or along y (and B does not also end before A along the other).
const behind = (a, b) =>
  (a.x + a.w <= b.x && !(b.y + b.h <= a.y)) || (a.y + a.h <= b.y && !(b.x + b.w <= a.x));

/** Areas in the order the 3D view draws them: far first. */
export const drawOrder = (areas) => {
  const remaining = [...areas].sort((a, b) => (a.x + a.w / 2 + a.y + a.h / 2) - (b.x + b.w / 2 + b.y + b.h / 2));
  const ordered = [];
  while (remaining.length > 0) {
    // The first area nothing left is behind; on a tangle (which a grid
    // without overlaps cannot make), the nearest-first guess.
    const i = remaining.findIndex((a) => !remaining.some((b) => b !== a && behind(b, a)));
    ordered.push(...remaining.splice(i === -1 ? 0 : i, 1));
  }
  return ordered;
};

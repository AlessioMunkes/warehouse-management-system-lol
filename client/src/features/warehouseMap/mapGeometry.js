// ─────────────────────────────────────────────────────────────
// client/src/features/warehouseMap/mapGeometry.js
//
// Where things go on the warehouse map, with no React in it: the grid,
// the kinds of area, and the arithmetic for both views.
//
//   Top view  the grid as it is, one square CELL units wide.
//   3D view   the same plan seen from a camera that turns round the
//             middle of the floor (yaw) and looks down at an angle
//             (tilt). Each area is a box as tall as its levels, and each
//             packed pallet a small box in its staging area. Plain SVG
//             polygons, no 3D library, so the view costs nothing to
//             download and nothing to install on a floor tablet.
//
// The grid size and the kinds mirror server/src/constants/warehouseMap.js.
// ─────────────────────────────────────────────────────────────

export const DEFAULT_GRID = Object.freeze({ cols: 40, rows: 24 });
export const MAX_LEVELS = 4;
export const CELL = 24;

export const KINDS = [
  { id: 'dry',     label: 'Dry store',      size: { w: 6, h: 2 }, levels: 2, holdsStock: true },
  { id: 'cold',    label: 'Cold room',      size: { w: 6, h: 5 }, levels: 2, holdsStock: true },
  { id: 'floor',   label: 'Floor',          size: { w: 4, h: 4 }, levels: 1, holdsStock: true },
  { id: 'staging', label: 'Pallet staging', size: { w: 5, h: 3 }, levels: 1, holdsStock: false },
  { id: 'door',    label: 'Door',           size: { w: 3, h: 1 }, levels: 1, holdsStock: false },
];

export const kindById = (id) => KINDS.find((k) => k.id === id) ?? KINDS[0];
/** Stock is counted into it: a dry store, cold room or floor area. */
export const holdsStock = (area) => kindById(area.kind).holdsStock;
export const isStaging = (area) => area.kind === 'staging';
/** Opens a panel when chosen: everything but a door. */
export const isOpenable = (area) => area.kind !== 'door';

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

// ── Pallets in a staging area ─────────────────────────────────
// One pallet a square, filling the area row by row, then stacked a
// second high. Beyond that they are not drawn (the panel lists them).
const PALLET_HEIGHT = 0.55;
const PALLET_INSET = 0.12;
const MAX_STACK = 2;

/** Boxes for the pallets standing in a staging area. */
export const palletBoxes = (area, count) => {
  const perLayer = area.w * area.h;
  const shown = Math.min(count, perLayer * MAX_STACK);
  return Array.from({ length: shown }, (_, i) => {
    const layer = Math.floor(i / perLayer);
    const spot = i % perLayer;
    return {
      id: `${area.id}-pallet-${i}`,
      x: area.x + (spot % area.w) + PALLET_INSET,
      y: area.y + Math.floor(spot / area.w) + PALLET_INSET,
      w: 1 - 2 * PALLET_INSET,
      h: 1 - 2 * PALLET_INSET,
      z0: 0.06 + layer * PALLET_HEIGHT,
      z1: 0.06 + (layer + 1) * PALLET_HEIGHT - 0.04,
    };
  });
};

// ── 3D view ───────────────────────────────────────────────────
// The camera: yaw turns the floor round its middle (45 is the classic
// isometric corner view), tilt is how far it looks down (90 would be
// straight down). Angles in degrees.
export const DEFAULT_CAMERA = Object.freeze({ yaw: 45, tilt: 35 });
export const TILT_RANGE = Object.freeze({ min: 15, max: 75 });
const SCALE = 22;
const LEVEL = 0.9; // one shelf level, in squares
const rad = (deg) => (deg * Math.PI) / 180;

/** How tall an area's box is, in squares. Floors, doors and staging lie flat. */
export const heightOf = (area) => {
  if (area.kind === 'door' || area.kind === 'staging') return 0.06;
  if (area.kind === 'floor') return 0.35;
  return clamp(Number(area.levels) || 1, 1, MAX_LEVELS) * LEVEL;
};

/**
 * Where the 3D view looks: the middle of the drawn areas and how far out
 * they reach, so the plan fills the view and turns round its own middle
 * rather than the middle of the whole grid. The whole grid when nothing
 * is drawn. { cx, cy, r } in squares.
 */
export const planFocus = (areas, grid = DEFAULT_GRID) => {
  if (!areas?.length) return { cx: grid.cols / 2, cy: grid.rows / 2, r: Math.hypot(grid.cols, grid.rows) / 2 };
  const x0 = Math.min(...areas.map((a) => a.x));
  const y0 = Math.min(...areas.map((a) => a.y));
  const x1 = Math.max(...areas.map((a) => a.x + a.w));
  const y1 = Math.max(...areas.map((a) => a.y + a.h));
  // A little room round the edge, and never so tight one box fills it.
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(Math.hypot(x1 - x0, y1 - y0) / 2 + 1.5, 5) };
};

/** A projector for one camera and grid: plan + height to screen, and depth. */
export const camera = (cam = DEFAULT_CAMERA, grid = DEFAULT_GRID, focus = null) => {
  const yaw = rad(cam.yaw);
  const tilt = rad(clamp(cam.tilt, TILT_RANGE.min, TILT_RANGE.max));
  const [cos, sin, down, up] = [Math.cos(yaw), Math.sin(yaw), Math.sin(tilt), Math.cos(tilt)];
  const cx = focus?.cx ?? grid.cols / 2;
  const cy = focus?.cy ?? grid.rows / 2;
  const reach = focus?.r ?? Math.hypot(grid.cols, grid.rows) / 2;
  const turn = (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return { X: dx * cos - dy * sin, Y: dx * sin + dy * cos };
  };
  return {
    // Depth grows towards the viewer, along this direction in the plan.
    toward: { x: sin, y: cos },
    turnNormal: (nx, ny) => ({ X: nx * cos - ny * sin, Y: nx * sin + ny * cos }),
    depth: (x, y) => turn(x, y).Y,
    project: (x, y, z = 0) => {
      const { X, Y } = turn(x, y);
      return { px: X * SCALE, py: (Y * down - z * up) * SCALE };
    },
    // The view that fits the focus whichever way it is turned, with room
    // above the tallest box for its label. { x, y, w, h } in screen units.
    fit: (pad = 12) => {
      const top = -reach * down - (MAX_LEVELS * LEVEL + 2.5) * up;
      return {
        x: -reach * SCALE - pad,
        y: top * SCALE - pad,
        w: 2 * reach * SCALE + 2 * pad,
        h: (reach * down - top) * SCALE + 2 * pad,
      };
    },
    viewBox(pad = 12) {
      const b = this.fit(pad);
      return `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}`;
    },
  };
};

const pointsOf = (cam, corners) => corners.map(([x, y, z]) => {
  const { px, py } = cam.project(x, y, z);
  return `${px.toFixed(1)},${py.toFixed(1)}`;
}).join(' ');

// The four walls of a box, each with the way it faces in the plan.
const WALLS = [
  { normal: [0, -1], edge: (b) => [[b.x, b.y], [b.x + b.w, b.y]] },
  { normal: [1, 0],  edge: (b) => [[b.x + b.w, b.y], [b.x + b.w, b.y + b.h]] },
  { normal: [0, 1],  edge: (b) => [[b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] },
  { normal: [-1, 0], edge: (b) => [[b.x, b.y + b.h], [b.x, b.y]] },
];

/**
 * The faces of a box the camera sees: its top, and the walls facing it,
 * each with a shade (how much darker it is drawn, lit from the left).
 * A box is { x, y, w, h, z0, z1 }.
 */
export const boxFaces = (box, cam) => {
  const { x, y, w, h, z0 = 0, z1 } = box;
  const walls = WALLS
    .map((wall) => ({ wall, n: cam.turnNormal(...wall.normal) }))
    .filter(({ n }) => n.Y > 0.001)
    .map(({ wall, n }) => {
      const [[ax, ay], [bx, by]] = wall.edge(box);
      return {
        points: pointsOf(cam, [[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]]),
        shade: 0.08 + 0.16 * ((1 + n.X) / 2),
      };
    });
  return {
    top: pointsOf(cam, [[x, y, z1], [x + w, y, z1], [x + w, y + h, z1], [x, y + h, z1]]),
    walls,
    label: cam.project(x + w / 2, y + h / 2, z1),
  };
};

/** An area as a box. */
export const areaBox = (area) => ({ x: area.x, y: area.y, w: area.w, h: area.h, z0: 0, z1: heightOf(area) });

export const floorOutline = (cam, grid = DEFAULT_GRID) =>
  pointsOf(cam, [[0, 0, 0], [grid.cols, 0, 0], [grid.cols, grid.rows, 0], [0, grid.rows, 0]]);

// A box hides the boxes behind it, so the far ones are drawn first. Two
// boxes that do not overlap on the plan are apart along x or along y;
// the one on the far side of that gap, as the camera looks, is behind.
const side = (a, b, key, size) => {
  if (a[key] + a[size] <= b[key]) return 1;  // a before b along the axis
  if (b[key] + b[size] <= a[key]) return -1; // a after b
  return 0;
};

export const isBehind = (a, b, toward) => {
  const sx = side(a, b, 'x', 'w');
  const sy = side(a, b, 'y', 'h');
  const aBack = (sx * toward.x > 1e-9) || (sy * toward.y > 1e-9);
  const bBack = (sx * toward.x < -1e-9) || (sy * toward.y < -1e-9);
  return aBack && !bBack;
};

/**
 * Boxes in the order the 3D view draws them: far first. A box that lies
 * flat (a floor marking, a staging area) is drawn before anything that
 * stands, so the pallets standing on it are never hidden under it.
 */
export const drawOrder = (boxes, cam) => {
  const flat = (b) => (b.z1 ?? 0) - (b.z0 ?? 0) < 0.1 && (b.z0 ?? 0) === 0;
  const byDepth = (a, b) => cam.depth(a.x + a.w / 2, a.y + a.h / 2) - cam.depth(b.x + b.w / 2, b.y + b.h / 2) || (a.z0 ?? 0) - (b.z0 ?? 0);
  const lying = boxes.filter(flat).sort(byDepth);
  const remaining = boxes.filter((b) => !flat(b)).sort(byDepth);
  const ordered = [];
  while (remaining.length > 0) {
    // The first box nothing left is behind; on a tangle, the farthest.
    const i = remaining.findIndex((a) => !remaining.some((b) => b !== a && isBehind(b, a, cam.toward)));
    ordered.push(...remaining.splice(i === -1 ? 0 : i, 1));
  }
  return [...lying, ...ordered];
};

// ── 3D view: the extras ───────────────────────────────────────
export const LEVEL_HEIGHT = LEVEL;

/**
 * Lines across the walls the camera sees, at each height in `zs`: the
 * shelves of a dry store or cold room. [{ x1, y1, x2, y2 }]
 */
export const shelfLines = (box, cam, zs) => WALLS
  .filter((wall) => cam.turnNormal(...wall.normal).Y > 0.001)
  .flatMap((wall) => {
    const [[ax, ay], [bx, by]] = wall.edge(box);
    return zs.map((z) => {
      const a = cam.project(ax, ay, z);
      const b = cam.project(bx, by, z);
      return { x1: a.px, y1: a.py, x2: b.px, y2: b.py };
    });
  });

const hull = (pts) => {
  const p = [...pts].sort((a, b) => a.px - b.px || a.py - b.py);
  const cross = (o, a, b) => (a.px - o.px) * (b.py - o.py) - (a.py - o.py) * (b.px - o.px);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

// The light stands to one side of the plan, so a shadow falls the same
// way on the floor whichever way the view is turned, longer for a
// taller box.
const SHADOW = { x: 0.45, y: 0.3 };

/** The shadow a box casts on the floor, as polygon points. */
export const shadowPoints = (box, cam) => {
  const h = box.z1 ?? 0;
  if (h < 0.1) return '';
  const { x, y, w } = box;
  const d = box.h;
  const sx = SHADOW.x * h;
  const sy = SHADOW.y * h;
  const corners = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
  const pts = [...corners, ...corners.map(([cx, cy]) => [cx + sx, cy + sy])].map(([px, py]) => cam.project(px, py, 0));
  return hull(pts).map((q) => `${q.px.toFixed(1)},${q.py.toFixed(1)}`).join(' ');
};

/** Grid lines across the floor, every `step` squares. [{ x1, y1, x2, y2 }] */
export const floorGrid = (cam, grid = DEFAULT_GRID, step = 2) => {
  const lines = [];
  for (let x = step; x < grid.cols; x += step) {
    const a = cam.project(x, 0, 0); const b = cam.project(x, grid.rows, 0);
    lines.push({ x1: a.px, y1: a.py, x2: b.px, y2: b.py });
  }
  for (let y = step; y < grid.rows; y += step) {
    const a = cam.project(0, y, 0); const b = cam.project(grid.cols, y, 0);
    lines.push({ x1: a.px, y1: a.py, x2: b.px, y2: b.py });
  }
  return lines;
};

/** The point `dz` squares above the middle of a box's top: where its label floats. */
export const anchorAbove = (box, cam, dz = 0.8) => ({
  top: cam.project(box.x + box.w / 2, box.y + box.h / 2, box.z1),
  float: cam.project(box.x + box.w / 2, box.y + box.h / 2, box.z1 + dz),
});

/** Which way north (the top of the plan) points on screen, in degrees clockwise from up. */
export const northBearing = (cam) => {
  const a = cam.project(0, 1, 0);
  const b = cam.project(0, 0, 0);
  return (Math.atan2(b.px - a.px, -(b.py - a.py)) * 180) / Math.PI;
};

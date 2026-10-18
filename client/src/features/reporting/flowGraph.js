// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/flowGraph.js
//
// The arithmetic behind the flow map (ProcessFlow.jsx). The server
// sends each case as the steps it took (server/src/features/reporting/
// processFlow.js); everything the map shows is worked out here from
// those, so narrowing the cases redraws it at once with no request.
//
//   variantsOf   the routes: cases grouped by identical path
//   applyFilters keep cases that pass through / avoid a step or a
//                connection
//   graphOf      steps and connections with how many and how long
//   layoutOf     where each step sits, and the curve of each connection
//   rootCauses   which kinds of case (a supplier, a cohort, a weekday)
//                are over-represented among the ones that went wrong
//
// A step is an index into process.activities. The two ends of the map
// are the ids 'start' and 'end'.
// ─────────────────────────────────────────────────────────────

export const START = 'start';
export const END = 'end';

const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const average = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const summarise = (hours) => ({
  measured: hours.length,
  medianHours: quantile(hours, 0.5),
  averageHours: average(hours),
  p90Hours: quantile(hours, 0.9),
});

/** How long a case took from its first timed step to its last. */
export const caseHours = (c) => {
  const timed = c.t.filter((x) => x !== null);
  return timed.length > 1 ? timed[timed.length - 1] - timed[0] : null;
};

const sameRoute = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Routes, commonest first: [{ key, path, cases, share, medianHours, expected, repeats }] */
export const variantsOf = (process, cases = process.cases) => {
  const groups = new Map();
  for (const c of cases) {
    const key = c.path.join('>');
    if (!groups.has(key)) groups.set(key, { key, path: c.path, cases: [] });
    groups.get(key).cases.push(c);
  }
  const total = cases.length || 1;
  return [...groups.values()]
    .map((v) => ({
      ...v,
      share: Math.round((v.cases.length / total) * 1000) / 10,
      medianHours: quantile(v.cases.map(caseHours).filter((h) => h !== null), 0.5),
      expected: sameRoute(v.path, process.expected),
      repeats: new Set(v.path).size < v.path.length,
    }))
    .sort((a, b) => b.cases.length - a.cases.length || a.key.localeCompare(b.key));
};

const hasEdge = (path, from, to) => {
  if (from === START) return path[0] === to;
  if (to === END) return path[path.length - 1] === from;
  for (let i = 0; i < path.length - 1; i += 1) if (path[i] === from && path[i + 1] === to) return true;
  return false;
};

/**
 * filters: [{ kind: 'through' | 'avoid', step }  |  { kind: 'with' | 'without', from, to }
 *            |  { kind: 'attr', key, value }]
 * Every filter must hold.
 */
export const applyFilters = (cases, filters = []) => cases.filter((c) => filters.every((f) => {
  if (f.kind === 'through') return c.path.includes(f.step);
  if (f.kind === 'avoid') return !c.path.includes(f.step);
  if (f.kind === 'with') return hasEdge(c.path, f.from, f.to);
  if (f.kind === 'without') return !hasEdge(c.path, f.from, f.to);
  if (f.kind === 'attr') return c.attrs?.[f.key] === f.value;
  return true;
}));

export const filterLabel = (process, f) => {
  const name = (id) => (id === START ? 'Start' : id === END ? 'End' : process.activities[id]?.label ?? 'Activity');
  if (f.kind === 'attr') return `${f.key}: ${f.value}`;
  if (f.kind === 'through') return `Through: ${name(f.step)}`;
  if (f.kind === 'avoid') return `Bypasses: ${name(f.step)}`;
  if (f.kind === 'with') return `Transition: ${name(f.from)} to ${name(f.to)}`;
  return `No transition: ${name(f.from)} to ${name(f.to)}`;
};

const edgeKey = (from, to) => `${from}>${to}`;

/**
 * Steps and connections for a set of cases.
 * nodes: [{ id, label, cases, count, repeated, position, expected }]
 * edges: [{ key, from, to, count, cases, hours, medianHours, expected, back }]
 */
export const graphOf = (process, cases) => {
  const nodes = new Map();
  const edges = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, label: process.activities[id].label, cases: 0, count: 0, repeated: 0, positions: 0 });
    return nodes.get(id);
  };
  const edge = (from, to) => {
    const key = edgeKey(from, to);
    if (!edges.has(key)) edges.set(key, { key, from, to, count: 0, caseList: [], hours: [] });
    return edges.get(key);
  };

  for (const c of cases) {
    const seen = new Map();
    c.path.forEach((id, i) => {
      const n = node(id);
      n.count += 1;
      n.positions += i;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    });
    for (const [id, times] of seen) {
      nodes.get(id).cases += 1;
      if (times > 1) nodes.get(id).repeated += 1;
    }
    const touched = new Set();
    const touch = (e, hours) => {
      e.count += 1;
      if (hours !== null && hours >= 0) e.hours.push({ hours, c });
      if (!touched.has(e.key)) { touched.add(e.key); e.caseList.push(c); }
    };
    if (c.path.length) {
      touch(edge(START, c.path[0]), null);
      touch(edge(c.path[c.path.length - 1], END), null);
    }
    for (let i = 0; i < c.path.length - 1; i += 1) {
      const a = c.t[i];
      const b = c.t[i + 1];
      touch(edge(c.path[i], c.path[i + 1]), a === null || b === null ? null : b - a);
    }
  }

  const expectedSteps = new Set(process.expected);
  const expectedEdges = new Set(process.expected.slice(0, -1).map((id, i) => edgeKey(id, process.expected[i + 1])));
  expectedEdges.add(edgeKey(START, process.expected[0]));
  expectedEdges.add(edgeKey(process.expected[process.expected.length - 1], END));

  const nodeList = [...nodes.values()].map((n) => ({
    id: n.id, label: n.label, cases: n.cases, count: n.count, repeated: n.repeated,
    position: n.positions / n.count, expected: expectedSteps.has(n.id),
  }));
  const position = new Map(nodeList.map((n) => [n.id, n.position]));
  const edgeList = [...edges.values()].map((e) => ({
    key: e.key, from: e.from, to: e.to, count: e.count, cases: e.caseList.length, caseList: e.caseList,
    timed: e.hours,
    ...summarise(e.hours.map((h) => h.hours)),
    expected: expectedEdges.has(e.key),
    // Going back up the process: a step repeated, work done again.
    back: e.from !== START && e.to !== END && position.get(e.to) < position.get(e.from),
  }));
  return { nodes: nodeList, edges: edgeList, cases: cases.length };
};

/** What a step leads to, or follows: [{ id, label, count, share }] commonest first. */
export const neighbours = (graph, process, id, direction) => {
  const list = graph.edges.filter((e) => (direction === 'next' ? e.from === id : e.to === id));
  const total = list.reduce((s, e) => s + e.count, 0) || 1;
  return list
    .map((e) => {
      const other = direction === 'next' ? e.to : e.from;
      const label = other === START ? 'Process start' : other === END ? 'Process end' : process.activities[other].label;
      return { id: other, label, count: e.count, share: Math.round((e.count / total) * 100) };
    })
    .sort((a, b) => b.count - a.count);
};

// ── Layout ──────────────────────────────────────────────────
// One step per row, in the order cases reach it. The commonest route
// runs down a centre column; steps off it sit in a column to the
// right. Connections that skip rows bow out to the left and ones that
// go back up bow to the right, so neither runs through a step.
export const NODE_W = 210;
export const NODE_H = 44;
const ROW = 86;
const TOP = 34;
const SPINE_X = 280;
const SIDE_X = 556;
export const MAP_W = 760;

export const layoutOf = (graph, spinePath = []) => {
  const spine = new Set(spinePath);
  const ordered = [...graph.nodes].sort((a, b) => a.position - b.position || Number(spine.has(b.id)) - Number(spine.has(a.id)) || a.id - b.id);
  const at = new Map();
  at.set(START, { x: SPINE_X, y: TOP, row: 0, column: 0 });
  ordered.forEach((n, i) => {
    const column = spine.has(n.id) || spine.size === 0 ? 0 : 1;
    at.set(n.id, { x: column ? SIDE_X : SPINE_X, y: TOP + (i + 1) * ROW, row: i + 1, column });
  });
  at.set(END, { x: SPINE_X, y: TOP + (ordered.length + 1) * ROW, row: ordered.length + 1, column: 0 });
  return { at, height: TOP * 2 + (ordered.length + 1) * ROW, width: MAP_W };
};

const halfHeight = (id) => (id === START || id === END ? 13 : NODE_H / 2);
const halfWidth = (id) => (id === START || id === END ? 13 : NODE_W / 2);

/** The curve of one connection and the point its label sits at. */
export const edgePath = (layout, from, to, at = 0.5) => {
  const a = layout.at.get(from);
  const b = layout.at.get(to);
  if (!a || !b) return null;
  const down = b.row > a.row;
  const span = Math.abs(b.row - a.row);
  let p;
  if (a.column === b.column && span > 1) {
    // Skips rows in its own column: leave and arrive by the side.
    // The centre column bows out to the left going down and to the
    // right coming back; the side column does the opposite, so its
    // curves use the outer edge and the gap, not the centre steps.
    const side = (down ? -1 : 1) * (a.column ? -1 : 1);
    const room = a.column ? (side > 0 ? 84 : 58) : 150;
    const bow = Math.min(46 + span * 20, room);
    const x1 = a.x + side * halfWidth(from);
    const x2 = b.x + side * halfWidth(to);
    p = [[x1, a.y], [x1 + side * bow, a.y], [x2 + side * bow, b.y], [x2, b.y]];
  } else {
    const y1 = a.y + (down ? halfHeight(from) : -halfHeight(from));
    const y2 = b.y + (down ? -halfHeight(to) : halfHeight(to));
    const pull = Math.max(24, Math.abs(y2 - y1) / 2);
    // A step straight back up the same column would lie on top of the
    // one going down, so it is nudged to the right.
    const nudge = !down && a.column === b.column ? 46 : 0;
    p = [[a.x + nudge, y1], [a.x + nudge, y1 + (down ? pull : -pull)], [b.x + nudge, y2 + (down ? -pull : pull)], [b.x + nudge, y2]];
  }
  const d = `M ${p[0][0]} ${p[0][1]} C ${p[1][0]} ${p[1][1]}, ${p[2][0]} ${p[2][1]}, ${p[3][0]} ${p[3][1]}`;
  // Where the label sits along the curve. Long curves that share a
  // side would stack their labels at the halfway point, so the caller
  // can slide each one along.
  const u = 1 - at;
  const point = (k) => u * u * u * p[0][k] + 3 * u * u * at * p[1][k] + 3 * u * at * at * p[2][k] + at * at * at * p[3][k];
  const mid = { x: point(0), y: point(1) };
  return { d, mid };
};

/** Line thickness, thin to thick, for a value against the largest on the map. */
export const thickness = (value, max) => {
  if (!max || value === null || value === undefined) return 1.5;
  return 1.5 + Math.sqrt(Math.max(0, value) / max) * 8.5;
};

// ── Root cause analysis ─────────────────────────────────────
// Which kinds of case are over-represented among the ones with a
// problem. For each value of each attribute (a supplier, a cohort, a
// weekday) it compares that value's own problem rate with the rate
// across all cases, and ranks by EXCESS: how many more problem cases
// that value has than it would at the overall rate. Excess weighs how
// far out of line a value is by how many cases it carries, so one bad
// case out of one does not top the list.
export const ROOT_CAUSE_TARGETS = [
  { id: 'deviation', label: 'Deviation from the reference path' },
  { id: 'rework', label: 'Rework (a repeated activity)' },
  { id: 'slow', label: 'Long cycle time (slowest 25%)' },
];

/** The test for each target: (case) => true when it has the problem. */
export const targetTest = (process, cases, target) => {
  if (target === 'rework') return (c) => new Set(c.path).size < c.path.length;
  if (target === 'slow') {
    const hours = cases.map(caseHours).filter((h) => h !== null);
    const cut = quantile(hours, 0.75);
    return (c) => { const h = caseHours(c); return cut !== null && h !== null && h > cut; };
  }
  return (c) => !sameRoute(c.path, process.expected);
};

/**
 * → { total, affected, rate, rows: [{ key, value, cases, affected, rate, excess }] }
 * Only values carried by at least `minCases` cases, with more problem
 * cases than the overall rate predicts, most excess first.
 */
export const rootCauses = (cases, isAffected, { minCases = 3, limit = 10 } = {}) => {
  const total = cases.length;
  const affected = cases.filter(isAffected).length;
  const rate = total ? affected / total : 0;
  const groups = new Map();
  for (const c of cases) {
    const hit = isAffected(c);
    for (const [key, value] of Object.entries(c.attrs ?? {})) {
      const id = `${key}\u0000${value}`;
      if (!groups.has(id)) groups.set(id, { key, value, cases: 0, affected: 0 });
      const g = groups.get(id);
      g.cases += 1;
      if (hit) g.affected += 1;
    }
  }
  const rows = [...groups.values()]
    .map((g) => ({ ...g, rate: g.affected / g.cases, excess: g.affected - g.cases * rate }))
    // A value every case shares explains nothing.
    .filter((g) => g.cases >= minCases && g.cases < total && g.excess > 0.5)
    .sort((a, b) => b.excess - a.excess || b.rate - a.rate)
    .slice(0, limit)
    .map((g) => ({ ...g, rate: Math.round(g.rate * 1000) / 10, excess: Math.round(g.excess * 10) / 10 }));
  return { total, affected, rate: Math.round(rate * 1000) / 10, rows };
};

/** How many of the commonest routes it takes to cover `share` percent of cases. */
export const routesToCover = (variants, share = 80, cap = 6) => {
  const total = variants.reduce((s, v) => s + v.cases.length, 0) || 1;
  let seen = 0;
  for (let i = 0; i < variants.length; i += 1) {
    seen += variants[i].cases.length;
    if ((seen / total) * 100 >= share || i + 1 >= cap) return i + 1;
  }
  return variants.length;
};

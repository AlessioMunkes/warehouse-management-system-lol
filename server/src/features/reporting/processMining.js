// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/processMining.js
//
// PROCESS MINING: the warehouse's main process, from a purchase order
// being raised to a dispatch note being signed, read off the
// timestamps the system already keeps. No SQL here: the repository
// hands over plain rows and this works out the map.
//
// ONE PROCESS, THREE LANES
// A purchase order and a pallet are not the same thing, and the system
// does not record which delivery a given bag on a pallet came from. So
// the process is three lanes that meet at the shelf, each following
// the thing that really moves through it:
//
//   INBOUND   a purchase order   raised → approved → first delivery → received in full
//   SHELF     stock, by product  received → dispatched
//   OUTBOUND  a pallet           slip raised → claimed → packing started → packed → collected
//
// The shelf lane is AN ESTIMATE and says so. With no batch tracking,
// the time stock sits is worked out oldest-first: each quantity that
// leaves is matched to the oldest quantity of that product still
// there. That is how a warehouse is meant to rotate, and it is the
// only assumption in here. Everything in the other two lanes is a
// recorded moment.
//
// WHAT COMES BACK
//   lanes[].steps[]        the boxes, with how many cases reached each
//   lanes[].transitions[]  the arrows: how many made the move and how
//                          long it typically took (median, average,
//                          and the slow end, p90), plus the slowest cases
//   lanes[].variants[]     the routes cases really took, commonest first
//   lanes[].groups[]       the lane broken down (by supplier, by cohort,
//                          by product)
//   bottleneck             the slowest step of the whole process
//   endToEnd               the three lanes added up
// ─────────────────────────────────────────────────────────────

const HOUR = 3600000;
const ms = (v) => (v ? new Date(v).getTime() : null);

// ── Numbers ─────────────────────────────────────────────────
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = sorted(xs);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const round = (n, dp = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** dp) / 10 ** dp);

// A median that counts each sample by how much stock it stands for.
const weightedMedian = (samples) => {
  const total = samples.reduce((s, x) => s + x.weight, 0);
  if (!total) return null;
  let seen = 0;
  for (const x of [...samples].sort((a, b) => a.value - b.value)) {
    seen += x.weight;
    if (seen >= total / 2) return x.value;
  }
  return null;
};

/** How long a move took across cases: [{ hours, label, id }] → the arrow's figures. */
export const summarise = (samples, { slowest = 5 } = {}) => {
  // A clock that ran backwards (a corrected record, a test row) is not
  // a duration. Left out, never shown as a negative wait.
  const good = samples.filter((s) => Number.isFinite(s.hours) && s.hours >= 0);
  const hours = good.map((s) => s.hours);
  return {
    cases: good.length,
    medianHours: round(quantile(hours, 0.5)),
    averageHours: round(hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null),
    p90Hours: round(quantile(hours, 0.9)),
    slowest: [...good].sort((a, b) => b.hours - a.hours).slice(0, slowest)
      .map((s) => ({ id: s.id, label: s.label, hours: round(s.hours), detail: s.detail ?? null })),
  };
};

const between = (cases, from, to, label, detail) => cases
  .filter((c) => c[from] !== null && c[to] !== null)
  .map((c) => ({ id: c.id, label: label(c), detail: detail ? detail(c) : null, hours: (c[to] - c[from]) / HOUR }));

const transition = (id, from, to, label, samples) => ({ id, from, to, label, ...summarise(samples) });

const tally = (cases, keyOf, { total = cases.length } = {}) => {
  const counts = new Map();
  for (const c of cases) {
    const key = keyOf(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, n]) => ({ label, cases: n, share: total ? round((n / total) * 100, 1) : 0 }))
    .sort((a, b) => b.cases - a.cases || a.label.localeCompare(b.label));
};

const groupMedians = (cases, keyOf, from, to, limit = 8) => {
  const groups = new Map();
  for (const c of cases) {
    if (c[from] === null || c[to] === null) continue;
    const h = (c[to] - c[from]) / HOUR;
    if (!(h >= 0)) continue;
    const key = keyOf(c) ?? 'Not set';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  return [...groups.entries()]
    .map(([label, hs]) => ({ label, cases: hs.length, medianHours: round(quantile(hs, 0.5)) }))
    .sort((a, b) => b.medianHours - a.medianHours)
    .slice(0, limit);
};

// ── Inbound: one purchase order ─────────────────────────────
const dayEnd = (isoDay) => (isoDay ? new Date(`${String(isoDay).slice(0, 10)}T23:59:59+02:00`).getTime() : null);

const orderVariant = (o) => {
  if (o.status === 'returned') return 'Sent back';
  if (o.status === 'pending') return 'Waiting for approval';
  if (o.firstDelivery === null) return o.expectedBy !== null && o.expectedBy < o.now ? 'Not delivered, overdue' : 'Not delivered yet';
  const late = o.expectedBy !== null && o.firstDelivery > o.expectedBy;
  if (o.status !== 'completed') return late ? 'Part delivered, late' : 'Part delivered, the rest outstanding';
  if (o.deliveries > 1) return late ? 'Delivered in parts, late' : 'Delivered in parts';
  return late ? 'Delivered in full, late' : 'Delivered in full, on time';
};

const inboundLane = (rows, now) => {
  const orders = rows.map((r) => {
    const raised = ms(r.created_at);
    const first = ms(r.first_delivery);
    const last = ms(r.last_delivery);
    return {
      id: r.id, number: r.po_number, supplier: r.supplier_name, status: r.status, now,
      raised,
      // Only known for orders approved since status changes began to be
      // logged. An older order shows no approval time, not a guessed one.
      approved: ms(r.approved_at),
      firstDelivery: first,
      complete: r.status === 'completed' ? (last ?? ms(r.status_changed_at)) : null,
      deliveries: Number(r.deliveries ?? 0),
      expectedBy: dayEnd(r.expected_delivery_date),
    };
  });
  const name = (o) => `${o.number ?? `Order ${o.id}`} · ${o.supplier ?? 'No supplier'}`;
  const reached = (key) => orders.filter((o) => o[key] !== null).length;
  const transitions = [
    transition('raised_approved', 'raised', 'approved', 'Waiting for approval', between(orders, 'raised', 'approved', name)),
    transition('approved_delivered', 'approved', 'firstDelivery', 'Approved to first delivery', between(orders, 'approved', 'firstDelivery', name)),
    transition('raised_delivered', 'raised', 'firstDelivery', 'Raised to first delivery', between(orders, 'raised', 'firstDelivery', name)),
    transition('delivered_complete', 'firstDelivery', 'complete', 'First delivery to received in full', between(orders.filter((o) => o.deliveries > 1), 'firstDelivery', 'complete', name)),
  ];
  return {
    id: 'inbound',
    label: 'Order to shelf',
    caseNoun: 'purchase orders',
    cases: orders.length,
    steps: [
      { id: 'raised', label: 'Order raised', cases: reached('raised') },
      { id: 'approved', label: 'Approved', cases: orders.filter((o) => o.status !== 'pending' && o.status !== 'returned').length, timed: reached('approved') },
      { id: 'firstDelivery', label: 'First delivery', cases: reached('firstDelivery') },
      { id: 'complete', label: 'Received in full', cases: reached('complete') },
    ],
    // The arrows drawn on the map: one per step, falling back to the
    // whole raised-to-delivered wait where approval times are missing.
    path: ['raised_approved', 'approved_delivered', 'delivered_complete'],
    headline: 'raised_delivered',
    transitions,
    variants: tally(orders, orderVariant),
    groups: [{ id: 'supplier', label: 'By supplier, raised to first delivery', rows: groupMedians(orders, (o) => o.supplier, 'raised', 'firstDelivery') }],
    note: reached('approved') < orders.filter((o) => o.status !== 'pending').length
      ? 'Approval times are recorded from now on. Orders approved before that show the whole wait from raised to first delivery.'
      : null,
  };
};

// ── Outbound: one pallet ────────────────────────────────────
const KIND = { ecd: 'ECD centres', soup_kitchen: 'Soup kitchens', dignity_kitchen: 'Dignity Kitchen', community: 'Community' };

const palletVariant = (p) => {
  const extras = [];
  if (p.claims > 1) extras.push('re-claimed');
  if (p.flagged) extras.push('a line flagged');
  if (p.shortfall) extras.push('stock short');
  const tail = extras.length ? `, ${extras.join(', ')}` : '';
  if (p.status === 'cancelled') return 'Cancelled';
  if (p.outcome === 'not_collected') return `Packed, not collected${tail}`;
  if (p.collected !== null) return `${p.outcome === 'late_collected' ? 'Collected late' : 'Collected'}${p.wrongDay ? ' on another day' : ''}${tail}`;
  if (p.packed !== null) return `Packed, waiting at the gate${tail}`;
  if (p.claimed !== null) return `Being packed${tail}`;
  return 'Not claimed yet';
};

const outboundLane = (slips, events) => {
  const bySlip = new Map();
  for (const e of events) {
    if (!bySlip.has(e.picking_slip_id)) bySlip.set(e.picking_slip_id, []);
    bySlip.get(e.picking_slip_id).push({ type: e.event_type, at: ms(e.created_at) });
  }
  const first = (list, ...types) => list.find((e) => types.includes(e.type))?.at ?? null;
  const pallets = slips.map((s) => {
    const list = (bySlip.get(s.id) ?? []).sort((a, b) => a.at - b.at);
    const claims = list.filter((e) => e.type === 'assigned').length;
    return {
      id: s.id, name: s.name, cohort: s.cohort, kind: s.beneficiary_kind, status: s.status, bookedFor: s.dispatch_date,
      generated: first(list, 'generated') ?? ms(s.created_at),
      claimed: first(list, 'assigned'),
      started: first(list, 'item_confirmed', 'item_flagged'),
      packed: first(list, 'completed') ?? ms(s.completed_at),
      collected: ms(s.collected_at) ?? first(list, 'dispatched'),
      outcome: s.gate_status ?? null,
      claims,
      flagged: list.some((e) => e.type === 'item_flagged'),
      shortfall: list.some((e) => e.type === 'stock_shortfall'),
      wrongDay: list.some((e) => e.type === 'wrong_day_collection'),
    };
  });
  // A written-off pallet was never collected, whatever time is on it.
  for (const p of pallets) if (p.outcome === 'not_collected') p.collected = null;

  const name = (p) => `${p.name ?? `Pallet ${p.id}`}${p.bookedFor ? ` · booked for ${String(p.bookedFor).slice(0, 10)}` : ''}`;
  const reached = (key) => pallets.filter((p) => p[key] !== null).length;
  const transitions = [
    transition('generated_claimed', 'generated', 'claimed', 'Waiting to be claimed', between(pallets, 'generated', 'claimed', name)),
    transition('claimed_started', 'claimed', 'started', 'Claimed to first line packed', between(pallets, 'claimed', 'started', name)),
    transition('started_packed', 'started', 'packed', 'Packing', between(pallets, 'started', 'packed', name)),
    transition('packed_collected', 'packed', 'collected', 'Waiting at the gate', between(pallets, 'packed', 'collected', name)),
    transition('generated_collected', 'generated', 'collected', 'Slip raised to collected', between(pallets, 'generated', 'collected', name)),
  ];
  return {
    id: 'outbound',
    label: 'Slip to dispatch note',
    caseNoun: 'pallets',
    cases: pallets.length,
    steps: [
      { id: 'generated', label: 'Slip raised', cases: reached('generated') },
      { id: 'claimed', label: 'Claimed', cases: reached('claimed') },
      { id: 'started', label: 'Packing started', cases: reached('started') },
      { id: 'packed', label: 'Packed', cases: reached('packed') },
      { id: 'collected', label: 'Collected', cases: reached('collected') },
    ],
    path: ['generated_claimed', 'claimed_started', 'started_packed', 'packed_collected'],
    headline: 'generated_collected',
    transitions,
    variants: tally(pallets, palletVariant),
    groups: [
      { id: 'cohort', label: 'By cohort, slip raised to collected', rows: groupMedians(pallets.filter((p) => p.kind === 'ecd' || !p.kind), (p) => (p.cohort ? `${p.cohort[0].toUpperCase()}${p.cohort.slice(1)}` : null), 'generated', 'collected') },
      { id: 'kind', label: 'By who it was for, slip raised to collected', rows: groupMedians(pallets, (p) => KIND[p.kind] ?? p.kind, 'generated', 'collected') },
    ],
    note: null,
  };
};

// ── The shelf: stock, oldest first ──────────────────────────
/**
 * How long stock sat before it left, matching each quantity going out
 * to the oldest quantity of that product still on the shelf.
 * `movements`: every movement of every product, oldest first.
 * Only dispatches inside [from, to] are measured; earlier movements
 * are still replayed, because what is oldest depends on them.
 */
export const shelfDwell = (movements, { from, to }) => {
  const queues = new Map();          // product → [{ at, left }]
  const samples = [];
  for (const m of movements) {
    const at = ms(m.created_at);
    const qty = Number(m.quantity);
    if (!Number.isFinite(qty) || qty === 0 || at === null) continue;
    if (!queues.has(m.product_id)) queues.set(m.product_id, []);
    const queue = queues.get(m.product_id);
    if (qty > 0) { queue.push({ at, left: qty }); continue; }

    let need = -qty;
    const measured = m.movement_type === 'dispatched' && at >= from && at <= to;
    while (need > 1e-9 && queue.length) {
      const oldest = queue[0];
      const take = Math.min(oldest.left, need);
      if (measured) samples.push({ product: m.product_name, value: (at - oldest.at) / HOUR, weight: take });
      oldest.left -= take;
      need -= take;
      if (oldest.left <= 1e-9) queue.shift();
    }
    // Anything still needed left a shelf the ledger says was empty
    // (stock gone negative). There is no receipt to measure it against.
  }
  return samples.filter((s) => s.value >= 0);
};

const shelfLane = (movements, range) => {
  const samples = shelfDwell(movements, range);
  const weight = samples.reduce((s, x) => s + x.weight, 0);
  const byProduct = new Map();
  for (const s of samples) {
    if (!byProduct.has(s.product)) byProduct.set(s.product, []);
    byProduct.get(s.product).push(s);
  }
  const products = [...byProduct.entries()]
    .map(([label, list]) => ({ label: label ?? 'Unknown product', cases: list.length, medianHours: round(weightedMedian(list)) }))
    .sort((a, b) => b.medianHours - a.medianHours);
  const median = weightedMedian(samples);
  const dwell = {
    id: 'received_dispatched', from: 'received', to: 'dispatched', label: 'On the shelf',
    cases: samples.length,
    medianHours: round(median),
    averageHours: round(weight ? samples.reduce((s, x) => s + x.value * x.weight, 0) / weight : null),
    p90Hours: round(quantile(samples.map((s) => s.value), 0.9)),
    slowest: products.slice(0, 5).map((p) => ({ id: p.label, label: p.label, hours: p.medianHours, detail: null })),
  };
  return {
    id: 'shelf',
    label: 'On the shelf',
    caseNoun: 'dispatched quantities',
    cases: samples.length,
    steps: [
      { id: 'received', label: 'Received into stock', cases: samples.length },
      { id: 'dispatched', label: 'Left on a pallet', cases: samples.length },
    ],
    path: ['received_dispatched'],
    headline: 'received_dispatched',
    transitions: [dwell],
    variants: [],
    groups: [{ id: 'product', label: 'By product, longest on the shelf first', rows: products.slice(0, 8) }],
    note: 'An estimate. Stock is not tracked by batch, so each quantity that left is matched to the oldest of that product still on the shelf.',
    estimate: true,
  };
};

// ── The whole process ───────────────────────────────────────
const find = (lane, id) => lane.transitions.find((t) => t.id === id);

export const buildProcess = ({ orders, slips, events, movements, range, now = Date.now() }) => {
  const from = new Date(`${range.from}T00:00:00+02:00`).getTime();
  const to = new Date(`${range.to}T23:59:59+02:00`).getTime();
  const lanes = [inboundLane(orders, now), shelfLane(movements, { from, to }), outboundLane(slips, events)];

  // The slowest step of all, by typical time. Only steps enough cases
  // have been through: one slow pallet is an anecdote, not a bottleneck.
  const MIN_CASES = 3;
  const candidates = lanes.flatMap((lane) => lane.path
    .map((id) => find(lane, id))
    .filter((t) => t && t.cases >= MIN_CASES && t.medianHours !== null)
    .map((t) => ({ lane: lane.id, laneLabel: lane.label, id: t.id, label: t.label, medianHours: t.medianHours, cases: t.cases, estimate: Boolean(lane.estimate) })));
  const bottleneck = candidates.sort((a, b) => b.medianHours - a.medianHours)[0] ?? null;

  const parts = lanes.map((lane) => ({ lane: lane.id, label: lane.label, medianHours: find(lane, lane.headline)?.medianHours ?? null }));
  const known = parts.filter((p) => p.medianHours !== null);
  return {
    range,
    lanes,
    bottleneck,
    endToEnd: {
      // Three typical times added up, not one thing followed from end to
      // end: nothing in the data ties a delivery to a particular pallet.
      medianHours: known.length === parts.length ? round(known.reduce((s, p) => s + p.medianHours, 0)) : null,
      parts,
    },
    empty: lanes.every((lane) => lane.cases === 0),
  };
};

export default { buildProcess, summarise, shelfDwell };

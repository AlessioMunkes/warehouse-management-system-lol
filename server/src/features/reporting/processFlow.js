// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/processFlow.js
//
// THE EVENT LOG behind the flow map: for every case, the steps it went
// through in the order they happened. processMining.js measures the
// waits between a fixed set of steps; this keeps the whole path of each
// case, so the screen can draw every route cases really took, the
// detours and the repeats included.
//
// Two processes, each following the thing that actually has a history:
//   orders    a purchase order: raised, approved, deliveries, follow-ups
//   pallets   a pallet: slip raised, claimed, packed, the gate
// Stock on the shelf has no path of its own (it is not tracked by
// batch), so it stays in the step-times view as an estimate.
//
// SHAPE, kept small because it is sent whole to the browser:
//   { activities: [{ id, label }], expected: [activity index],
//     cases: [{ id, label, path: [activity index], t: [hours | null] }] }
// `t` is hours since the case began, one per step. null means the step
// is known to have happened but not when (an order approved before
// approvals were logged): it keeps its place on the route and is left
// out of every time.
//
// A step repeated back to back (twelve lines confirmed one after
// another) is one step: what matters is that packing happened, not how
// many taps it took. A step that comes BACK after something else (a
// pallet claimed again, a second delivery) is kept, because that
// repeat is the rework the map is there to show.
// ─────────────────────────────────────────────────────────────

const HOUR = 3600000;
const ms = (v) => (v ? new Date(v).getTime() : null);
const round = (n) => Math.round(n * 100) / 100;

export const MAX_CASES = 4000;

const ORDER_ACTIVITIES = [
  ['raised', 'Order raised'],
  ['approved', 'Approved'],
  ['in_transit', 'In transit'],
  ['delivery', 'Delivery received'],
  ['delivery_problem', 'Delivery flagged'],
  ['short', 'Delivered short'],
  ['follow_up_needed', 'Follow-up needed'],
  ['follow_up_order', 'Follow-up order raised'],
  ['reopened', 'Reopened'],
  ['closed', 'Closed by a manager'],
  ['complete', 'Received in full'],
  ['returned', 'Sent back'],
];
const ORDER_EXPECTED = ['raised', 'approved', 'delivery', 'complete'];

const PALLET_ACTIVITIES = [
  ['generated', 'Slip raised'],
  ['claimed', 'Claimed'],
  ['packing', 'Lines packed'],
  ['flagged', 'Line flagged'],
  ['variance', 'Quantity changed'],
  ['shortfall', 'Stock short'],
  ['unit_mismatch', 'Unit did not match'],
  ['packed', 'Packed'],
  ['wrong_day', 'Came on another day'],
  ['collected', 'Collected'],
  ['collected_late', 'Collected late'],
  ['not_collected', 'Not collected'],
];
const PALLET_EXPECTED = ['generated', 'claimed', 'packing', 'packed', 'collected'];

const PALLET_EVENT = {
  generated: 'generated', assigned: 'claimed', item_confirmed: 'packing', item_flagged: 'flagged',
  item_variance: 'variance', stock_shortfall: 'shortfall', unit_mismatch: 'unit_mismatch',
  completed: 'packed', wrong_day_collection: 'wrong_day', dispatched: 'collected',
  late_collected: 'collected_late', not_collected: 'not_collected',
};

// [{ a, at }] in order → one case, repeats back to back folded.
const toCase = (id, label, steps, index) => {
  const path = [];
  const times = [];
  for (const s of steps) {
    const i = index.get(s.a);
    if (i === undefined) continue;
    if (path.length && path[path.length - 1] === i) continue;
    path.push(i);
    times.push(s.at);
  }
  const start = times.find((x) => x !== null) ?? null;
  return { id, label, path, t: times.map((x) => (x === null || start === null ? null : round((x - start) / HOUR))) };
};

const pack = (id, label, caseNoun, activities, expected, cases) => {
  const index = new Map(activities.map(([key], i) => [key, i]));
  const built = cases.map((c) => toCase(c.id, c.label, c.steps, index)).filter((c) => c.path.length > 0);
  // The most recent cases when there are more than the browser should hold.
  const kept = built.length > MAX_CASES ? built.slice(built.length - MAX_CASES) : built;
  return {
    id, label, caseNoun,
    activities: activities.map(([key, name]) => ({ id: key, label: name })),
    expected: expected.map((key) => index.get(key)),
    cases: kept,
    total: built.length,
    truncated: built.length > kept.length,
  };
};

const STATUS_STEP = {
  approved: 'approved', in_transit: 'in_transit', returned: 'returned',
  follow_up_required: 'follow_up_needed', completed: 'closed',
};

/**
 * orders:     listOrders() rows
 * changes:    [{ purchase_order_id, from_status, to_status, created_at }] status changes
 * deliveries: [{ purchase_order_id, status, created_at }]
 * followUps:  [{ follow_up_of, created_at }] orders raised for what was short
 */
export const orderFlow = ({ orders, changes = [], deliveries = [], followUps = [] }) => {
  const group = (rows, key) => {
    const out = new Map();
    for (const r of rows) {
      if (!out.has(r[key])) out.set(r[key], []);
      out.get(r[key]).push(r);
    }
    return out;
  };
  const changesBy = group(changes, 'purchase_order_id');
  const deliveriesBy = group(deliveries, 'purchase_order_id');
  const followBy = group(followUps, 'follow_up_of');

  const cases = orders.map((o) => {
    const raised = ms(o.created_at);
    const timed = [];
    for (const c of changesBy.get(o.id) ?? []) {
      const a = c.to_status === 'approved' && c.from_status && c.from_status !== 'pending' ? 'reopened' : STATUS_STEP[c.to_status];
      if (a) timed.push({ a, at: ms(c.created_at) });
    }
    const notes = deliveriesBy.get(o.id) ?? [];
    for (const d of notes) timed.push({ a: d.status === 'flagged' ? 'delivery_problem' : 'delivery', at: ms(d.created_at) });
    for (const f of followBy.get(o.id) ?? []) timed.push({ a: 'follow_up_order', at: ms(f.created_at) });
    timed.sort((x, y) => x.at - y.at);

    const steps = [{ a: 'raised', at: raised }];
    // Approved, but before approvals were logged: it happened, so it is
    // on the route, with no time. Never a guessed one.
    const approvalLogged = timed.some((s) => s.a === 'approved');
    if (!approvalLogged && o.status !== 'pending' && o.status !== 'returned') steps.push({ a: 'approved', at: null });
    steps.push(...timed);

    const last = timed.length ? timed[timed.length - 1].at : raised;
    // Where it stands now, when no logged step already says so.
    if (o.status === 'completed' && notes.length && !timed.some((s) => s.a === 'closed')) steps.push({ a: 'complete', at: last });
    if (o.status === 'partially_received' && notes.length) {
      // "Delivered short" belongs straight after the delivery that was short.
      const lastDelivery = Math.max(...notes.map((d) => ms(d.created_at)));
      const at = steps.findIndex((s) => s.at === lastDelivery && (s.a === 'delivery' || s.a === 'delivery_problem'));
      steps.splice(at + 1, 0, { a: 'short', at: lastDelivery });
    }
    if (o.status === 'returned' && !timed.some((s) => s.a === 'returned')) steps.push({ a: 'returned', at: ms(o.status_changed_at) ?? last });

    return { id: o.id, label: `${o.po_number ?? `Order ${o.id}`} · ${o.supplier_name ?? 'No supplier'}`, steps };
  });
  return pack('orders', 'Purchase orders', 'purchase orders', ORDER_ACTIVITIES, ORDER_EXPECTED, cases);
};

/** slips: listSlips() rows · events: listSlipEvents() rows, oldest first */
export const palletFlow = ({ slips, events = [] }) => {
  const bySlip = new Map();
  for (const e of events) {
    const a = PALLET_EVENT[e.event_type];
    if (!a) continue;
    if (!bySlip.has(e.picking_slip_id)) bySlip.set(e.picking_slip_id, []);
    bySlip.get(e.picking_slip_id).push({ a, at: ms(e.created_at) });
  }
  // Finishing a pallet and releasing it at the gate each write several
  // events in one transaction, so they share a timestamp to the
  // microsecond. Within one moment the finding comes before the result:
  // "stock short" then "packed", "came on another day" then "collected".
  const rank = new Map(PALLET_ACTIVITIES.map(([key], i) => [key, i]));
  const inOrder = (x, y) => x.at - y.at || rank.get(x.a) - rank.get(y.a);
  const cases = slips.map((s) => {
    const steps = (bySlip.get(s.id) ?? []).sort(inOrder);
    const has = (a) => steps.some((x) => x.a === a);
    // Rows older than the event log still have their own timestamps.
    if (!has('generated')) steps.unshift({ a: 'generated', at: ms(s.created_at) });
    if (!has('packed') && s.completed_at) steps.push({ a: 'packed', at: ms(s.completed_at) });
    if (s.collected_at && !has('collected') && !has('collected_late') && s.gate_status !== 'not_collected') {
      steps.push({ a: s.gate_status === 'late_collected' ? 'collected_late' : 'collected', at: ms(s.collected_at) });
    }
    steps.sort(inOrder);
    const day = s.dispatch_date ? ` · booked for ${String(s.dispatch_date).slice(0, 10)}` : '';
    return { id: s.id, label: `${s.name ?? `Pallet ${s.id}`}${day}`, steps };
  });
  return pack('pallets', 'Pallets', 'pallets', PALLET_ACTIVITIES, PALLET_EXPECTED, cases);
};

export const buildFlow = ({ orders, changes, deliveries, followUps, slips, events }) => ({
  processes: [orderFlow({ orders, changes, deliveries, followUps }), palletFlow({ slips, events })],
});

export default { buildFlow, orderFlow, palletFlow, MAX_CASES };

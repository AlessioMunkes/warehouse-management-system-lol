// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/processFlow.js
//
// THE EVENT LOG behind the flow map: for every case, the steps it went
// through in the order they happened. processMining.js measures the
// waits between a fixed set of steps; this keeps the whole path of each
// case, so the screen can draw every route cases really took, the
// detours and the repeats included.
//
// Five processes, each following the thing that actually has a history:
//   order_to_dispatch  a delivered item, from its purchase order to the
//                      pallets it left on. AN ESTIMATE: see lotFlow.
//   orders             a purchase order: raised, approved, deliveries,
//                      follow-ups
//   pallets            packing: slip raised, claimed, packed, the gate
//   donations          a donation: received, classified, certificate
//   requests           a benevolent request: asked for, and how it ended
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
  ['raised', 'PO raised'],
  ['approved', 'PO approved'],
  ['in_transit', 'In transit'],
  ['delivery', 'Goods received'],
  ['delivery_problem', 'Receipt discrepancy'],
  ['short', 'Short delivery'],
  ['follow_up_needed', 'Follow-up required'],
  ['follow_up_order', 'Back order raised'],
  ['reopened', 'Reopened'],
  ['closed', 'Manually closed'],
  ['complete', 'Fully received'],
  ['returned', 'Returned to supplier'],
];
const ORDER_EXPECTED = ['raised', 'approved', 'delivery', 'complete'];

const PALLET_ACTIVITIES = [
  ['generated', 'Slip generated'],
  ['claimed', 'Assigned'],
  ['packing', 'Lines picked'],
  ['flagged', 'Line exception'],
  ['variance', 'Quantity variance'],
  ['shortfall', 'Stock shortfall'],
  ['unit_mismatch', 'Unit mismatch'],
  ['packed', 'Packing complete'],
  ['wrong_day', 'Off-schedule collection'],
  ['collected', 'Dispatched'],
  ['collected_late', 'Late collection'],
  ['not_collected', 'Uncollected'],
];
const PALLET_EXPECTED = ['generated', 'claimed', 'packing', 'packed', 'collected'];

const PALLET_EVENT = {
  generated: 'generated', assigned: 'claimed', item_confirmed: 'packing', item_flagged: 'flagged',
  item_variance: 'variance', stock_shortfall: 'shortfall', unit_mismatch: 'unit_mismatch',
  completed: 'packed', wrong_day_collection: 'wrong_day', dispatched: 'collected',
  late_collected: 'collected_late', not_collected: 'not_collected',
};

// The weekday of a moment, in South African time.
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (at) => (at === null || at === undefined ? null : WEEKDAY_NAMES[new Date(at + 2 * HOUR).getUTCDay()]);
const titled = (s) => (s ? `${String(s)[0].toUpperCase()}${String(s).slice(1).replace(/_/g, ' ')}` : null);
// Only what is known: an attribute with no value is left off the case.
const known = (attrs) => Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined && v !== ''));

// [{ a, at }] in order → one case, repeats back to back folded.
// `attrs` says what kind of case it is (its supplier, its cohort), for
// the root cause analysis on the flow map: which kinds deviate most.
const toCase = (id, label, steps, index, attrs = {}) => {
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
  return { id, label, path, t: times.map((x) => (x === null || start === null ? null : round((x - start) / HOUR))), attrs: known(attrs) };
};

const pack = (id, label, caseNoun, activities, expected, cases, extra = {}) => {
  const index = new Map(activities.map(([key], i) => [key, i]));
  const built = cases.map((c) => toCase(c.id, c.label, c.steps, index, c.attrs)).filter((c) => c.path.length > 0);
  // The most recent cases when there are more than the browser should hold.
  const kept = built.length > MAX_CASES ? built.slice(built.length - MAX_CASES) : built;
  return {
    id, label, caseNoun,
    activities: activities.map(([key, name]) => ({ id: key, label: name })),
    expected: expected.map((key) => index.get(key)),
    cases: kept,
    total: built.length,
    truncated: built.length > kept.length,
    ...extra,
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

    return {
      id: o.id, label: `${o.po_number ?? `Order ${o.id}`} · ${o.supplier_name ?? 'No supplier'}`, steps,
      attrs: { Supplier: o.supplier_name, 'Weekday raised': weekdayOf(raised) },
    };
  });
  return pack('orders', 'Purchase orders', 'purchase orders', ORDER_ACTIVITIES, ORDER_EXPECTED, cases);
};

const BENEFICIARY_LABEL = { ecd: 'ECD centre', soup_kitchen: 'Soup kitchen', dignity_kitchen: 'Dignity Kitchen', community: 'Community' };

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
    return {
      id: s.id, label: `${s.name ?? `Pallet ${s.id}`}${day}`, steps,
      attrs: {
        Cohort: titled(s.cohort),
        'Beneficiary type': BENEFICIARY_LABEL[s.beneficiary_kind] ?? titled(s.beneficiary_kind),
        Beneficiary: s.name,
        'Scheduled weekday': s.dispatch_date ? weekdayOf(Date.parse(`${String(s.dispatch_date).slice(0, 10)}T10:00:00Z`)) : null,
      },
    };
  });
  return pack('pallets', 'Packing', 'pallets', PALLET_ACTIVITIES, PALLET_EXPECTED, cases);
};

// ── Order to dispatch: one delivered item, followed onto pallets ──
// The whole main process in one path: the order, the delivery, and what
// became of the stock. A case is one product on one delivery.
//
// AN ESTIMATE, and the screen says so. Stock is not tracked by batch,
// so nothing records which delivery a bag on a pallet came from. Every
// movement of each product is replayed in order and whatever leaves is
// taken from the oldest stock still there, which is how a warehouse is
// meant to rotate. Stock that came in another way (a donation, a count
// correction) takes its turn in the queue but is not a case.
const LOT_ACTIVITIES = [
  ['raised', 'PO raised'],
  ['approved', 'PO approved'],
  ['delivered', 'Goods received'],
  ['delivered_late', 'Late delivery'],
  ['decanted', 'Decanted'],
  ['dispatched', 'Dispatched'],
  ['wasted', 'Written off'],
  ['adjusted', 'Stock adjustment'],
  ['used_up', 'Fully depleted'],
  ['in_stock', 'Balance on hand'],
];
const LOT_EXPECTED = ['raised', 'approved', 'delivered', 'dispatched', 'used_up'];
const LEAVES_AS = { dispatched: 'dispatched', wastage: 'wasted', decanted: 'decanted' };
const dayEnd = (isoDay) => (isoDay ? new Date(`${String(isoDay).slice(0, 10)}T23:59:59+02:00`).getTime() : null);

/**
 * orders:     listOrders() rows (approved_at, expected_delivery_date)
 * deliveries: [{ id, purchase_order_id, created_at }]
 * movements:  every stock movement, oldest first, with reference_type / reference_id
 */
export const lotFlow = ({ orders, deliveries = [], movements = [] }) => {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const orderOfNote = new Map(deliveries.map((d) => [d.id, orderById.get(d.purchase_order_id)]));
  const queues = new Map();
  const lots = [];

  for (const m of movements) {
    const at = ms(m.created_at);
    const qty = Number(m.quantity);
    if (!Number.isFinite(qty) || qty === 0 || at === null) continue;
    if (!queues.has(m.product_id)) queues.set(m.product_id, []);
    const queue = queues.get(m.product_id);

    if (qty > 0) {
      const order = m.movement_type === 'received' && m.reference_type === 'delivery_note' ? orderOfNote.get(m.reference_id) : null;
      const lot = order ? { order, product: m.product_name, at, steps: [], usedUpAt: null } : null;
      if (lot) lots.push(lot);
      queue.push({ left: qty, lot });
      continue;
    }

    let need = -qty;
    while (need > 1e-9 && queue.length) {
      const oldest = queue[0];
      const take = Math.min(oldest.left, need);
      oldest.left -= take;
      need -= take;
      if (oldest.lot) oldest.lot.steps.push({ a: LEAVES_AS[m.movement_type] ?? 'adjusted', at });
      if (oldest.left <= 1e-9) {
        if (oldest.lot) oldest.lot.usedUpAt = at;
        queue.shift();
      }
    }
  }

  const cases = lots.map((lot, i) => {
    const o = lot.order;
    const due = dayEnd(o.expected_delivery_date);
    const steps = [{ a: 'raised', at: ms(o.created_at) }];
    // Approved for certain (it was delivered). The time only if it was logged.
    steps.push({ a: 'approved', at: ms(o.approved_at) });
    steps.push({ a: due !== null && lot.at > due ? 'delivered_late' : 'delivered', at: lot.at });
    steps.push(...lot.steps);
    steps.push(lot.usedUpAt !== null ? { a: 'used_up', at: lot.usedUpAt } : { a: 'in_stock', at: null });
    return {
      id: i + 1, label: `${o.po_number ?? `Order ${o.id}`} · ${lot.product ?? 'Unknown product'}`, steps,
      attrs: { Supplier: o.supplier_name, Product: lot.product, 'Weekday received': weekdayOf(lot.at) },
    };
  });
  return pack('order_to_dispatch', 'Order to dispatch', 'receipt lines', LOT_ACTIVITIES, LOT_EXPECTED, cases, {
    estimate: true,
    note: 'An estimate. Stock is not batch-tracked, so each receipt line is traced by FIFO allocation: outbound quantities are matched to the oldest stock of that product.',
  });
};

// ── Donations ───────────────────────────────────────────────
const DONATION_ACTIVITIES = [
  ['received', 'Donation received'],
  ['classified', 'Items classified'],
  ['unclassified', 'Classification pending'],
  ['committed', 'Committed to stock'],
  ['awaiting_donor', 'Awaiting donor details'],
  ['certificate_queued', 'Section 18A queued'],
  ['certificate', 'Section 18A issued'],
  ['certificate_failed', 'Section 18A failed'],
  ['cancelled', 'Cancelled'],
];
const DONATION_EXPECTED = ['received', 'classified', 'committed', 'certificate'];
const S18A_STEP = { qualifying_pending_donor: 'awaiting_donor', queued: 'certificate_queued', failed: 'certificate_failed' };

/** donations: listDonations() rows · items: [{ donation_id, routing_status, resolved_at }] */
export const donationFlow = ({ donations = [], items = [] }) => {
  const byDonation = new Map();
  for (const it of items) {
    if (!byDonation.has(it.donation_id)) byDonation.set(it.donation_id, []);
    byDonation.get(it.donation_id).push(it);
  }
  const cases = donations.map((d) => {
    const steps = [{ a: 'received', at: ms(d.received_at) }];
    const lines = byDonation.get(d.id) ?? [];
    const resolved = lines.map((l) => ms(l.resolved_at)).filter((x) => x !== null).sort((a, b) => a - b);
    for (const at of resolved) steps.push({ a: 'classified', at });
    // Where it stands now. These are states, not logged moments, so
    // they carry no time.
    if (lines.some((l) => l.resolved_at === null && (l.routing_status === 'pending' || l.routing_status === 'unmatched'))) steps.push({ a: 'unclassified', at: null });
    if (d.status === 'cancelled') steps.push({ a: 'cancelled', at: null });
    if (d.status === 'committed') steps.push({ a: 'committed', at: null });
    if (S18A_STEP[d.section_18a_status]) steps.push({ a: S18A_STEP[d.section_18a_status], at: null });
    if (d.section_18a_issued_at) steps.push({ a: 'certificate', at: ms(d.section_18a_issued_at) });
    return {
      id: d.id, label: `${d.donor_name || 'Unnamed donor'} · ${String(d.received_day ?? '').slice(0, 10)}`, steps,
      attrs: { Donor: d.donor_name, 'Weekday received': weekdayOf(ms(d.received_at)) },
    };
  });
  return pack('donations', 'Donations', 'donations', DONATION_ACTIVITIES, DONATION_EXPECTED, cases);
};

// ── Benevolent requests ─────────────────────────────────────
const REQUEST_ACTIVITIES = [
  ['requested', 'Request logged'],
  ['reversed', 'Decision reversed'],
  ['approved', 'Approved'],
  ['fulfilled', 'Fulfilled'],
  ['partially_fulfilled', 'Partially fulfilled'],
  ['referred', 'Referred'],
  ['declined', 'Declined'],
];
const REQUEST_EXPECTED = ['requested', 'fulfilled'];

/** requests: listRequests() rows · reversals: [{ request_id, created_at }] */
export const requestFlow = ({ requests = [], reversals = [] }) => {
  const reversedAt = new Map();
  for (const r of reversals) {
    if (!reversedAt.has(r.request_id)) reversedAt.set(r.request_id, []);
    reversedAt.get(r.request_id).push(ms(r.created_at));
  }
  const cases = requests.map((r) => {
    const steps = [{ a: 'requested', at: ms(r.requested_at) }];
    for (const at of reversedAt.get(r.id) ?? []) steps.push({ a: 'reversed', at });
    if (r.outcome && r.outcome !== 'pending') steps.push({ a: r.outcome, at: ms(r.resolved_at) });
    const what = String(r.items_requested ?? '').replace(/\s+/g, ' ').slice(0, 40);
    return { id: r.id, label: `${r.caller_name || 'Unnamed caller'} · ${what}`, steps, attrs: { 'Weekday logged': weekdayOf(ms(r.requested_at)) } };
  });
  return pack('requests', 'Benevolent requests', 'requests', REQUEST_ACTIVITIES, REQUEST_EXPECTED, cases);
};

export const buildFlow = ({ orders, changes, deliveries, followUps, slips, events, movements, donations, donationItems, requests, reversals }) => ({
  processes: [
    lotFlow({ orders, deliveries, movements }),
    orderFlow({ orders, changes, deliveries, followUps }),
    palletFlow({ slips, events }),
    donationFlow({ donations, items: donationItems }),
    requestFlow({ requests, reversals }),
  ],
});

export default { buildFlow, orderFlow, palletFlow, lotFlow, donationFlow, requestFlow, MAX_CASES };

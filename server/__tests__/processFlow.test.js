// ─────────────────────────────────────────────────────────────
// __tests__/processFlow.test.js
//
// The event log behind the flow map. Each case must come out as the
// steps it really took, in order: repeats back to back folded, repeats
// that come back kept, and no time invented for a step whose time was
// never recorded.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { orderFlow, palletFlow, lotFlow, donationFlow, requestFlow, buildFlow, MAX_CASES } from '../src/features/reporting/processFlow.js';

const at = (day, time = '08:00') => `2026-09-${String(day).padStart(2, '0')}T${time}:00+02:00`;
const names = (process, c) => c.path.map((i) => process.activities[i].label);

const order = (over = {}) => ({
  id: 1, po_number: 'PO-2026-0001', supplier_name: 'Cape Dry Goods', status: 'completed',
  created_at: at(1), status_changed_at: at(4), ...over,
});
const slip = (over = {}) => ({
  id: 10, name: 'Sunrise Educare', dispatch_date: '2026-09-08', status: 'dispatched',
  created_at: at(7), completed_at: null, collected_at: null, gate_status: null, ...over,
});
const ev = (id, list) => list.map(([event_type, when]) => ({ picking_slip_id: id, event_type, created_at: when }));

describe('a purchase order as a path', () => {
  it('follows raised, approved, delivered, received in full, with the hours between', () => {
    const p = orderFlow({
      orders: [order()],
      changes: [{ purchase_order_id: 1, from_status: 'pending', to_status: 'approved', created_at: at(2) }],
      deliveries: [{ purchase_order_id: 1, status: 'recorded', created_at: at(4) }],
    });
    expect(names(p, p.cases[0])).toEqual(['Order raised', 'Approved', 'Delivery received', 'Received in full']);
    expect(p.cases[0].t).toEqual([0, 24, 72, 72]);
    expect(p.cases[0].path).toEqual(p.expected);
    expect(p.cases[0].label).toBe('PO-2026-0001 · Cape Dry Goods');
  });

  it('keeps an unlogged approval on the route, with no time', () => {
    const p = orderFlow({ orders: [order()], deliveries: [{ purchase_order_id: 1, status: 'recorded', created_at: at(4) }] });
    expect(names(p, p.cases[0])).toEqual(['Order raised', 'Approved', 'Delivery received', 'Received in full']);
    expect(p.cases[0].t).toEqual([0, null, 72, 72]);
  });

  it('does not put approval on an order still waiting for it', () => {
    const p = orderFlow({ orders: [order({ status: 'pending' })] });
    expect(names(p, p.cases[0])).toEqual(['Order raised']);
  });

  it('shows a short delivery, the follow-up order, and the second delivery', () => {
    const p = orderFlow({
      orders: [order({ status: 'completed' })],
      changes: [{ purchase_order_id: 1, from_status: 'pending', to_status: 'approved', created_at: at(2) }],
      deliveries: [
        { purchase_order_id: 1, status: 'recorded', created_at: at(4) },
        { purchase_order_id: 1, status: 'flagged', created_at: at(9) },
      ],
      followUps: [{ follow_up_of: 1, created_at: at(5) }],
    });
    expect(names(p, p.cases[0])).toEqual([
      'Order raised', 'Approved', 'Delivery received', 'Follow-up order raised', 'Delivery flagged', 'Received in full',
    ]);
  });

  it('marks an order still owed stock as delivered short', () => {
    const p = orderFlow({
      orders: [order({ status: 'partially_received' })],
      deliveries: [{ purchase_order_id: 1, status: 'recorded', created_at: at(4) }],
    });
    expect(names(p, p.cases[0])).toEqual(['Order raised', 'Approved', 'Delivery received', 'Delivered short']);
  });

  it('tells a reopening apart from the first approval, and shows an order sent back', () => {
    const p = orderFlow({
      orders: [order({ id: 1, status: 'approved' }), order({ id: 2, status: 'returned', status_changed_at: at(3) })],
      changes: [
        { purchase_order_id: 1, from_status: 'pending', to_status: 'approved', created_at: at(2) },
        { purchase_order_id: 1, from_status: 'approved', to_status: 'follow_up_required', created_at: at(3) },
        { purchase_order_id: 1, from_status: 'follow_up_required', to_status: 'approved', created_at: at(5) },
      ],
    });
    expect(names(p, p.cases[0])).toEqual(['Order raised', 'Approved', 'Follow-up needed', 'Reopened']);
    expect(names(p, p.cases[1])).toEqual(['Order raised', 'Sent back']);
  });
});

describe('a pallet as a path', () => {
  it('folds lines confirmed one after another into one step', () => {
    const p = palletFlow({
      slips: [slip()],
      events: ev(10, [
        ['generated', at(7, '08:00')], ['assigned', at(7, '09:00')], ['item_confirmed', at(7, '09:30')],
        ['item_confirmed', at(7, '09:40')], ['item_confirmed', at(7, '09:50')], ['completed', at(7, '12:00')],
        ['dispatched', at(8, '10:00')],
      ]),
    });
    expect(names(p, p.cases[0])).toEqual(['Slip raised', 'Claimed', 'Lines packed', 'Packed', 'Collected']);
    expect(p.cases[0].t).toEqual([0, 1, 1.5, 4, 26]);
    expect(p.cases[0].path).toEqual(p.expected);
  });

  it('keeps a step that comes back: claimed again, packing resumed after a flag', () => {
    const p = palletFlow({
      slips: [slip()],
      events: ev(10, [
        ['generated', at(7, '08:00')], ['assigned', at(7, '09:00')], ['item_confirmed', at(7, '09:30')],
        ['item_flagged', at(7, '09:40')], ['assigned', at(7, '10:00')], ['item_confirmed', at(7, '10:10')],
        ['stock_shortfall', at(7, '11:59')], ['completed', at(7, '12:00')], ['late_collected', at(9, '10:00')],
      ]),
    });
    expect(names(p, p.cases[0])).toEqual([
      'Slip raised', 'Claimed', 'Lines packed', 'Line flagged', 'Claimed', 'Lines packed', 'Stock short', 'Packed', 'Collected late',
    ]);
  });

  it('falls back on the slip and gate timestamps where there are no events', () => {
    const p = palletFlow({ slips: [slip({ completed_at: at(7, '12:00'), collected_at: at(8, '10:00'), gate_status: 'collected' })] });
    expect(names(p, p.cases[0])).toEqual(['Slip raised', 'Packed', 'Collected']);
  });

  it('does not call a written-off pallet collected', () => {
    const p = palletFlow({
      slips: [slip({ collected_at: at(9), gate_status: 'not_collected' })],
      events: ev(10, [['generated', at(7)], ['completed', at(7, '12:00')], ['not_collected', at(9)]]),
    });
    expect(names(p, p.cases[0])).toEqual(['Slip raised', 'Packed', 'Not collected']);
  });

  it('puts a finding before the result when both were logged in the same moment', () => {
    const p = palletFlow({
      slips: [slip()],
      events: ev(10, [
        ['generated', at(7)], ['completed', at(7, '12:00')], ['stock_shortfall', at(7, '12:00')],
        ['dispatched', at(9)], ['stock_shortfall', at(9)], ['wrong_day_collection', at(9)],
      ]),
    });
    expect(names(p, p.cases[0])).toEqual(['Slip raised', 'Stock short', 'Packed', 'Stock short', 'Came on another day', 'Collected']);
  });

  it('ignores events that are not a step of the pallet', () => {
    const p = palletFlow({ slips: [slip()], events: ev(10, [['generated', at(7)], ['no_order_lines', at(7, '08:01')], ['something_new', at(7, '08:02')]]) });
    expect(names(p, p.cases[0])).toEqual(['Slip raised']);
  });
});

describe('a delivered item, from its order to the pallets it left on', () => {
  const move = (product_id, quantity, movement_type, when, ref = {}) => ({
    product_id, product_name: 'Rice 2 kg', quantity, movement_type, created_at: when,
    reference_type: ref.type ?? null, reference_id: ref.id ?? null,
  });
  const note = (id, when) => ({ id, purchase_order_id: 1, status: 'recorded', created_at: when });
  const received = (qty, when, dn) => move(1, qty, 'received', when, { type: 'delivery_note', id: dn });
  const lots = (movements, over = {}) => lotFlow({
    orders: [order({ approved_at: at(2), expected_delivery_date: '2026-09-05', ...over })],
    deliveries: [note(50, at(4)), note(51, at(12))],
    movements,
  });

  it('follows the order onto a pallet and out, oldest stock first', () => {
    const p = lots([received(10, at(4), 50), move(1, -4, 'dispatched', at(8)), move(1, -6, 'dispatched', at(10))]);
    expect(names(p, p.cases[0])).toEqual(['Order raised', 'Approved', 'Delivered', 'Dispatched on a pallet', 'All of it gone']);
    expect(p.cases[0].t).toEqual([0, 24, 72, 168, 216]);
    expect(p.cases[0].path).toEqual(p.expected);
    expect(p.cases[0].label).toBe('PO-2026-0001 · Rice 2 kg');
    expect(p).toMatchObject({ estimate: true, label: 'Order to dispatch' });
  });

  it('gives what leaves to the older delivery first', () => {
    const p = lots([received(10, at(4), 50), received(10, at(12), 51), move(1, -12, 'dispatched', at(15))]);
    expect(names(p, p.cases[0]).slice(-2)).toEqual(['Dispatched on a pallet', 'All of it gone']);
    // Delivered a week after it was due, and two of its ten left.
    expect(names(p, p.cases[1])).toEqual(['Order raised', 'Approved', 'Delivered late', 'Dispatched on a pallet', 'Some still in stock']);
  });

  it('shows stock that was written off or never moved', () => {
    const p = lots([received(10, at(4), 50), move(1, -3, 'wastage', at(6)), move(1, -2, 'adjustment', at(7))]);
    expect(names(p, p.cases[0])).toEqual(['Order raised', 'Approved', 'Delivered', 'Written off', 'Count corrected', 'Some still in stock']);
    const idle = lots([received(10, at(4), 50)]);
    expect(names(idle, idle.cases[0])).toEqual(['Order raised', 'Approved', 'Delivered', 'Some still in stock']);
  });

  it('lets stock from elsewhere take its turn without being a case', () => {
    const p = lots([move(1, 5, 'donated', at(3)), received(10, at(4), 50), move(1, -5, 'dispatched', at(8))]);
    expect(p.cases).toHaveLength(1);
    expect(names(p, p.cases[0]).slice(-1)).toEqual(['Some still in stock']);
  });

  it('keeps an unlogged approval on the route with no time', () => {
    const p = lots([received(10, at(4), 50)], { approved_at: null });
    expect(p.cases[0].t.slice(0, 3)).toEqual([0, null, 72]);
  });
});

describe('a donation as a path', () => {
  const donation = (over = {}) => ({
    id: 5, donor_name: 'Hope Foods', status: 'committed', section_18a_status: 'issued',
    section_18a_issued_at: at(6), received_at: at(3), received_day: '2026-09-03', ...over,
  });

  it('follows received, classified, added to stock, certificate issued', () => {
    const p = donationFlow({
      donations: [donation()],
      items: [
        { donation_id: 5, routing_status: 'allocated', resolved_at: at(4) },
        { donation_id: 5, routing_status: 'allocated', resolved_at: at(4, '09:00') },
      ],
    });
    expect(names(p, p.cases[0])).toEqual(['Donation received', 'Items classified', 'Added to stock', 'Certificate issued']);
    expect(p.cases[0].path).toEqual(p.expected);
    expect(p.cases[0].label).toBe('Hope Foods · 2026-09-03');
  });

  it('shows what a donation is still waiting on', () => {
    const p = donationFlow({
      donations: [donation({ status: 'under_review', section_18a_status: 'qualifying_pending_donor', section_18a_issued_at: null, donor_name: null })],
      items: [{ donation_id: 5, routing_status: 'unmatched', resolved_at: null }],
    });
    expect(names(p, p.cases[0])).toEqual(['Donation received', 'Items still to classify', 'Waiting for donor details']);
    expect(p.cases[0].label).toBe('Donor not named · 2026-09-03');
  });
});

describe('a benevolent request as a path', () => {
  const request = (over = {}) => ({
    id: 9, caller_name: 'Nomsa', items_requested: 'Rice and  beans for a family of five', outcome: 'fulfilled',
    requested_at: at(3), resolved_at: at(4), ...over,
  });

  it('follows a request to how it ended', () => {
    const p = requestFlow({ requests: [request(), request({ id: 10, outcome: 'pending', resolved_at: null }), request({ id: 11, outcome: 'declined' })] });
    expect(p.cases.map((c) => names(p, c))).toEqual([
      ['Request logged', 'Fulfilled'], ['Request logged'], ['Request logged', 'Declined'],
    ]);
    expect(p.cases[0].t).toEqual([0, 24]);
    expect(p.cases[0].label).toBe('Nomsa · Rice and beans for a family of five');
  });

  it('shows a decision that was reversed', () => {
    const p = requestFlow({ requests: [request({ outcome: 'approved', resolved_at: at(6) })], reversals: [{ request_id: 9, created_at: at(5) }] });
    expect(names(p, p.cases[0])).toEqual(['Request logged', 'Decision reversed', 'Approved']);
  });
});

describe('the whole log', () => {
  it('holds every process, the main one first, and packing by that name', () => {
    const out = buildFlow({ orders: [order({ status: 'pending' })], slips: [slip()], events: [] });
    expect(out.processes.map((p) => [p.id, p.label, p.cases.length])).toEqual([
      ['order_to_dispatch', 'Order to dispatch', 0], ['orders', 'Purchase orders', 1], ['pallets', 'Packing', 1],
      ['donations', 'Donations', 0], ['requests', 'Benevolent requests', 0],
    ]);
  });

  it('keeps the most recent cases when there are too many, and says so', () => {
    const slips = Array.from({ length: MAX_CASES + 5 }, (_, i) => slip({ id: i + 1 }));
    const p = palletFlow({ slips });
    expect(p.cases).toHaveLength(MAX_CASES);
    expect(p.cases[0].id).toBe(6);
    expect(p).toMatchObject({ total: MAX_CASES + 5, truncated: true });
  });
});

// ─────────────────────────────────────────────────────────────
// __tests__/processFlow.test.js
//
// The event log behind the flow map. Each case must come out as the
// steps it really took, in order: repeats back to back folded, repeats
// that come back kept, and no time invented for a step whose time was
// never recorded.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { orderFlow, palletFlow, buildFlow, MAX_CASES } from '../src/features/reporting/processFlow.js';

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

describe('the whole log', () => {
  it('holds both processes', () => {
    const out = buildFlow({ orders: [order({ status: 'pending' })], slips: [slip()], events: [] });
    expect(out.processes.map((p) => [p.id, p.cases.length])).toEqual([['orders', 1], ['pallets', 1]]);
  });

  it('keeps the most recent cases when there are too many, and says so', () => {
    const slips = Array.from({ length: MAX_CASES + 5 }, (_, i) => slip({ id: i + 1 }));
    const p = palletFlow({ slips });
    expect(p.cases).toHaveLength(MAX_CASES);
    expect(p.cases[0].id).toBe(6);
    expect(p).toMatchObject({ total: MAX_CASES + 5, truncated: true });
  });
});

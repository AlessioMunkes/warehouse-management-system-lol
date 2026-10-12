// ─────────────────────────────────────────────────────────────
// __tests__/processMining.test.js
//
// The process map is arithmetic on timestamps, so it is tested as
// arithmetic: known rows in, known waits out. The two things it must
// never do are invent a time that was not recorded and present the
// shelf estimate as anything but oldest-first.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { buildProcess, shelfDwell, summarise } from '../src/features/reporting/processMining.js';

const at = (day, time = '08:00') => `2026-09-${String(day).padStart(2, '0')}T${time}:00+02:00`;
const RANGE = { from: '2026-09-01', to: '2026-09-30' };
const NOW = new Date(at(30, '18:00')).getTime();

const order = (over = {}) => ({
  id: 1, po_number: 'PO-2026-0001', supplier_name: 'Cape Dry Goods', status: 'completed',
  created_at: at(1), status_changed_at: at(4), expected_delivery_date: '2026-09-05',
  first_delivery: at(4), last_delivery: at(4), deliveries: 1, approved_at: at(2), ...over,
});
const slip = (over = {}) => ({
  id: 10, name: 'Sunrise Educare', cohort: 'tuesday', beneficiary_kind: 'ecd', status: 'dispatched',
  dispatch_date: '2026-09-08', created_at: at(7), completed_at: at(7, '12:00'),
  collected_at: at(8, '10:00'), gate_status: 'collected', ...over,
});
const events = (slipId, list) => list.map(([event_type, when]) => ({ picking_slip_id: slipId, event_type, created_at: when }));
const move = (product_id, quantity, movement_type, when, product_name = `Product ${product_id}`) => ({ product_id, product_name, quantity, movement_type, created_at: when });

const build = (input) => buildProcess({ orders: [], slips: [], events: [], movements: [], range: RANGE, now: NOW, ...input });
const lane = (out, id) => out.lanes.find((l) => l.id === id);
const step = (l, id) => l.transitions.find((t) => t.id === id);

describe('summarise', () => {
  it('gives the middle, the average and the slow end', () => {
    const out = summarise([1, 2, 3, 4, 10].map((hours, i) => ({ id: i, label: `c${i}`, hours })));
    expect(out).toMatchObject({ cases: 5, medianHours: 3, averageHours: 4, p90Hours: 7.6 });
    expect(out.slowest[0]).toMatchObject({ label: 'c4', hours: 10 });
  });

  it('leaves out a clock that ran backwards', () => {
    const out = summarise([{ id: 1, label: 'a', hours: -5 }, { id: 2, label: 'b', hours: 2 }]);
    expect(out).toMatchObject({ cases: 1, medianHours: 2 });
  });

  it('has no figures when nothing made the move', () => {
    expect(summarise([])).toMatchObject({ cases: 0, medianHours: null, averageHours: null, p90Hours: null, slowest: [] });
  });
});

describe('order to shelf', () => {
  it('times each step of an order that was approved, delivered and closed', () => {
    const inbound = lane(build({ orders: [order()] }), 'inbound');
    expect(step(inbound, 'raised_approved').medianHours).toBe(24);
    expect(step(inbound, 'approved_delivered').medianHours).toBe(48);
    expect(step(inbound, 'raised_delivered').medianHours).toBe(72);
    expect(inbound.steps.map((s) => s.cases)).toEqual([1, 1, 1, 1]);
    expect(inbound.variants).toEqual([{ label: 'Received in full, on time', cases: 1, share: 100 }]);
    expect(inbound.note).toBeNull();
  });

  it('does not guess an approval time that was never recorded', () => {
    const inbound = lane(build({ orders: [order({ approved_at: null })] }), 'inbound');
    expect(step(inbound, 'raised_approved')).toMatchObject({ cases: 0, medianHours: null });
    // Still counted as approved: it was delivered. Only the time is missing.
    expect(inbound.steps.find((s) => s.id === 'approved')).toMatchObject({ cases: 1, timed: 0 });
    expect(step(inbound, 'raised_delivered').medianHours).toBe(72);
    expect(inbound.note).toMatch(/recorded from this release/);
  });

  it('names the route each order took', () => {
    const inbound = lane(build({ orders: [
      order({ id: 1 }),
      order({ id: 2, first_delivery: at(9), last_delivery: at(9) }),
      order({ id: 3, status: 'partially_received' }),
      order({ id: 4, deliveries: 2, last_delivery: at(6) }),
      order({ id: 5, status: 'pending', first_delivery: null, last_delivery: null, deliveries: 0, approved_at: null }),
      order({ id: 6, status: 'approved', first_delivery: null, last_delivery: null, deliveries: 0 }),
      order({ id: 7, status: 'returned', first_delivery: null, last_delivery: null, deliveries: 0 }),
    ] }), 'inbound');
    const routes = Object.fromEntries(inbound.variants.map((v) => [v.label, v.cases]));
    expect(routes).toEqual({
      'Received in full, on time': 1,
      'Received in full, late': 1,
      'Partially received, balance outstanding': 1,
      'Multiple deliveries': 1,
      'Pending approval': 1,
      'Outstanding, overdue': 1,
      'Returned to supplier': 1,
    });
  });

  it('times the second delivery only for orders that had one', () => {
    const inbound = lane(build({ orders: [order({ id: 1 }), order({ id: 2, deliveries: 2, last_delivery: at(6) })] }), 'inbound');
    expect(step(inbound, 'delivered_complete')).toMatchObject({ cases: 1, medianHours: 48 });
  });

  it('ranks suppliers by how long they take', () => {
    const inbound = lane(build({ orders: [
      order({ id: 1 }),
      order({ id: 2, supplier_name: 'Slow Mills', first_delivery: at(11), last_delivery: at(11) }),
    ] }), 'inbound');
    expect(inbound.groups[0].rows.map((r) => [r.label, r.medianHours])).toEqual([['Slow Mills', 240], ['Cape Dry Goods', 72]]);
  });
});

describe('slip to dispatch note', () => {
  const walked = events(10, [
    ['generated', at(7, '08:00')], ['assigned', at(7, '09:00')], ['item_confirmed', at(7, '09:30')],
    ['item_confirmed', at(7, '10:00')], ['completed', at(7, '12:00')], ['dispatched', at(8, '10:00')],
  ]);

  it('times a pallet through every step', () => {
    const outbound = lane(build({ slips: [slip()], events: walked }), 'outbound');
    expect(step(outbound, 'generated_claimed').medianHours).toBe(1);
    expect(step(outbound, 'claimed_started').medianHours).toBe(0.5);
    expect(step(outbound, 'started_packed').medianHours).toBe(2.5);
    expect(step(outbound, 'packed_collected').medianHours).toBe(22);
    expect(step(outbound, 'generated_collected').medianHours).toBe(26);
    expect(outbound.steps.map((s) => s.cases)).toEqual([1, 1, 1, 1, 1]);
    expect(outbound.variants[0].label).toBe('Dispatched');
  });

  it('names the detours: re-claimed, flagged, short, late, not collected', () => {
    const outbound = lane(build({
      slips: [
        slip({ id: 10 }),
        slip({ id: 11, gate_status: 'late_collected' }),
        slip({ id: 12, gate_status: 'not_collected', collected_at: null, status: 'complete' }),
        slip({ id: 13, status: 'pending', completed_at: null, collected_at: null, gate_status: null }),
      ],
      events: [
        ...events(10, [['generated', at(7)], ['assigned', at(7, '09:00')], ['assigned', at(7, '09:20')], ['item_flagged', at(7, '10:00')], ['completed', at(7, '12:00')]]),
        ...events(11, [['generated', at(7)], ['assigned', at(7, '09:00')], ['stock_shortfall', at(7, '09:10')], ['completed', at(7, '12:00')]]),
        ...events(12, [['generated', at(7)], ['assigned', at(7, '09:00')], ['completed', at(7, '12:00')]]),
        ...events(13, [['generated', at(7)]]),
      ],
    }), 'outbound');
    expect(outbound.variants.map((v) => v.label).sort()).toEqual([
      'Dispatched, reassigned, line exception',
      'Late collection, stock shortfall',
      'Packed, uncollected',
      'Unassigned',
    ]);
    // The written-off pallet is not counted as collected.
    expect(outbound.steps.find((s) => s.id === 'collected').cases).toBe(2);
  });

  it('breaks the lane down by cohort and by who it was for', () => {
    const outbound = lane(build({
      slips: [slip(), slip({ id: 11, name: 'Hope Soup Kitchen', beneficiary_kind: 'soup_kitchen', cohort: 'thursday', collected_at: at(9, '08:00') })],
      events: [...walked, ...events(11, [['generated', at(7, '08:00')]])],
    }), 'outbound');
    expect(outbound.groups.find((g) => g.id === 'cohort').rows).toEqual([{ label: 'Tuesday', cases: 1, medianHours: 26 }]);
    expect(outbound.groups.find((g) => g.id === 'kind').rows.map((r) => r.label)).toEqual(['Soup kitchens', 'ECD centres']);
  });
});

describe('on the shelf, oldest first', () => {
  const window = { from: new Date(at(1, '00:00')).getTime(), to: new Date(at(30, '23:59')).getTime() };

  it('matches what leaves to the oldest stock still there', () => {
    const samples = shelfDwell([
      move(1, 10, 'received', at(1)),
      move(1, 10, 'received', at(5)),
      move(1, -15, 'dispatched', at(9)),
    ], window);
    // 10 from the 1st (8 days) and 5 from the 5th (4 days).
    expect(samples.map((s) => [s.weight, s.value])).toEqual([[10, 192], [5, 96]]);
  });

  it('lets wastage use up old stock without measuring it', () => {
    const samples = shelfDwell([
      move(1, 10, 'received', at(1)),
      move(1, 10, 'received', at(5)),
      move(1, -10, 'wastage', at(6)),
      move(1, -10, 'dispatched', at(9)),
    ], window);
    expect(samples).toEqual([{ product: 'Product 1', value: 96, weight: 10 }]);
  });

  it('replays earlier movements but only measures what left in the period', () => {
    const samples = shelfDwell([
      move(1, 10, 'received', '2026-08-01T08:00:00+02:00'),
      move(1, -4, 'dispatched', '2026-08-20T08:00:00+02:00'),
      move(1, -6, 'dispatched', at(2)),
    ], window);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ weight: 6, value: 32 * 24 });
  });

  it('does not measure stock the ledger says was never there', () => {
    expect(shelfDwell([move(1, -5, 'dispatched', at(3))], window)).toEqual([]);
  });

  it('weights the typical time by how much stock it stands for', () => {
    const shelf = lane(build({ movements: [
      move(1, 100, 'received', at(1)),
      move(2, 1, 'received', at(1)),
      move(1, -100, 'dispatched', at(3)),
      move(2, -1, 'dispatched', at(21)),
    ] }), 'shelf');
    expect(step(shelf, 'received_dispatched').medianHours).toBe(48);
    expect(shelf.estimate).toBe(true);
    expect(shelf.groups[0].rows[0]).toMatchObject({ label: 'Product 2', medianHours: 480 });
  });
});

describe('the whole process', () => {
  it('says it is empty when nothing happened', () => {
    const out = build({});
    expect(out.empty).toBe(true);
    expect(out.bottleneck).toBeNull();
    expect(out.endToEnd.medianHours).toBeNull();
  });

  it('finds the slowest step, ignoring steps too few cases went through', () => {
    const three = [1, 2, 3];
    const out = build({
      orders: three.map((id) => order({ id })),
      slips: three.map((id) => slip({ id })),
      events: three.flatMap((id) => events(id, [['generated', at(7, '08:00')], ['assigned', at(7, '09:00')], ['item_confirmed', at(7, '09:30')], ['completed', at(7, '12:00')]])),
      // One quantity that sat for weeks: an anecdote, not a bottleneck.
      movements: [move(1, 5, 'received', at(1)), move(1, -5, 'dispatched', at(29))],
    });
    expect(out.bottleneck).toMatchObject({ lane: 'inbound', id: 'approved_delivered', medianHours: 48 });
  });

  it('adds the three lanes up for the end-to-end time', () => {
    const out = build({
      orders: [order()],
      slips: [slip()],
      events: events(10, [['generated', at(7, '08:00')]]),
      movements: [move(1, 5, 'received', at(4)), move(1, -5, 'dispatched', at(8))],
    });
    expect(out.endToEnd.parts.map((p) => p.medianHours)).toEqual([72, 96, 26]);
    expect(out.endToEnd.medianHours).toBe(194);
  });
});

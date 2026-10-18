// ─────────────────────────────────────────────────────────────
// server/__tests__/shelfLots.test.js
//
// The estimate of which deliveries are still on the shelf
// (features/stock/shelfLots.js) and the queue under it
// (features/stock/fifoQueue.js). Every expected figure below is worked
// out by hand in the comment above it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { createFifoQueue } from '../src/features/stock/fifoQueue.js';
import {
  estimateShelfLots, liveLots, earliestLive, expiringWithin, expiringBeforeUse,
} from '../src/features/stock/shelfLots.js';

// A delivery line, a receipt of it, and the other movements.
const line = (id, note, expiry, received = 100) => ({
  id, delivery_note_id: note, expiry_date: expiry, received_quantity: received, received_on: '2026-09-01', supplier_name: 'Farm',
});
const recv = (note, quantity) => ({ quantity, movement_type: 'received', reference_type: 'delivery_note', reference_id: note });
const out = (quantity) => ({ quantity: -quantity, movement_type: 'dispatched', reference_type: 'dispatch_event', reference_id: 1 });
const wasted = (quantity) => ({ quantity: -quantity, movement_type: 'wastage', reference_type: null, reference_id: null });
const adjust = (quantity) => ({ quantity, movement_type: 'adjustment', reference_type: null, reference_id: null });
const donated = (quantity) => ({ quantity, movement_type: 'donated', reference_type: 'donation', reference_id: 3 });

const estimate = (args) => estimateShelfLots({ productId: 5, unit: 'kg', ...args });
const lefts = (result) => result.lots.map((l) => [l.lineId, l.left]);

describe('fifoQueue', () => {
  it('takes from the oldest lot first and drops a lot that runs out', () => {
    const q = createFifoQueue();
    const a = q.add({ left: 10 });
    const b = q.add({ left: 5 });
    // 12 out: all 10 of the oldest, then 2 of the next.
    expect(q.take(12)).toBe(0);
    expect(a.left).toBe(0);
    expect(b.left).toBe(3);
    expect(q.total()).toBe(3);
  });

  it('says what it could not cover, and tells the caller which lots were touched', () => {
    const q = createFifoQueue();
    q.add({ left: 4, name: 'a' });
    const touched = [];
    // 4 available, 7 wanted: 3 short.
    expect(q.take(7, (lot, taken) => touched.push([lot.name, taken]))).toBe(3);
    expect(touched).toEqual([['a', 4]]);
    expect(q.total()).toBe(0);
  });

  it('puts a lot at the front with addFirst', () => {
    const q = createFifoQueue();
    q.add({ left: 5, name: 'later' });
    q.addFirst({ left: 2, name: 'first' });
    const touched = [];
    q.take(3, (lot) => touched.push(lot.name));
    // The 2 at the front go, then 1 of the 5.
    expect(touched).toEqual(['first', 'later']);
    expect(q.total()).toBe(4);
  });
});

describe('estimateShelfLots', () => {
  it('takes what goes out from the oldest delivery', () => {
    // 100 + 50 in, 30 out: the first delivery has 70 left, the second all 50.
    const r = estimate({
      movements: [recv(10, 100), recv(11, 50), out(30)],
      lines: [line(1, 10, '2026-10-20'), line(2, 11, '2026-11-05', 50)],
      onHand: 120,
    });
    expect(lefts(r)).toEqual([[1, 70], [2, 50]]);
    expect(r.lots[0]).toMatchObject({ received: 100, expiryDate: '2026-10-20', unit: 'kg', estimated: true, dismissal: null, supplierName: 'Farm' });
    expect(r.usedUp).toBe(0);
  });

  it('drops a delivery that is used up and keeps the part of the next one that is left', () => {
    // 100 + 50 in; 100 out takes all of the first; 20 more takes 20 of the second: 30 left.
    const r = estimate({
      movements: [recv(10, 100), recv(11, 50), out(100), out(20)],
      lines: [line(1, 10, '2026-10-20'), line(2, 11, '2026-11-05', 50)],
      onHand: 30,
    });
    expect(lefts(r)).toEqual([[2, 30]]);
    expect(r.usedUp).toBe(1);
  });

  it('goes by the order received, not the order of the dates', () => {
    // The delivery received first expires last. 60 out comes from it (100 -> 40);
    // the second, which expires sooner, is untouched at 50.
    const r = estimate({
      movements: [recv(10, 100), recv(11, 50), out(60)],
      lines: [line(1, 10, '2026-12-01'), line(2, 11, '2026-11-01', 50)],
      onHand: 90,
    });
    expect(lefts(r)).toEqual([[1, 40], [2, 50]]);
    expect(earliestLive(r.lots, '2026-10-13').lineId).toBe(2);
  });

  it('takes a write-off or an adjustment down from the oldest too', () => {
    // 100 + 50 in; the count is corrected down by 20: the first has 80, the second 50.
    const r = estimate({
      movements: [recv(10, 100), recv(11, 50), adjust(-20)],
      lines: [line(1, 10, '2026-10-20'), line(2, 11, '2026-11-05', 50)],
      onHand: 130,
    });
    expect(lefts(r)).toEqual([[1, 80], [2, 50]]);
  });

  it('puts stock found by an adjustment at the back as a lot with no date', () => {
    // 100 in, 10 found, 105 wasted: the delivery goes, the found stock is down to 5 and has no date.
    const r = estimate({
      movements: [recv(10, 100), adjust(10), wasted(105)],
      lines: [line(1, 10, '2026-10-20')],
      onHand: 5,
    });
    expect(r.lots).toEqual([]);
    expect(r.usedUp).toBe(1);
  });

  it('lets a donation received first take its turn at the front of the queue', () => {
    // 40 donated, then 100 delivered, 30 out: the donation has 10 left, the delivery all 100.
    const r = estimate({
      movements: [donated(40), recv(10, 100), out(30)],
      lines: [line(1, 10, '2026-10-20')],
      onHand: 110,
    });
    expect(lefts(r)).toEqual([[1, 100]]);
  });

  it('holds the estimate to the balance when the ledger sums to more', () => {
    // 100 + 50 in = 150 but only 120 is in stock: the 30 missing comes off the oldest.
    const r = estimate({
      movements: [recv(10, 100), recv(11, 50)],
      lines: [line(1, 10, '2026-10-20'), line(2, 11, '2026-11-05', 50)],
      onHand: 120,
    });
    expect(lefts(r)).toEqual([[1, 70], [2, 50]]);
  });

  it('treats stock the ledger never recorded as the oldest', () => {
    // 100 in, 70 out leaves 30 on the ledger but 90 in stock: 60 were there before
    // the first movement. They go first, so the 70 out takes all 60 and 10 of the delivery: 90 left.
    const r = estimate({
      movements: [recv(10, 100), out(70)],
      lines: [line(1, 10, '2026-10-20')],
      onHand: 90,
    });
    expect(lefts(r)).toEqual([[1, 90]]);
  });

  it('copes with stock that went below nothing', () => {
    // 10 in, 15 out (5 short of anything), 20 in. Ledger 15 = balance 15, but the queue holds 20:
    // the 5 over comes off the oldest still there, the second delivery, leaving 15.
    const r = estimate({
      movements: [recv(10, 10), out(15), recv(11, 20)],
      lines: [line(1, 10, '2026-10-20', 10), line(2, 11, '2026-11-05', 20)],
      onHand: 15,
    });
    expect(lefts(r)).toEqual([[2, 15]]);
    expect(r.usedUp).toBe(1);
  });

  it('has no lots when nothing is in stock', () => {
    const movements = [recv(10, 100), out(100)];
    const lines = [line(1, 10, '2026-10-20')];
    expect(estimate({ movements, lines, onHand: 0 }).lots).toEqual([]);
    expect(estimate({ movements: [recv(10, 100)], lines, onHand: -5 }).lots).toEqual([]);
  });

  it('pairs two lines of one product on one delivery note in the order they were written', () => {
    // Note 7 carries 10 (expires 20 Oct) then 20 (expires 25 Oct). 10 out takes the first.
    const r = estimate({
      movements: [recv(7, 10), recv(7, 20), out(10)],
      lines: [line(12, 7, '2026-10-25', 20), line(11, 7, '2026-10-20', 10)],
      onHand: 20,
    });
    expect(lefts(r)).toEqual([[12, 20]]);
    expect(r.lots[0].received).toBe(20);
  });

  it('ignores a line that took nothing in, and one with no expiry', () => {
    // Line 1 was fully rejected (0 received), line 2 is not perishable.
    const r = estimate({
      movements: [recv(10, 50), recv(11, 40)],
      lines: [line(1, 10, '2026-10-20', 0), line(2, 11, null, 40), line(3, 10, '2026-10-22', 50)],
      onHand: 90,
    });
    expect(lefts(r)).toEqual([[3, 50]]);
  });

  it('takes the quantity from the movement, in the stock unit, not from the line', () => {
    // The line says 2 crates; the stock is counted in kg and the receipt put in 20.
    const r = estimate({
      movements: [recv(10, 20), out(5)],
      lines: [{ ...line(1, 10, '2026-10-20', 2), unit: 'crate' }],
      onHand: 15, unit: 'kg',
    });
    expect(r.lots[0]).toMatchObject({ received: 20, left: 15, unit: 'kg' });
  });

  it('counts a dated line no receipt can be found for, and says nothing about its stock', () => {
    const r = estimate({ movements: [], lines: [line(1, 10, '2026-10-20')], onHand: 40 });
    expect(r.lots).toEqual([]);
    expect(r.unplaced).toBe(1);
  });

  it('makes a receipt for a note with no line an undated lot', () => {
    const r = estimate({ movements: [recv(99, 30)], lines: [line(1, 10, '2026-10-20')], onHand: 30 });
    expect(r.lots).toEqual([]);
    expect(r.unplaced).toBe(1);
  });
});

describe('reading the lots', () => {
  const lot = (lineId, expiryDate, left = 10, dismissal = null) => ({ lineId, expiryDate, left, dismissal });
  const today = '2026-10-13';

  it('leaves out dismissed lots and past dates when asking for the earliest', () => {
    const lots = [lot(1, '2026-10-10'), lot(2, '2026-10-14', 10, { reason: 'gone' }), lot(3, '2026-10-20'), lot(4, '2026-10-18')];
    // 10 Oct is past, 14 Oct is dismissed: 18 Oct is the earliest left.
    expect(earliestLive(lots, today).lineId).toBe(4);
    expect(liveLots(lots).map((l) => l.lineId)).toEqual([1, 3, 4]);
    expect(earliestLive([lot(1, '2026-10-10')], today)).toBeNull();
  });

  it('finds the live lots expiring within a number of days, today included', () => {
    const lots = [lot(1, '2026-10-13'), lot(2, '2026-10-27'), lot(3, '2026-10-28'), lot(4, '2026-10-20', 10, { reason: 'x' })];
    // 13 Oct is day 0, 27 Oct is day 14, 28 Oct is day 15, and 20 Oct is dismissed.
    expect(expiringWithin(lots, today, 14).map((l) => l.lineId)).toEqual([1, 2]);
  });

  describe('expiringBeforeUse', () => {
    it('flags nothing when the stock is used by its date', () => {
      // 70 left, 10 a day, 7 days to go: exactly used.
      expect(expiringBeforeUse([lot(1, '2026-10-20', 70)], 10, today)).toBeNull();
    });

    it('flags the part that will not be used', () => {
      // 80 left, 7 days at 10 a day = 70 used: 10 expire.
      expect(expiringBeforeUse([lot(1, '2026-10-20', 80)], 10, today)).toEqual({ expiresOn: '2026-10-20', quantity: 10 });
    });

    it('counts what is ahead of a lot in the queue', () => {
      // First: 40, 4 days (40 used), fine. Second: 100, 12 days (120 usable) but 40 ahead
      // of it, so 140 - 120 = 20 expire; it holds 100, so 20.
      const lots = [lot(1, '2026-10-17', 40), lot(2, '2026-10-25', 100)];
      expect(expiringBeforeUse(lots, 10, today)).toEqual({ expiresOn: '2026-10-25', quantity: 20 });
    });

    it('adds the lots that are short together and gives the soonest date', () => {
      // First: 50 left, 3 days (30 used): 20 expire on 16 Oct. Second: 50, 5 days (50 usable)
      // with 50 ahead: 100 - 50 = 50 over, but it only holds 50: 50 expire.
      const lots = [lot(1, '2026-10-16', 50), lot(2, '2026-10-18', 50)];
      expect(expiringBeforeUse(lots, 10, today)).toEqual({ expiresOn: '2026-10-16', quantity: 70 });
    });

    it('never flags a dismissed lot, but it still takes its turn', () => {
      // The first, dismissed, would have had 20 expire; it is not flagged. The second has the
      // dismissed 50 ahead of it: 50 + 30 = 80, 7 days at 10 a day = 70 usable, so 10 expire.
      const lots = [lot(1, '2026-10-16', 50, { reason: 'checked' }), lot(2, '2026-10-20', 30)];
      expect(expiringBeforeUse(lots, 10, today)).toEqual({ expiresOn: '2026-10-20', quantity: 10 });
    });

    it('says nothing without a rate, and skips dates already past', () => {
      expect(expiringBeforeUse([lot(1, '2026-10-20', 80)], 0, today)).toBeNull();
      expect(expiringBeforeUse([lot(1, '2026-10-01', 80)], 10, today)).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────
// server/src/features/stock/shelfLots.js
//
// WHICH DELIVERIES ARE PROBABLY STILL ON THE SHELF, and how much of each.
//
// An expiry date is recorded per delivery line (delivery_note_items), but
// stock is one balance per product (stock_levels). So "the soonest expiry"
// taken across every line warns about deliveries whose stock has long
// gone out. Until batches are tracked, this works out an ESTIMATE:
//
//   - every movement of the product is replayed in order;
//   - what comes in becomes a lot, a delivery's lot carrying that line's
//     expiry date (the movement is paired with its delivery line through
//     the delivery note and the product);
//   - what goes out of any kind, dispatched, wasted, adjusted down, is
//     taken from the OLDEST RECEIVED lot first;
//   - the result is held to the balance in stock_levels: a ledger that
//     sums to less than the balance leaves an undated lot at the front, one
//     that sums to more has the oldest trimmed.
//
// WHAT IT CANNOT KNOW
//   Workers do not always take the soonest date first, and stock that
//   comes in any other way (a donation, a count correction, a reversed
//   benevolent request) records no date, so it waits at the back of the
//   queue as a lot with none. A manager can dismiss a warning the
//   estimate gets wrong (expiryDismissal.service.js).
//
// QUANTITIES come from the movements, which are already in the product's
// stock unit and hold only what was accepted. The delivery line is used
// only for its expiry date: its received_quantity is the physical count in
// the line's own unit.
//
// THE ONE PLACE A BATCH VERSION REPLACES. The repository
// (repositories/shelfLots.repository.js) loads the inputs, calls
// estimateShelfLots and attaches dismissals. When batches are tracked,
// that loader reads the batches instead and returns the same lots, and
// nothing that consumes them changes. `lineId` is the delivery line
// today; a batch key would sit beside it.
//
// No SQL and no clock here.
// ─────────────────────────────────────────────────────────────
import { createFifoQueue } from './fifoQueue.js';

const EPSILON = 1e-9;
const DAY = 86400000;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const day = (value) => String(value).slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${day(to)}T00:00:00Z`) - Date.parse(`${day(from)}T00:00:00Z`)) / DAY);

/**
 * One product's lots.
 *   movements  its stock_movements, oldest first: { quantity, movement_type, reference_type, reference_id }
 *   lines      its delivery lines: { id, delivery_note_id, expiry_date, received_quantity, received_on, supplier_name }
 *   onHand     its balance in stock_levels
 *   unit       the stock unit the quantities are in
 * Returns { lots, usedUp, unplaced }:
 *   lots       the dated lots with stock estimated left, in the order they were received
 *   usedUp     dated lots estimated fully gone
 *   unplaced   dated delivery lines no receipt movement could be found for
 */
export const estimateShelfLots = ({ productId = null, movements = [], lines = [], onHand = 0, unit = '' }) => {
  // The delivery lines of each note that took stock in, in the order they
  // were written, which is the order their movements were.
  const waiting = new Map();
  const placeable = [...lines].sort((a, b) => a.id - b.id).filter((l) => num(l.received_quantity) > 0);
  for (const line of placeable) {
    if (!waiting.has(line.delivery_note_id)) waiting.set(line.delivery_note_id, []);
    waiting.get(line.delivery_note_id).push(line);
  }

  const queue = createFifoQueue();
  const tracked = [];

  // A ledger that sums to less than the balance: the difference was there
  // before the first movement, so it is the oldest.
  const ledger = movements.reduce((sum, m) => sum + num(m.quantity), 0);
  const opening = num(onHand) - ledger;
  if (opening > EPSILON) queue.add({ line: null, received: opening, left: opening });

  for (const m of movements) {
    const quantity = num(m.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    if (quantity < 0) {
      // Anything the queue cannot cover left a shelf the ledger says was
      // empty: there is no lot to take it from.
      queue.take(-quantity);
      continue;
    }
    const isDelivery = m.movement_type === 'received' && m.reference_type === 'delivery_note';
    const line = isDelivery ? (waiting.get(m.reference_id)?.shift() ?? null) : null;
    const lot = queue.add({ line, received: quantity, left: quantity });
    if (line) tracked.push(lot);
  }

  // A ledger that sums to more than the balance, or a shelf the ledger
  // left emptier than it says: hold the queue to what is in stock.
  const excess = queue.total() - Math.max(num(onHand), 0);
  if (excess > EPSILON) queue.take(excess);

  const dated = tracked.filter((lot) => lot.line.expiry_date);
  const lots = [];
  let usedUp = 0;
  for (const lot of dated) {
    const left = round(lot.left);
    if (left <= 0) { usedUp += 1; continue; }
    lots.push({
      lineId: lot.line.id,
      productId,
      expiryDate: day(lot.line.expiry_date),
      receivedOn: lot.line.received_on ? day(lot.line.received_on) : null,
      supplierName: lot.line.supplier_name ?? null,
      received: round(lot.received),
      left,
      unit,
      estimated: true,
      dismissal: null,
    });
  }
  const placed = new Set(dated.map((lot) => lot.line.id));
  const unplaced = lines.filter((l) => l.expiry_date && num(l.received_quantity) > 0 && !placed.has(l.id)).length;
  return { lots, usedUp, unplaced };
};

/** Lots that still count towards a warning: stock left, not dismissed. */
export const liveLots = (lots) => lots.filter((lot) => lot.left > 0 && !lot.dismissal);

/** The live lot expiring soonest, today or later; null when there is none. */
export const earliestLive = (lots, today) => liveLots(lots)
  .filter((lot) => lot.expiryDate >= today)
  .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.lineId - b.lineId)[0] ?? null;

/** Live lots expiring from today up to `withinDays` days on, soonest first. */
export const expiringWithin = (lots, today, withinDays) => liveLots(lots)
  .filter((lot) => lot.expiryDate >= today && daysBetween(today, lot.expiryDate) <= withinDays)
  .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.lineId - b.lineId);

/**
 * Stock that would still be on the shelf when its date comes, at the rate
 * the product is being used: the lots are used up in the order received,
 * `perDay` a day, so a lot with more ahead of it than can be used before
 * its date holds some that will not be.
 * Returns the soonest such date and the quantity expected to expire
 * across all such lots, or null when everything is used in time. A
 * dismissed lot is never flagged, but still takes its turn in the queue.
 */
export const expiringBeforeUse = (lots, perDay, today) => {
  if (!(perDay > 0)) return null;
  let ahead = 0;
  let soonest = null;
  let quantity = 0;
  for (const lot of lots) {
    ahead += lot.left;
    if (lot.dismissal || lot.expiryDate < today) continue;
    const usable = perDay * daysBetween(today, lot.expiryDate);
    const unused = Math.min(lot.left, ahead - usable);
    if (unused > 0.005) {
      quantity += unused;
      if (soonest === null || lot.expiryDate < soonest) soonest = lot.expiryDate;
    }
  }
  return soonest === null ? null : { expiresOn: soonest, quantity: round(quantity) };
};

export default { estimateShelfLots, liveLots, earliestLive, expiringWithin, expiringBeforeUse };

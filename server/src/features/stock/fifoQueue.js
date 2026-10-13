// ─────────────────────────────────────────────────────────────
// server/src/features/stock/fifoQueue.js
//
// A first-in, first-out queue of quantities: stock comes in as a lot,
// and whatever goes out is taken from the oldest lot first. No SQL and
// no clock. The estimate of what is left of each delivery
// (shelfLots.js) replays a product's movements through one of these.
//
// The same replay is written out by hand in two process-mining places
// (shelfDwell in reporting/processMining.js, lotFlow in
// reporting/processFlow.js). Those are left as they are; this is the one
// the stock estimate uses, and they could be moved onto it later.
// ─────────────────────────────────────────────────────────────
const EPSILON = 1e-9;

export const createFifoQueue = () => {
  const lots = [];

  return {
    /** Put a lot at the back. `lot.left` is what it still holds. */
    add(lot) {
      lots.push(lot);
      return lot;
    },

    /** Put a lot at the front, ahead of everything already there. */
    addFirst(lot) {
      lots.unshift(lot);
      return lot;
    },

    /**
     * Take `quantity` from the oldest lots. `onTake(lot, taken)` is called
     * for each lot touched. A lot that runs out leaves the queue.
     * Returns what could not be taken because the queue ran dry.
     */
    take(quantity, onTake) {
      let need = quantity;
      while (need > EPSILON && lots.length) {
        const oldest = lots[0];
        const taken = Math.min(oldest.left, need);
        oldest.left -= taken;
        need -= taken;
        if (onTake) onTake(oldest, taken);
        if (oldest.left <= EPSILON) lots.shift();
      }
      return need > EPSILON ? need : 0;
    },

    /** Everything still held. */
    total() {
      return lots.reduce((sum, lot) => sum + lot.left, 0);
    },
  };
};

export default { createFifoQueue };

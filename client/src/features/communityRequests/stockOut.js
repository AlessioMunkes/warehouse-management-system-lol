// ─────────────────────────────────────────────────────────────
// client/src/features/communityRequests/stockOut.js
//
// Resolving a request never moves stock (LOG ONLY, BR-28), but goods
// can leave the warehouse when it is fulfilled. These helpers back the
// prompt that nudges someone to record that in Inventory:
//   - a manager is pointed at Inventory with the reason text to paste;
//   - a worker (who cannot adjust stock) flags it in the outcome note.
// No schema change, no endpoint, no notification type.
// ─────────────────────────────────────────────────────────────

export const STOCK_OUT_TAG = '[Stock out — manager to record]';

// Only these outcomes can mean goods left.
export const STOCK_OUT_OUTCOMES = ['fulfilled', 'partially_fulfilled'];

export const mayHaveStockOut = (outcome) => STOCK_OUT_OUTCOMES.includes(outcome);

// The text a manager pastes as the note on the Inventory adjustment.
export const stockOutReason = ({ id, callerName }) =>
  `Benevolent request #${id} — ${String(callerName ?? '').trim() || 'unnamed caller'}`;

// Appends the tag on its own line when the worker ticked the box.
export const withStockOutTag = (note, ticked) =>
  ticked ? `${String(note ?? '').trim()}\n${STOCK_OUT_TAG}` : note;

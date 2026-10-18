// ─────────────────────────────────────────────────────────────
// server/src/repositories/expiryWarning.repository.js
//
// Sponsor change request: capture an expiry date during receiving
// (already done — see the note on delivery_note_items.expiry_date in
// schema.sql) and warn the Warehouse Manager as
// perishable stock approaches it, two weeks out and again at one
// week out.
//
// WHAT THIS WARNS ON, AND WHAT IT DOESN'T
// expiry_date lives on delivery_note_items — one row per receiving
// line, not per unit of stock still on the shelf. Per-batch stock is not
// tracked: stock_levels is one balance per product. So which deliveries
// still have stock is ESTIMATED (features/stock/shelfLots.js, loaded by
// shelfLots.repository.js): stock is assumed to leave oldest-received
// first, and a delivery estimated to be used up is not warned about.
// A manager can dismiss the warning for a delivery the estimate has
// wrong; that delivery is left out here too, so it is never sent.
// Batch tracking would make the estimate exact, and only the loader would
// change.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { listExpiringLots } from './shelfLots.repository.js';

// ── Delivery lines entering a warning window ────────────────────
// withinDays: warn once expiry_date is this many days out or closer
// — but not already past, which is a different problem (spoiled
// stock still on the shelf) this job does not try to solve.
// Days are South African, like every screen.
const findApproachingExpiry = async (withinDays) => {
  const lots = await listExpiringLots({ withinDays });
  return lots.map((lot) => ({
    delivery_note_item_id: lot.lineId,
    expiry_date: lot.expiryDate,
    received_quantity: lot.received,
    quantity_left: lot.left,
    unit: lot.unit,
    product_id: lot.productId,
    product_name: lot.productName,
    sku: lot.sku,
  }));
};

// ── Has this exact warning already fired? ───────────────────────
// One notification per (delivery line, tier) — dedup by checking
// notifications directly rather than adding a warned-at column to
// delivery_note_items, since the notifications table already carries
// entity_type/entity_id/type for exactly this.
const warningAlreadySent = async (deliveryNoteItemId, type) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM notifications
      WHERE entity_type = 'delivery_note_item_expiry'
        AND entity_id   = $1
        AND type        = $2
      LIMIT 1`,
    [deliveryNoteItemId, type]
  );
  return rows.length > 0;
};

export default { findApproachingExpiry, warningAlreadySent };

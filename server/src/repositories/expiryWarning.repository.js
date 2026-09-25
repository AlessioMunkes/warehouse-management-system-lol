// ─────────────────────────────────────────────────────────────
// server/src/repositories/expiryWarning.repository.js
//
// Sponsor change request: capture an expiry date during receiving
// (already done — see the note on delivery_note_items.expiry_date in
// database.md, migration 018) and warn the Warehouse Manager as
// perishable stock approaches it, two weeks out and again at one
// week out.
//
// WHAT THIS WARNS ON, AND WHAT IT DOESN'T
// expiry_date lives on delivery_note_items — one row per receiving
// line, not per unit of stock still on the shelf. database.md is
// explicit that per-batch stock is "still open": stock_levels is one
// balance per product, so there is no data yet on how much of a given
// delivery is still on hand versus already dispatched or decanted.
// This warns on the DELIVERY LINE'S own expiry date regardless of
// remaining quantity, same as the receiving screen already records
// it — recorded, not enforced, per that same note. Tightening this to
// remaining-quantity-aware warnings is real future work that needs
// per-batch stock first, not something this file can do with the
// data that exists today.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

// ── Delivery lines entering a warning window ────────────────────
// withinDays: warn once expiry_date is this many days out or closer
// — but not already past, which is a different problem (spoiled
// stock still on the shelf) this job does not try to solve.
const findApproachingExpiry = async (withinDays) => {
  const { rows } = await pool.query(
    `SELECT
       dni.id             AS delivery_note_item_id,
       dni.expiry_date,
       dni.received_quantity,
       dni.unit,
       p.id               AS product_id,
       p.name             AS product_name,
       p.stock_keeping_unit AS sku
     FROM delivery_note_items dni
     JOIN products p ON p.id = dni.product_id
     WHERE dni.expiry_date IS NOT NULL
       AND dni.expiry_date >= CURRENT_DATE
       AND dni.expiry_date <= (CURRENT_DATE + $1::int)
     ORDER BY dni.expiry_date ASC`,
    [withinDays]
  );
  return rows;
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

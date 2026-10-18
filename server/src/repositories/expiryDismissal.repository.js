// ─────────────────────────────────────────────────────────────
// server/src/repositories/expiryDismissal.repository.js
//
// A manager's dismissal of an expiry warning for one delivery line
// (table expiry_warning_dismissals, migration 047). The estimate of what
// is left of each delivery can be wrong, and this is how a manager says so.
//
// WHAT IT ATTACHES TO is delivery_note_items.id, the same id the daily
// job's notifications use. Batches, when tracked, would add their own key
// beside it. Reading dismissals is shelfLots.repository.js's business, so
// every screen and the job see the same ones; these are the writes.
//
// EVERY FUNCTION TAKES THE CALLER'S CLIENT, like logAudit: the dismissal
// and the audit row describing it commit or roll back together.
// ─────────────────────────────────────────────────────────────

/** The delivery line, with its product, or null. */
const findLine = async (client, lineId) => {
  const { rows } = await client.query(
    `SELECT dni.id, dni.product_id, dni.expiry_date::text AS expiry_date, p.name AS product_name
       FROM delivery_note_items dni
       JOIN products p ON p.id = dni.product_id
      WHERE dni.id = $1`,
    [lineId]
  );
  return rows[0] ?? null;
};

/** Dismiss a line's warning. Throws Postgres 23505 when it is already dismissed. */
const insert = async (client, { lineId, reason, userId }) => {
  const { rows } = await client.query(
    `INSERT INTO expiry_warning_dismissals (delivery_note_item_id, reason, dismissed_by)
     VALUES ($1, $2, $3)
     RETURNING id, delivery_note_item_id, reason, dismissed_by, dismissed_at`,
    [lineId, reason, userId]
  );
  return rows[0];
};

/** Bring a dismissed warning back. Null when nothing was dismissed. */
const restore = async (client, { lineId, userId }) => {
  const { rows } = await client.query(
    `UPDATE expiry_warning_dismissals
        SET restored_by = $2, restored_at = now()
      WHERE delivery_note_item_id = $1 AND restored_at IS NULL
      RETURNING id, delivery_note_item_id, reason, dismissed_by, dismissed_at, restored_at`,
    [lineId, userId]
  );
  return rows[0] ?? null;
};

export default { findLine, insert, restore };

// ─────────────────────────────────────────────────────────────
// server/src/repositories/shelfLots.repository.js
//
// THE ONE LOADER for "which deliveries are probably still on the shelf".
// Reads a product's delivery lines, its movements, its balance and the
// warnings a manager has dismissed, and hands them to the estimate
// (features/stock/shelfLots.js). Every screen, report and the daily
// expiry job read lots from here, so they cannot disagree.
//
// WHEN BATCHES ARE TRACKED this is the file that changes: read the
// batches instead of replaying movements, return the same lots.
//
// Only products with stock on hand and at least one delivery line with an
// expiry date are loaded, and only their movements: a product with no
// expiry on record has nothing to warn about.
//
// A warehouse database that has not had migration 047 yet has no
// dismissals table. That reads as "nothing dismissed", so the screens keep
// working while the migration is waiting.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { estimateShelfLots, expiringWithin } from '../features/stock/shelfLots.js';

/** Today in South Africa, as 'YYYY-MM-DD'. */
export const todayInSAST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

const readDismissals = async (lineIds) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.delivery_note_item_id, d.reason, d.dismissed_at, d.dismissed_by,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), 'Unknown') AS dismissed_by_name
         FROM expiry_warning_dismissals d
         LEFT JOIN users u ON u.id = d.dismissed_by
        WHERE d.restored_at IS NULL AND d.delivery_note_item_id = ANY($1::int[])`,
      [lineIds]
    );
    return rows;
  } catch (err) {
    if (err.code === '42P01') return [];
    throw err;
  }
};

/**
 * Lots for every product with stock and a dated delivery (or just
 * `productIds`). Returns a Map of product id to
 * { lots, usedUp, unplaced, productName, sku }; a product with nothing to
 * say is not in it. Dismissed lots are INCLUDED, with `dismissal` set:
 * whoever shows a warning leaves them out with liveLots().
 */
export const loadShelfLots = async ({ productIds = null } = {}) => {
  const result = new Map();
  const { rows: lines } = await pool.query(
    `SELECT dni.id, dni.delivery_note_id, dni.product_id, dni.expiry_date::text AS expiry_date,
            dni.received_quantity, dn.delivery_date::text AS received_on,
            s.name AS supplier_name, p.name AS product_name, p.stock_keeping_unit AS sku
       FROM delivery_note_items dni
       JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
       JOIN products p ON p.id = dni.product_id
       JOIN stock_levels sl ON sl.product_id = dni.product_id AND sl.quantity_on_hand > 0
       LEFT JOIN suppliers s ON s.id = dn.supplier_id
      WHERE dni.received_quantity > 0
        AND dni.product_id IN (SELECT product_id FROM delivery_note_items WHERE expiry_date IS NOT NULL)
        AND ($1::int[] IS NULL OR dni.product_id = ANY($1::int[]))
      ORDER BY dni.product_id, dni.id`,
    [productIds]
  );
  if (lines.length === 0) return result;

  const ids = [...new Set(lines.map((l) => l.product_id))];
  const [levels, movements, dismissals] = await Promise.all([
    pool.query(`SELECT product_id, quantity_on_hand, unit FROM stock_levels WHERE product_id = ANY($1::int[])`, [ids]),
    pool.query(
      `SELECT product_id, quantity, movement_type, reference_type, reference_id
         FROM stock_movements WHERE product_id = ANY($1::int[])
        ORDER BY product_id, created_at, id`,
      [ids]
    ),
    readDismissals(lines.filter((l) => l.expiry_date).map((l) => l.id)),
  ]);

  const levelOf = new Map(levels.rows.map((r) => [r.product_id, r]));
  const dismissalOf = new Map(dismissals.map((d) => [d.delivery_note_item_id, {
    id: d.id, by: d.dismissed_by, byName: d.dismissed_by_name, at: d.dismissed_at, reason: d.reason,
  }]));
  const linesOf = new Map();
  for (const line of lines) {
    if (!linesOf.has(line.product_id)) linesOf.set(line.product_id, []);
    linesOf.get(line.product_id).push(line);
  }
  const movementsOf = new Map();
  for (const m of movements.rows) {
    if (!movementsOf.has(m.product_id)) movementsOf.set(m.product_id, []);
    movementsOf.get(m.product_id).push(m);
  }

  for (const productId of ids) {
    const productLines = linesOf.get(productId);
    const level = levelOf.get(productId);
    const estimate = estimateShelfLots({
      productId,
      movements: movementsOf.get(productId) ?? [],
      lines: productLines,
      onHand: Number(level?.quantity_on_hand ?? 0),
      unit: level?.unit ?? '',
    });
    const { product_name: productName, sku } = productLines[0];
    result.set(productId, {
      ...estimate,
      productName,
      sku,
      lots: estimate.lots.map((lot) => ({ ...lot, productName, sku, dismissal: dismissalOf.get(lot.lineId) ?? null })),
    });
  }
  return result;
};

/**
 * Every live lot expiring from today up to `withinDays` days on, across
 * all products, soonest first. What the daily job and the reports list.
 */
export const listExpiringLots = async ({ withinDays, today = todayInSAST() }) => {
  const byProduct = await loadShelfLots();
  return [...byProduct.values()]
    .flatMap(({ lots }) => expiringWithin(lots, today, withinDays))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.lineId - b.lineId);
};

export default { loadShelfLots, listExpiringLots, todayInSAST };

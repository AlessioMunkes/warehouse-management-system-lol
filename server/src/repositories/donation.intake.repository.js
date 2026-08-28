// ─────────────────────────────────────────────────────────────
// server/src/repositories/donation.repository.js
//
// CONVERSATION CONTEXT & RATIONALE:
// - Streamlined repository structure removing all unused batch and flag dependencies.
// - Non-food/non-stock items (like supplies, cleaning materials) completely bypass 
//   inventory tables because they are non-stock and should never touch stock balances.
// - Retains core database queries for product master data, routing rules, and stock level upserts.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../../../server/env.example'})
/**
 * Fetches product details and its default donation category routing.
 * @param {Object} [client] - Optional database client for transaction scope
 * @param {number} productId 
 */
export const getProductWithRoutingDefault = async (client, productId) => {
  const dbClient = client || pool;
  const query = `
    SELECT p.id, p.name, p.stock_keeping_unit, p.storage_type, d.donation_category AS default_category
    FROM products p
    LEFT JOIN donation_routing_defaults d ON d.product_id = p.id
    WHERE p.id = $1 AND p.is_active = true;
  `;
  const res = await dbClient.query(query, [productId]);
  return res.rows[0] || null;
};

/**
 * Resolves routing outcome and storage area for a category from route rules table.
 * @param {Object} [client] - Optional database client for transaction scope
 * @param {string} category 
 */
export const getCategoryRoutingRule = async (client, category) => {
  const dbClient = client || pool;
  const query = `
    SELECT routing_outcome, storage_area, description
    FROM donation_category_routing
    WHERE category = $1 AND is_active = true;
  `;
  const res = await dbClient.query(query, [category]);
  return res.rows[0] || null;
};

/**
 * Upserts quantity_on_hand in the existing stock_levels table for ECD items.
 * Only invoked for food items that require stock accumulation (recipe_food, add_on_food).
 * 
 * @param {Object} [client] - Database client for transaction scope
 * @param {number} productId 
 * @param {number} quantityKg 
 */
export const upsertInventoryLevel = async (client, productId, quantityKg) => {
  const dbClient = client || pool;
  const query = `
    INSERT INTO stock_levels (product_id, quantity_on_hand, unit, updated_at)
    VALUES ($1, $2, 'kg', NOW())
    ON CONFLICT (product_id)
    DO UPDATE SET 
      quantity_on_hand = stock_levels.quantity_on_hand + EXCLUDED.quantity_on_hand,
      updated_at = NOW()
    RETURNING product_id, quantity_on_hand;
  `;
  const res = await dbClient.query(query, [productId, quantityKg]);
  return res.rows[0];
};

export default {
  getProductWithRoutingDefault,
  getCategoryRoutingRule,
  upsertInventoryLevel,
};
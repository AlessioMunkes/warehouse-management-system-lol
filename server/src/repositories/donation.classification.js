// ─────────────────────────────────────────────────────────────
// server/src/repositories/donationClassification.repository.js
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';

/**
 * Fetch all active category routing rules
 */
const getAllCategoryRoutings = async () => {
  const query = `
    SELECT 
      r.category,
      r.routing_outcome,
      r.storage_area,
      r.description,
      r.is_active,
      r.updated_by,
      u.first_name AS updated_by_name,
      r.updated_at
    FROM donation_category_routing r
    LEFT JOIN users u ON u.id = r.updated_by
    WHERE r.is_active = true
    ORDER BY r.category ASC;
  `;
  const result = await pool.query(query);
  return result.rows;
};

/**
 * Fetch a single category routing rule by category name
 */
const getRoutingByCategory = async (category) => {
  if (!category || typeof category !== 'string' || !category.trim()) {
    throw new Error('Category lookup requires a non-empty category string.');
  }

  const query = `
    SELECT 
      category,
      routing_outcome,
      storage_area,
      description,
      is_active,
      updated_by,
      updated_at
    FROM donation_category_routing
    WHERE category = $1 AND is_active = true;
  `;
  const result = await pool.query(query, [category.trim()]);
  return result.rows[0] || null;
};

/**
 * Update category routing rule
 */
const updateCategoryRouting = async ({ category, routingOutcome, storageArea = null, description = null, updatedBy }) => {
  if (!category || typeof category !== 'string' || !category.trim()) {
    throw new Error('Category update requires a valid category identifier.');
  }
  if (!routingOutcome || typeof routingOutcome !== 'string' || !routingOutcome.trim()) {
    throw new Error('Routing outcome label is required.');
  }
  if (!updatedBy || (typeof updatedBy !== 'number' && typeof updatedBy !== 'string')) {
    throw new Error('A valid user ID (updatedBy) is required for audit logging.');
  }

  const query = `
    UPDATE donation_category_routing
    SET 
      routing_outcome = $1,
      storage_area     = $2,
      description      = COALESCE($3, description),
      updated_by       = $4,
      updated_at       = NOW()
    WHERE category = $5
    RETURNING category, routing_outcome, storage_area, description, is_active, updated_by, updated_at;
  `;

  const result = await pool.query(query, [
    routingOutcome.trim(),
    storageArea ? storageArea.trim() : null,
    description ? description.trim() : null,
    updatedBy,
    category.trim()
  ]);

  return result.rows[0] || null;
};

export default {
  getAllCategoryRoutings,
  getRoutingByCategory,
  updateCategoryRouting,
};
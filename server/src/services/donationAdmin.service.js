// ─────────────────────────────────────────────────────────────
// server/src/services/donationAdmin.service.js
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { determineRouting } from '../lib/donationRouting.js';
import classificationRepo from '../repositories/donation.classification.js';
import productRepo        from '../repositories/product.repository.js';

// Standard helper to throw HTTP-friendly errors that our controllers can map easily
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

class DonationAdminService {
  /**
   * Pulls all active category-level routing rules for admin configuration views.
   */
  async getAllCategoryRoutings() {
    return await classificationRepo.getAllCategoryRoutings();
  }

  /**
   * Pulls the product catalog along with any preset donation categories.
   */
  async getAllProductsWithDefaults() {
    return await productRepo.getAllProductsWithDefaults();
  }

  async getPendingClassifications({ countOnly = false } = {}) {
    if (countOnly) {
      return { count: await productRepo.getPendingClassifications({ countOnly: true }) };
    }
    return await productRepo.getPendingClassifications({ countOnly: false });
  }

  // Accepts an optional transaction client so callers that already hold a
  // lock on the warehouse_manager_flags row (e.g. resolveFlagAndMaybeCommit's
  // SELECT ... FOR UPDATE) can run this logic on the SAME connection.
  // Without this, the internal pool.query UPDATE below blocks on the caller's
  // row lock from a second connection — a self-deadlock surfacing as a
  // statement timeout. Defaults to the shared pool for standalone callers
  // (e.g. the Flow B admin classification endpoint), preserving old behavior.
  async finalizePendingClassification({ flagId, name, sku, storageType, defaultUnit, category, updatedBy }, client = pool) {
    const normalizedFlagId = Number(flagId);
    if (!Number.isInteger(normalizedFlagId) || normalizedFlagId <= 0) {
      fail(400, 'Flag ID must be a valid positive integer.');
    }

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      fail(400, 'A product name is required to finalize an unrecognized item.');
    }

    const normalizedSku = String(sku || '').trim() || `PENDING-${normalizedFlagId}`;
    const normalizedDefaultUnit = String(defaultUnit || '').trim() || 'kg';
    const normalizedStorageType = ['dry', 'cold'].includes(String(storageType || '').trim())
      ? String(storageType).trim()
      : 'dry';

    const allowedCategories = ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'];
    if (category && !allowedCategories.includes(category)) {
      fail(400, 'Category must be one of: ' + allowedCategories.join(', '));
    }

    const flagRes = await client.query(
      `SELECT id, product_id, quantity_kg, reason, target_location, status
       FROM warehouse_manager_flags
       WHERE id = $1 AND status = 'pending_classification';`,
      [normalizedFlagId]
    );

    if (!flagRes.rows[0]) {
      fail(404, `No pending classification found for flag ${normalizedFlagId}.`);
    }

    const productId = Number(flagRes.rows[0].product_id);

    const productResult = await client.query(
      `UPDATE products
       SET name = $1,
           stock_keeping_unit = $2,
           storage_type = $3,
           default_unit = $4,
           is_active = true
       WHERE id = $5
       RETURNING id, name, stock_keeping_unit AS sku, storage_type, default_unit, is_active;`,
      [trimmedName, normalizedSku, normalizedStorageType, normalizedDefaultUnit, productId]
    );

    const result = await client.query(
      `UPDATE warehouse_manager_flags
      SET status = 'resolved', updated_at = NOW()
       WHERE id = $1 AND status = 'pending_classification'
       RETURNING id, product_id, status;`,
      [normalizedFlagId]
    );

    if (category) {
      await productRepo.upsertProductRoutingDefault({
        productId,
        donationCategory: category,
        setBy: updatedBy,
      }, client);
    }

    return {
      product: productResult.rows[0],
      flag: result.rows[0],
      message: 'Unrecognized item finalized and marked as resolved.',
    };
  }

  async setProductClassification({ productId, category, updatedBy }) {
  if (!Number.isInteger(Number(productId)) || Number(productId) <= 0) {
    fail(400, 'Product ID must be a valid positive integer.');
  }
  const allowedCategories = ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'];
  if (!allowedCategories.includes(category)) {
    fail(400, 'Category must be one of: ' + allowedCategories.join(', '));
  }
  return await productRepo.upsertProductRoutingDefault({
    productId: Number(productId),
    donationCategory:category,
   setBy: updatedBy,
  });
}

async removeProductClassification(productId) {
  if (!Number.isInteger(Number(productId)) || Number(productId) <= 0) {
    fail(400, 'Product ID must be a valid positive integer.');
  }
  const result = await productRepo.deleteProductRoutingDefault(Number(productId));
  if (!result.success) {
    fail(404, `No classification exists for product ${productId} to remove.`);
  }
  return result;
}
async updateCategoryRule({ category, routingOutcome, storageArea, description, updatedBy }) {
  const allowedCategories = ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'];
  if (!allowedCategories.includes(category)) {
    fail(400, 'Category must be one of: ' + allowedCategories.join(', '));
  }

  const allowedStorageAreas = [
    'cold_room',
    'dry_store',
    'fts_section',
    'mezzanine',
    'boardroom',
    'Soup Kitchen Prep',
    'Mezzanine or Boardroom storage',
  ];
  if (storageArea && !allowedStorageAreas.includes(storageArea)) {
    fail(400, 'Storage area must be one of: ' + allowedStorageAreas.join(', '));
  }

  const updated = await classificationRepo.updateCategoryRouting({
    category, routingOutcome, storageArea, description, updatedBy,
  });
  if (!updated) fail(404, `No routing rule found for category '${category}'.`);
  return updated;
}

  /**
   * Figures out how a donation item should be routed based on strict priority.
   * 
   * The logic flow works like this:
   * 1. If a product ID is provided, check if it has a pre-configured classification default.
   *    Pre-classified products always take priority over manual typing!
   * 2. If no product preset exists (or no product ID was given), fall back to whatever 
   *    category was explicitly passed in (e.g. worker manually selected it).
   * 3. If we still have no category, we drop back to 'unclassified' and flag it for manual review.
   * 4. Finally, we take whatever category we resolved and grab its actual routing outcome 
   *    from the database rules table.
   */
  async determineRouting({ productId, category }) {
    const result = await determineRouting({ productId, category });
    return result;
  }
}

export default new DonationAdminService();
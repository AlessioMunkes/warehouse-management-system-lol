// ─────────────────────────────────────────────────────────────
// server/src/services/donationAdmin.service.js
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { determineRouting } from '../utils/donationRouting.js';
import classificationRepo from '../repositories/donation.classification.js';
import productRepo        from '../repositories/product.repository.js';
import managerFlagRepo    from '../repositories/managerFlag.repository.js';
import { DONATION_CATEGORIES } from '../constants/donationCategories.js';
import { STORAGE_AREAS } from '../constants/storageAreas.js';

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

    const allowedCategories = DONATION_CATEGORIES;
    if (category && !allowedCategories.includes(category)) {
      fail(400, 'Category must be one of: ' + allowedCategories.join(', '));
    }

    const pendingFlag = await managerFlagRepo.findPendingClassificationFlag(client, normalizedFlagId);

    if (!pendingFlag) {
      fail(404, `No pending classification found for flag ${normalizedFlagId}.`);
    }

    const placeholderProductId = Number(pendingFlag.product_id);

    const existingProduct = await managerFlagRepo.findProductByNameExcept(client, trimmedName, placeholderProductId);
    const productId = existingProduct ? Number(existingProduct.id) : placeholderProductId;

    if (existingProduct) {
      await managerFlagRepo.setFlagProduct(client, normalizedFlagId, productId);
    }

    const product = existingProduct ?? await managerFlagRepo.promotePlaceholderProduct(client, placeholderProductId, {
      name: trimmedName,
      sku: normalizedSku,
      storageType: normalizedStorageType,
      defaultUnit: normalizedDefaultUnit,
    });

    const resolvedFlag = await managerFlagRepo.markClassificationFlagResolved(client, normalizedFlagId);

    if (category) {
      await productRepo.upsertProductRoutingDefault({
        productId,
        donationCategory: category,
        setBy: updatedBy,
      }, client);
    }

    return {
      product,
      flag: resolvedFlag,
      message: 'Unrecognized item finalized and marked as resolved.',
    };
  }

  async setProductClassification({ productId, category, updatedBy }) {
  if (!Number.isInteger(Number(productId)) || Number(productId) <= 0) {
    fail(400, 'Product ID must be a valid positive integer.');
  }
  const allowedCategories = DONATION_CATEGORIES;
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
  const allowedCategories = DONATION_CATEGORIES;
  if (!allowedCategories.includes(category)) {
    fail(400, 'Category must be one of: ' + allowedCategories.join(', '));
  }

  // The five areas, plus the two older free-text names some routing
  // rules still hold.
  const allowedStorageAreas = [
    ...STORAGE_AREAS,
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

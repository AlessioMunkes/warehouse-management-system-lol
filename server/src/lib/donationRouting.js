import classificationRepo from '../repositories/donation.classification.js';
import productRepo from '../repositories/product.repository.js';

export const determineRouting = async ({ productId, category } = {}) => {
  let resolvedCategory = null;
  let source = null;

  if (productId !== undefined && productId !== null && productId !== '') {
    const parsedId = Number(productId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      throw new Error('Product ID must be a valid positive integer for routing.');
    }

    const productDefault = await productRepo.getProductRoutingDefault(parsedId);
    if (productDefault?.donation_category) {
      resolvedCategory = productDefault.donation_category;
      source = 'product_default';
    }
  }

  if (!resolvedCategory && category) {
    const trimmedCategory = String(category).trim();
    if (trimmedCategory) {
      resolvedCategory = trimmedCategory;
      source = 'manual_category';
    }
  }

  if (!resolvedCategory) {
    return {
      source: 'unclassified',
      category: null,
      routing_outcome: 'manual_review',
      storage_area: null,
    };
  }

  const categoryRule = await classificationRepo.getRoutingByCategory(resolvedCategory);
  if (!categoryRule) {
    return {
      source: 'unclassified',
      category: resolvedCategory,
      routing_outcome: 'manual_review',
      storage_area: null,
    };
  }

  return {
    source,
    category: resolvedCategory,
    routing_outcome: categoryRule.routing_outcome,
    storage_area: categoryRule.storage_area,
  };
};

export default { determineRouting };

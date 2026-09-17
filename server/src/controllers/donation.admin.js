// ─────────────────────────────────────────────────────────────
// server/src/controllers/donationAdmin.controller.js
// Hardened to 10/10 Production Security Standard with Conversational Comments
// ─────────────────────────────────────────────────────────────
import donationAdminService from '../services/donationAdmin.service.js';
import { ROLES } from '../middleware/auth.middleware.js';

/**
 * Authorization Helper for Administrative Endpoints
 *
 * Ensures that only users with 'admin' or 'manager' roles can access
 * sensitive classification and routing rule configurations.
 *
 * Pulls role strings from the shared ROLES constant (auth.middleware.js)
 * instead of hardcoding them here. This used to be a separate hand-typed
 * array ('warehouse_manager', etc.) that drifted out of sync with the
 * real users.role values and with the requireRole() middleware used at
 * the route level — importing ROLES keeps both checks reading from the
 * same source of truth.
 */
const authorizeAdminOrManager = (req, res) => {
  if (!req.user || !req.user.id) {
    return {
      authorized: false,
      status: 401,
      message: 'Authentication required. Please log in.',
    };
  }

  const authorizedRoles = [ROLES.ADMIN, ROLES.MANAGER];
  if (!authorizedRoles.includes(req.user.role)) {
    return {
      authorized: false,
      status: 403,
      message: 'Access denied. Administrator or Manager privileges required.',
    };
  }

  return { authorized: true };
};

/**
 * GET /api/donations/admin/category-routing
 * Retrieves all BR-10 category routing rules for administrative oversight.
 */
export const getCategoryRoutings = async (req, res, next) => {
  try {
    const authCheck = authorizeAdminOrManager(req, res);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const rules = await donationAdminService.getAllCategoryRoutings();
    return res.status(200).json({
      success: true,
      data: rules,
    });
  } catch (error) {
    console.error('[DonationAdminController] Error fetching category routings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve category routing rules.',
    });
  }
};

/**
 * PATCH /api/donations/admin/category-routing/:category
 * Updates a single category's routing outcome / storage area / description.
 * This is category-level config (affects every product in that category),
 * distinct from per-product classification below.
 */
export const updateCategoryRouting = async (req, res, next) => {
  try {
    const authCheck = authorizeAdminOrManager(req, res);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { category } = req.params;
    const { routingOutcome, storageArea, description } = req.body;

    const result = await donationAdminService.updateCategoryRule({
      category,
      routingOutcome,
      storageArea,
      description,
      updatedBy: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[DonationAdminController] Error updating category routing:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to update category routing rule.',
    });
  }
};

/**
 * GET /api/donations/admin/products-with-defaults
 * Retrieves products merged with their default classification presets.
 */
export const getProductsWithDefaults = async (req, res, next) => {
  try {
    const authCheck = authorizeAdminOrManager(req, res);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }
 
    const products = await donationAdminService.getAllProductsWithDefaults();
    return res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error('[DonationAdminController] Error fetching products with defaults:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve products with classification defaults.',
    });
  }
};

export const getPendingClassifications = async (req, res, next) => {
  try {
    const authCheck = authorizeAdminOrManager(req, res);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const countOnly = String(req.query.countOnly || '').toLowerCase() === 'true';
    const result = await donationAdminService.getPendingClassifications({ countOnly });

    if (countOnly) {
      return res.status(200).json({ success: true, count: result.count });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[DonationAdminController] Error fetching pending classifications:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to retrieve pending classifications.',
    });
  }
};

export const finalizePendingClassification = async (req, res, next) => {
  try {
    const authCheck = authorizeAdminOrManager(req, res);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { id } = req.params;
    const { name, sku, storageType, defaultUnit, category } = req.body;

    const result = await donationAdminService.finalizePendingClassification({
      flagId: id,
      name,
      sku,
      storageType,
      defaultUnit,
      category,
      updatedBy: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Pending classification finalized successfully.',
    });
  } catch (error) {
    console.error('[DonationAdminController] Error finalizing pending classification:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to finalize the pending classification.',
    });
  }
};

/**
 * PUT /api/donations/admin/products/:id/classification
 * Sets (or overwrites) a single product's default donation category.
 * This is per-product config — separate from the category-level rules above.
 */
export const setProductClassification = async (req, res, next) => {
  try {
    const authCheck = authorizeAdminOrManager(req, res);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { id } = req.params;
    const { category } = req.body;

    const result = await donationAdminService.setProductClassification({
      productId: id,
      category,
      updatedBy: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[DonationAdminController] Error setting product classification:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to set product classification.',
    });
  }
};

/**
 * DELETE /api/donations/admin/products/:id/classification
 * Removes a product's preset classification. The product falls back to
 * manual category selection at intake time once this is gone.
 * Returns 404 if the product had no classification to remove (the
 * service layer surfaces this distinctly rather than treating it as
 * a silent no-op success).
 */
export const removeProductClassification = async (req, res, next) => {
  try {
    const authCheck = authorizeAdminOrManager(req, res);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { id } = req.params;
    const result = await donationAdminService.removeProductClassification(id);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Classification removed.',
    });
  } catch (error) {
    console.error('[DonationAdminController] Error removing product classification:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to remove product classification.',
    });
  }
};

/**
 * POST /api/donations/admin/evaluate-routing
 * Dynamically evaluates routing outcomes with strict input validation.
 * Useful as a "preview" endpoint — lets an admin check what routing
 * would result for a given product/category combo without actually
 * performing a donation intake.
 */
export const evaluateRouting = async (req, res, next) => {
  try {
    const authCheck = authorizeAdminOrManager(req, res);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const { productId, category } = req.body;

    // Strict Input Validation: ensure productId is a positive integer if provided
    let parsedProductId = null;
    if (productId !== undefined && productId !== null) {
      parsedProductId = Number(productId);
      if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid productId format. Must be a positive integer.',
        });
      }
    }

    // Strict Whitelist Validation for category strings
    const allowedCategories = ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'];
    const sanitizedCategory = category ? String(category).trim() : null;
    if (sanitizedCategory && !allowedCategories.includes(sanitizedCategory)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category supplied for evaluation.',
      });
    }

    const result = await donationAdminService.determineRouting({
      productId: parsedProductId,
      category: sanitizedCategory,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[DonationAdminController] Error evaluating routing:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to evaluate donation routing.',
    });
  }
};

export default {
  getCategoryRoutings,
  updateCategoryRouting,
  getProductsWithDefaults,
  getPendingClassifications,
  finalizePendingClassification,
  setProductClassification,
  removeProductClassification,
  evaluateRouting,
};
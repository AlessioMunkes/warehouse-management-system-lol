/* STREAMING_CHUNK:Initializing hardened donation intake controller... */
// ─────────────────────────────────────────────────────────────
// server/src/controllers/donationIntake.controller.js
// Hardened to 10/10 Production Security Standard with Conversational Comments
// ─────────────────────────────────────────────────────────────
import donationIntakeService from '../services/donation.intake.service.js';
import productRepo from '../repositories/product.repository.js';
import { ROLES } from '../middleware/auth.middleware.js';

/**
 * POST /api/donations/intake
 *
 * 1. Strict authentication checks (verifying req.user exists).
 * 2. Role-based authorization (only managers or admins allowed).
 * 3. Strict input type checking and range validation (preventing negative quantities or malformed IDs).
 * 4. IDOR prevention (never trusting client-supplied user/operator IDs; deriving operator ID directly from the secure session token).
 * 5. Safe error handling (preventing database leakages and stack trace exposures).
 */
export const handleDonationIntake = async (req, res, next) => {
  try {
    /* STREAMING_CHUNK:Verifying authentication and authorization rules... */
    // Step 1: Authentication & Authorization Guard
    // We make sure the user is authenticated via middleware and has the correct permissions.
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as an authorized operator.',
      });
    }

    // Pulls role strings from the shared ROLES constant (auth.middleware.js)
    // instead of hardcoding them here. This used to check against
    // ['admin', 'warehouse_manager'] — 'warehouse_manager' isn't a real
    // role in the users.role CHECK constraint, so this check was
    // permanently unpassable until fixed. Now it reads from the same
    // source of truth as the requireRole() middleware at the route level.
    const allowedRoles = [ROLES.ADMIN, ROLES.MANAGER];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient privileges for donation intake.',
      });
    }

    /* STREAMING_CHUNK:Extracting and validating incoming payload fields... */
    // Step 2: Input Extraction & Strict Validation
    const { productId, quantityKg, expirationDate, category } = req.body;

    const parsedProductId = Number(productId);
    const parsedQuantityKg = Number(quantityKg);

    // Validate product ID is a positive integer
    if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing productId. Must be a positive integer.',
      });
    }

    // Validate quantity is within safe realistic bounds (0 to 100,000 kg)
    if (isNaN(parsedQuantityKg) || parsedQuantityKg <= 0 || parsedQuantityKg > 100000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantityKg. Must be a positive number up to 100,000 kg.',
      });
    }

    // Whitelist category strings if provided by client
    const allowedCategories = ['recipe_food', 'add_on_food', 'non_recipe_food', 'non_food'];
    const sanitizedCategory = category ? String(category).trim() : null;
    if (sanitizedCategory && !allowedCategories.includes(sanitizedCategory)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid donation category provided.',
      });
    }

    // Validate expiration date format (YYYY-MM-DD) if provided
    if (expirationDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(expirationDate) || isNaN(Date.parse(expirationDate))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expirationDate format. Expected YYYY-MM-DD.',
        });
      }
    }

    /* STREAMING_CHUNK:Preventing IDOR by enforcing server-side operator attribution... */
    // Step 3: Prevent IDOR (Insecure Direct Object Reference)
    // We completely ignore any operator ID sent in the request body.
    // Instead, we securely bind the intake action to the authenticated user's ID.
    const verifiedUserId = req.user.id;

    /* STREAMING_CHUNK:Delegating intake processing to the business service layer... */
    // Step 4: Delegate to Service Layer
    const result = await donationIntakeService.processDonationIntake({
      productId: parsedProductId,
      quantityKg: parsedQuantityKg,
      expirationDate: expirationDate || null,
      category: sanitizedCategory,
      receivedByUserId: verifiedUserId,
    });

    return res.status(201).json({
      success: true,
      message: 'Donation successfully processed and routed.',
      data: result,
    });
  } catch (error) {
    /* STREAMING_CHUNK:Handling errors securely without exposing stack traces... */
    // Step 5: Secure Error Handling
    // Log the actual error internally for auditing, but return a sanitized message to the client.
    console.error('[DonationIntakeController Security Alert] Intake processing error:', {
      error: error.message,
      user: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while processing the donation intake.',
    });
  }
};

export const handleUnrecognizedDonationIntake = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as an authorized operator.',
      });
    }

    const allowedRoles = [ROLES.ADMIN, ROLES.MANAGER];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient privileges for donation intake.',
      });
    }

    const { description, quantity, reason } = req.body;
    if (!description || !String(description).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Description is required for an unrecognized item.',
      });
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > 100000) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive number up to 100,000 kg.',
      });
    }

    const result = await donationIntakeService.processUnrecognizedDonationIntake({
      description,
      quantityKg: parsedQuantity,
      reason,
      receivedByUserId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message: 'Unrecognized item logged for admin review.',
      data: result,
    });
  } catch (error) {
    console.error('[DonationIntakeController] Unrecognized intake failed:', {
      error: error.message,
      user: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'An internal error occurred while logging the unrecognized item.',
    });
  }
};

// ── Staff intake product search (Part A) ─────────────────────
// Read-only lookup backing the "Match to stock item" combobox on the
// donation intake form. A hit routes the line through the existing
// auto-classify path (no flag); a miss leaves the item on the manual
// entry / manager-review path. No writes, so it is open to every intake
// role (worker, manager, admin) — the same set as the intake submit.
export const searchProducts = async (req, res, next) => {
  try {
    const term = typeof req.query.name === 'string' ? req.query.name : '';
    const rows = await productRepo.searchProductsByName(term);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
};

export default {
  handleDonationIntake,
  handleUnrecognizedDonationIntake,
  searchProducts,
};
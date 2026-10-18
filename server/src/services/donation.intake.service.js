// ─────────────────────────────────────────────────────────────
// server/src/services/donationIntake.service.js
//
// CONVERSATION CONTEXT & RATIONALE:
// - Orchestrates donation intake logic, transaction boundaries, and category routing.
// - CRITICAL BUSINESS RULE: Non-food items are "NON STOCK" items. They do not go into
//   the stock table, keeping inventory balances pure and completely clean of non-edible supplies.
// - Dynamic dry vs cold storage staging is evaluated strictly for edible inventory items.
// ─────────────────────────────────────────────────────────────
import pool              from '../config/db.js';
import donationRepository from '../repositories/donation.intake.repository.js';
import stockModel         from '../repositories/stock.repository.js';
import managerFlagRepository from '../repositories/managerFlag.repository.js';
import productRepo        from '../repositories/product.repository.js';
import { ECD_STOCK_CATEGORIES } from '../constants/donationCategories.js';

export const processDonationIntake = async ({
  productId,
  quantityKg,
  expirationDate = null,
  category = null,
  receivedByUserId,
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const product = await donationRepository.getProductWithRoutingDefault(client, productId);

    if (!product) {
      const err = new Error(`No product found for id ${productId}.`);
      err.status = 404;
      throw err;
    }

    const finalCategory = category || product.default_category || 'non_recipe_food';

    const ruleRes = await donationRepository.getCategoryRoutingRule(client, finalCategory);
    const routingRule = ruleRes || {
      routing_outcome: 'unclassified',
      storage_area: 'Intake Holding Area',
    };

    let updatedStockBalance = null;
    let resolvedStorageArea = routingRule.storage_area;
    let managerFlagCreated = false;

    const isEcdInventoryItem = ECD_STOCK_CATEGORIES.includes(finalCategory);

    if (isEcdInventoryItem) {
      resolvedStorageArea = product.storage_type === 'cold'
        ? 'Cold Storage'
        : 'Dry Storage';

      // Inbound donation stock goes through adjustStock, the single
      // write path for quantity_on_hand — so the balance and
      // stock_movements stay reconcilable, the product row is locked
      // against a concurrent receipt, and the unit comes from the
      // product rather than being assumed to be kilograms.
      //
      // The previous upsertInventoryLevel did none of those three
      // things: it added straight to stock_levels, wrote no ledger
      // row, and hard-coded 'kg'. Stock arrived from nowhere as far
      // as any audit or report was concerned.
      const stockRes = await stockModel.adjustStock(client, {
        productId,
        quantityDelta: quantityKg,
        unit:          product.default_unit || 'kg',
        movementType:  'donated',
        referenceType: 'donation_intake',
        reason:        `Donation intake (${finalCategory})`,
        performedBy:   receivedByUserId,
      });
      updatedStockBalance = stockRes.after;

    } else if (finalCategory === 'non_recipe_food') {
      resolvedStorageArea = routingRule.storage_area || 'Soup Kitchen Prep';

    } else if (finalCategory === 'non_food') {
      // NON-STOCK ITEM: bypasses stock tables entirely. This branch was
      // missing its actual side-effect — fixed by inserting into
      // warehouse_manager_flags so a manager has something to review.
      resolvedStorageArea = routingRule.storage_area || 'Mezzanine or Boardroom storage';

      const flag = await managerFlagRepository.createIntakeFlag(client, {
        productId,
        quantityKg,
        reason: 'Non-food donation received: requires manual review and storage placement.',
        targetLocation: resolvedStorageArea,
        createdBy: receivedByUserId,
        status: 'pending',
      });
      managerFlagCreated = Boolean(flag);
    }

    await client.query('COMMIT');

    return {
      success: true,
      productId: product.id,
      productName: product.name,
      sku: product.stock_keeping_unit,
      storageType: product.storage_type,
      category: finalCategory,
      routingOutcome: routingRule.routing_outcome,
      stagedLocation: resolvedStorageArea,
      ecdInventoryUpdated: isEcdInventoryItem,
      totalEcdStockKg: updatedStockBalance,
      managerFlagCreated,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DonationIntakeService] Transaction failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const processUnrecognizedDonationIntake = async ({
  description,
  quantityKg,
  reason = null,
  receivedByUserId,
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const trimmedDescription = String(description || '').trim();
    if (!trimmedDescription) {
      const err = new Error('Description is required for an unrecognized item.');
      err.status = 400;
      throw err;
    }

    const parsedQuantity = Number(quantityKg);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > 100000) {
      const err = new Error('Quantity must be a positive number up to 100,000 kg.');
      err.status = 400;
      throw err;
    }

    const timestamp = Date.now();
    const safeName = `[Unclassified] ${trimmedDescription} (${timestamp})`;
    const placeholderSku = `PENDING-${timestamp}`;
    const product = await managerFlagRepository.createPlaceholderProduct(client, {
      name: safeName,
      sku: placeholderSku,
    });
    const flagReason = (reason && String(reason).trim()) || 'Unrecognized donation item requires manager classification.';
    const flag = await managerFlagRepository.createIntakeFlag(client, {
      productId: product.id,
      quantityKg: parsedQuantity,
      reason: flagReason,
      targetLocation: 'Intake Holding Area',
      createdBy: receivedByUserId,
      status: 'pending_classification',
    });

    await client.query('COMMIT');

    return {
      success: true,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      storageType: product.storage_type,
      quantityKg: parsedQuantity,
      flagId: flag.id,
      status: flag.status,
      message: 'Unrecognized item logged for admin review.',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DonationIntakeService] Unrecognized intake failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// The intake form's "Match to stock item" search. Read only.
export const searchProducts = (term) => productRepo.searchProductsByName(term);

export default {
  processDonationIntake,
  processUnrecognizedDonationIntake,
  searchProducts,
};
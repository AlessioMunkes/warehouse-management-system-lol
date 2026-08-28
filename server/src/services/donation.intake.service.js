// ─────────────────────────────────────────────────────────────
// server/src/services/donationIntake.service.js
//
// CONVERSATION CONTEXT & RATIONALE:
// - Orchestrates donation intake logic, transaction boundaries, and category routing.
// - CRITICAL BUSINESS RULE: Non-food items are "NON STOCK" items. They do not go into
//   the stock table, keeping inventory balances pure and completely clean of non-edible supplies.
// - Dynamic dry vs cold storage staging is evaluated strictly for edible inventory items.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import donationRepository from '../repositories/donation.intake.repository.js';

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

    const isEcdInventoryItem = ['recipe_food', 'add_on_food'].includes(finalCategory);

    if (isEcdInventoryItem) {
      resolvedStorageArea = product.storage_type === 'cold'
        ? 'Cold Storage'
        : 'Dry Storage';

      const stockRes = await donationRepository.upsertInventoryLevel(client, productId, quantityKg);
      updatedStockBalance = stockRes.quantity_on_hand;

    } else if (finalCategory === 'non_recipe_food') {
      resolvedStorageArea = routingRule.storage_area || 'Soup Kitchen Prep';

    } else if (finalCategory === 'non_food') {
      // NON-STOCK ITEM: bypasses stock tables entirely. This branch was
      // missing its actual side-effect — fixed by inserting into
      // warehouse_manager_flags so a manager has something to review.
      resolvedStorageArea = routingRule.storage_area || 'Mezzanine or Boardroom storage';

      const flagResult = await client.query(
        `INSERT INTO warehouse_manager_flags
           (product_id, quantity_kg, reason, target_location, created_by, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id`,
        [
          productId,
          quantityKg,
          'Non-food donation received — requires manual review and storage placement.',
          resolvedStorageArea,
          receivedByUserId,
        ]
      );
      managerFlagCreated = Boolean(flagResult.rows[0]);
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
    const productResult = await client.query(
      `INSERT INTO products (
        name,
        stock_keeping_unit,
        storage_type,
        is_active,
        is_decantable,
        code_type,
        default_unit,
        is_perishable
      ) VALUES ($1, $2, 'dry', false, false, 'fixed', 'kg', false)
      RETURNING id, name, stock_keeping_unit AS sku, storage_type, is_active;`,
      [safeName, placeholderSku]
    );

    const product = productResult.rows[0];
    const flagReason = (reason && String(reason).trim()) || 'Unrecognized donation item requires manager classification.';
    const flagResult = await client.query(
      `INSERT INTO warehouse_manager_flags (
        product_id,
        quantity_kg,
        reason,
        target_location,
        created_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, 'pending_classification')
      RETURNING id, status;`,
      [product.id, parsedQuantity, flagReason, 'Intake Holding Area', receivedByUserId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      storageType: product.storage_type,
      quantityKg: parsedQuantity,
      flagId: flagResult.rows[0].id,
      status: flagResult.rows[0].status,
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

export default {
  processDonationIntake,
  processUnrecognizedDonationIntake,
};
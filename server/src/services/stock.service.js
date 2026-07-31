// ─────────────────────────────────────────────────────────────
// server/src/services/stock.service.js
//
// Business logic for the inventory module.
// Validates data and enforces rules before touching the DB.
// ─────────────────────────────────────────────────────────────
import stockModel from '../repositories/stock.repository.js';

// ── Get the current manifest ────────────────────────────────
const getManifest = async () => {
  return await stockModel.getManifest();
};

// ── Get movement history for one product ──────────────────────
const getMovements = async (productId) => {
  if (!productId) throw new Error('Product ID is required.');
  return await stockModel.getMovements(productId);
};

// ── Manual adjustment ──────────────────────────────────────────
// BR-02: every manual stock change requires a logged reason.
// Role gating (manager/admin only) happens at the route layer —
// this only validates the shape of the request.
// unit is intentionally optional here: the repository inherits the
// unit already on record for the product unless this is that
// product's first-ever movement, in which case it's required.
const adjustManually = async (data, userId) => {
  const { productId, quantityDelta, unit, reason } = data;
  const delta = Number(quantityDelta);

  if (!productId)                                    throw new Error('Product is required.');
  if (quantityDelta === undefined || quantityDelta === null || !Number.isFinite(delta) || delta === 0)
                                                       throw new Error('A non-zero quantity change is required.');
  if (!reason || !reason.trim())                      throw new Error('A reason is required for manual adjustments.');

  const result = await stockModel.manualAdjust({
    productId,
    quantityDelta: delta,
    unit:          unit || null,
    reason:        reason.trim(),
    performedBy:   userId, // comes from JWT — never trusted from frontend
  });

  if (result.productNotFound) throw new Error('Product not found.');

  return result;
};

export default { getManifest, getMovements, adjustManually };
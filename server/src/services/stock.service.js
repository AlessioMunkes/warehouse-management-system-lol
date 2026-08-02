// ─────────────────────────────────────────────────────────────
// server/src/services/stock.service.js
//
// Business logic for the inventory module.
// Validates data and enforces rules before touching the DB.
// ─────────────────────────────────────────────────────────────
import stockModel from '../repositories/stock.repository.js';

// ── fail ───────────────────────────────────────────────────────
// Mirrors picking.service.js. Without a `.status` on the error, the
// controller's `err.status || 500` sends every validation failure
// down the 500 branch, which replaces the message with a generic
// "Failed to adjust stock." — so the manager sees a blank error and
// no clue what was wrong. Attaching the status keeps the message.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ── Get the current manifest ────────────────────────────────
const getManifest = async () => {
  return await stockModel.getManifest();
};

// ── Get movement history for one product ──────────────────────
const getMovements = async (productId) => {
  if (!productId) fail(400, 'Product ID is required.');
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

  if (!productId)                                    fail(400, 'Product is required.');
  if (quantityDelta === undefined || quantityDelta === null || !Number.isFinite(delta) || delta === 0)
                                                       fail(400, 'A non-zero quantity change is required.');
  if (!reason || !reason.trim())                      fail(400, 'A reason is required for manual adjustments.');

  const result = await stockModel.manualAdjust({
    productId,
    quantityDelta: delta,
    unit:          unit || null,
    reason:        reason.trim(),
    performedBy:   userId, // comes from JWT — never trusted from frontend
  });

  if (result.productNotFound) fail(404, 'Product not found.');

  return result;
};

export default { getManifest, getMovements, adjustManually };
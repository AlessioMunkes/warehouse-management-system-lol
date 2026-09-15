// ─────────────────────────────────────────────────────────────
// server/src/services/collectionKit.service.js
//
// Validation and orchestration for Feed the Soil kit logging. Two-step
// workflow: logKitOut records a bucket going out with food waste;
// markReturned closes it with the compost that came back. See
// collectionKit.repository.js for why status = 'returned' plus a
// non-null kg_compost_returned is the only state compost_processed
// (reporting.repository.js) counts.
// ─────────────────────────────────────────────────────────────
import kitRepo from '../repositories/collectionKit.repository.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const cleanText = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const asPositiveNumber = (value, field) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    fail(400, `${field} must be a non-negative number.`);
  }
  return num;
};

const listKits = async (filters = {}) => {
  const status = filters.status ? String(filters.status) : null;
  if (status && !['out', 'returned'].includes(status)) {
    fail(400, "status filter must be 'out' or 'returned'.");
  }
  return kitRepo.listKits({ status, limit: filters.limit ? Number(filters.limit) : 100 });
};

const logKitOut = async (payload, actorId) => {
  const kitLabel = cleanText(payload.kitLabel);
  if (!kitLabel) fail(400, 'kitLabel is required.');

  const dateOut = payload.dateOut ? String(payload.dateOut) : new Date().toISOString().slice(0, 10);
  const kgFoodWasteCollected = asPositiveNumber(payload.kgFoodWasteCollected, 'kgFoodWasteCollected');

  return kitRepo.logKitOut({
    kitLabel,
    location: cleanText(payload.location),
    dateOut,
    kgFoodWasteCollected,
    notes: cleanText(payload.notes),
    loggedBy: actorId,
  });
};

const markReturned = async (id, payload, actorId) => {
  const kitId = Number(id);
  if (!Number.isInteger(kitId) || kitId <= 0) fail(400, 'A valid kit id is required.');
  const kgCompostReturned = asPositiveNumber(payload.kgCompostReturned, 'kgCompostReturned');

  const result = await kitRepo.markReturned({ id: kitId, kgCompostReturned, actorId });
  if (!result.ok && result.code === 'kit_not_found') fail(404, 'Kit not found.');
  if (!result.ok && result.code === 'already_returned') fail(409, 'This kit was already marked returned.');
  return result.kit;
};

export default { listKits, logKitOut, markReturned };

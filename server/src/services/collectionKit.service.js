// ─────────────────────────────────────────────────────────────
// server/src/services/collectionKit.service.js
//
// Validation and orchestration for Feed the Soil kit logging. Two-step
// workflow: logKitOut records a bucket going out with food waste;
// markReturned closes it with the compost that came back. See
// collectionKit.repository.js for why status = 'returned' plus a
// non-null kg_compost_returned is the only state compost_processed
// (reporting.repository.js) counts, and for why logKitOut now 409s on
// a label that's already out rather than allowing two open rows for
// the same physical bucket.
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

// A metric can depend on a table that only exists once its own
// migration has run — collection_kits is the current example (see
// reporting.service.js's runReport, which handles this the same way
// for the reporting side of this same table). Postgres' 42P01
// (undefined_table) means "not set up yet," not "something is
// broken," and deserves the same actionable 503 on every path here
// too — this is the one screen a worker would actually use to try to
// create the data reporting depends on, so a raw 500 here is the
// worst place for it to go unexplained.
const runOrMissingTable = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (err.code === '42P01') {
      fail(503, 'Feed the Soil kit logging hasn\'t been set up yet — its database table doesn\'t exist. Run the pending migration for this feature.');
    }
    throw err;
  }
};

const listKits = async (filters = {}) => {
  const status = filters.status ? String(filters.status) : null;
  if (status && !['out', 'returned'].includes(status)) {
    fail(400, "status filter must be 'out' or 'returned'.");
  }
  return runOrMissingTable(() =>
    kitRepo.listKits({ status, limit: filters.limit ? Number(filters.limit) : 100 }));
};

const logKitOut = async (payload, actorId) => {
  const kitLabel = cleanText(payload.kitLabel);
  if (!kitLabel) fail(400, 'kitLabel is required.');

  const dateOut = payload.dateOut ? String(payload.dateOut) : new Date().toISOString().slice(0, 10);
  const kgFoodWasteCollected = asPositiveNumber(payload.kgFoodWasteCollected, 'kgFoodWasteCollected');

  const result = await runOrMissingTable(() => kitRepo.logKitOut({
    kitLabel,
    location: cleanText(payload.location),
    dateOut,
    kgFoodWasteCollected,
    notes: cleanText(payload.notes),
    loggedBy: actorId,
  }));
  if (!result.ok && result.code === 'already_out') {
    fail(409, `"${kitLabel}" is already logged out and has not been marked returned yet.`);
  }
  return result.kit;
};

const markReturned = async (id, payload, actorId) => {
  const kitId = Number(id);
  if (!Number.isInteger(kitId) || kitId <= 0) fail(400, 'A valid kit id is required.');
  const kgCompostReturned = asPositiveNumber(payload.kgCompostReturned, 'kgCompostReturned');

  const result = await runOrMissingTable(() => kitRepo.markReturned({ id: kitId, kgCompostReturned, actorId }));
  if (!result.ok && result.code === 'kit_not_found') fail(404, 'Kit not found.');
  if (!result.ok && result.code === 'already_returned') fail(409, 'This kit was already marked returned.');
  return result.kit;
};

export default { listKits, logKitOut, markReturned };

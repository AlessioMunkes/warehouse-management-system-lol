// ─────────────────────────────────────────────────────────────
// server/src/services/collectionKit.service.js
//
// Validation and orchestration for Feed the Soil kit tracking. Three
// actions: createKit assigns a bucket to a community member; logCompost
// records one weigh-in against an already-assigned kit; markDispatched
// closes out a logged record once its compost has left for a farmer.
// See collectionKit.repository.js for the full lifecycle and why a
// kit's status is always derived from its latest record, never stored.
//
// STATUS NAMING IS FIXED: 'assigned' | 'logged' | 'dispatched'.
// One term per state, used identically in the database, this file, the
// API and the UI — the user was explicit that a mix of "logged" and
// "recorded" was itself part of what made the previous version unclear.
// ─────────────────────────────────────────────────────────────
import kitRepo from '../repositories/collectionKit.repository.js';
import { isPositiveInt } from '../utils/validation.js';

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

const todayISO = () => new Date().toISOString().slice(0, 10);

// A metric can depend on a table that only exists once its own
// migration has run — collection_kits/collection_kit_records is the
// current example (see reporting.service.js's runReport, which
// handles this the same way for the reporting side of the same
// tables). Postgres' 42P01 (undefined_table) means "not set up yet,"
// not "something is broken," and deserves the same actionable 503 on
// every path here too — this is the one screen staff would actually
// use to try to create the data reporting depends on, so a raw 500
// here is the worst place for it to go unexplained.
const runOrMissingTable = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (err.code === '42P01') {
      fail(503, 'Feed the Soil kit tracking hasn\'t been set up yet — its database tables don\'t exist. Run the pending migration for this feature.');
    }
    throw err;
  }
};

// ── Assign a kit ──────────────────────────────────────────────
const createKit = async (payload, actorId) => {
  const ownerName = cleanText(payload.ownerName);
  if (!ownerName) fail(400, 'ownerName is required.');
  if (ownerName.length > 150) fail(400, 'ownerName must be 150 characters or fewer.');

  const suburb = cleanText(payload.suburb);
  if (suburb && suburb.length > 150) fail(400, 'suburb must be 150 characters or fewer.');

  const assignedAt = payload.assignedAt ? String(payload.assignedAt) : todayISO();

  return runOrMissingTable(() => kitRepo.createKit({ ownerName, suburb, assignedAt, actorId }));
};

// ── List / detail ────────────────────────────────────────────
const listKits = async (filters = {}) =>
  runOrMissingTable(() => kitRepo.listKits({ search: cleanText(filters.search) }));

const getKit = async (rawId) => {
  const id = Number(rawId);
  if (!isPositiveInt(id)) fail(400, 'A valid kit id is required.');

  const kit = await runOrMissingTable(() => kitRepo.getKitById(id));
  if (!kit) fail(404, 'Kit not found.');
  return kit;
};

// ── Log a compost weigh-in ───────────────────────────────────
const logCompost = async (rawKitId, payload, actorId) => {
  const kitId = Number(rawKitId);
  if (!isPositiveInt(kitId)) fail(400, 'A valid kit id is required.');

  const kgCompost = asPositiveNumber(payload.kgCompost, 'kgCompost');
  const loggedAt = payload.loggedAt ? String(payload.loggedAt) : todayISO();
  const notes = cleanText(payload.notes);

  const result = await runOrMissingTable(() =>
    kitRepo.logCompost({ kitId, kgCompost, loggedAt, notes, actorId }));
  if (!result.ok && result.code === 'kit_not_found') fail(404, 'Kit not found.');
  return result.record;
};

// ── Mark a record dispatched ─────────────────────────────────
const markDispatched = async (rawRecordId, actorId) => {
  const recordId = Number(rawRecordId);
  if (!isPositiveInt(recordId)) fail(400, 'A valid record id is required.');

  const result = await runOrMissingTable(() => kitRepo.markDispatched({ recordId, actorId }));
  if (!result.ok && result.code === 'record_not_found') fail(404, 'Record not found.');
  if (!result.ok && result.code === 'already_dispatched') fail(409, 'This record was already marked dispatched.');
  return result.record;
};

// ── Flat cross-kit record list ───────────────────────────────
const listRecords = async (filters = {}) => {
  const status = filters.status ? String(filters.status) : null;
  if (status && !['logged', 'dispatched'].includes(status)) {
    fail(400, "status filter must be 'logged' or 'dispatched'.");
  }
  return runOrMissingTable(() =>
    kitRepo.listRecords({ status, limit: filters.limit ? Number(filters.limit) : 200 }));
};

export default { createKit, listKits, getKit, logCompost, markDispatched, listRecords };

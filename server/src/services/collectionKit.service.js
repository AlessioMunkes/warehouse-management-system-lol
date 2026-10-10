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
import { isPositiveInt, isValidDateString, toQuantity } from '../utils/validation.js';

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
  const num = toQuantity(value);
  if (!Number.isFinite(num) || num < 0) {
    fail(400, `${field} must be zero or more.`);
  }
  return num;
};

// The warehouse's date, not the server's: the server runs in UTC and
// Cape Town is UTC+2, so a plain toISOString() is yesterday until
// 02:00. Same fixed offset delivery.service.js uses.
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const todayISO = () => new Date(Date.now() + SAST_OFFSET_MS).toISOString().slice(0, 10);

// A date the client sent, or today when it sent none. Calendar-checked
// here so 2026-02-30 is a 400 rather than a Postgres error.
const asDate = (value, field) => {
  if (value === undefined || value === null || value === '') return todayISO();
  if (!isValidDateString(value)) fail(400, `${field} must be a real date (YYYY-MM-DD).`);
  return value;
};

// How many records one list call may return.
const MAX_RECORD_LIMIT = 500;

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
      fail(503, 'Feed the Soil kit tracking hasn\'t been set up yet. Its database tables don\'t exist yet: run the pending migration for this feature.');
    }
    throw err;
  }
};

// ── Assign a kit ──────────────────────────────────────────────
const createKit = async (payload, actorId) => {
  const ownerName = cleanText(payload.ownerName);
  if (!ownerName) fail(400, 'Enter who the kit is for.');
  if (ownerName.length > 150) fail(400, 'Keep the name to 150 characters or fewer.');

  const suburb = cleanText(payload.suburb);
  if (suburb && suburb.length > 150) fail(400, 'Keep the suburb to 150 characters or fewer.');

  const assignedAt = asDate(payload.assignedAt, 'The date assigned');

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

  const kgCompost = asPositiveNumber(payload.kgCompost, 'The compost weight');
  const loggedAt = asDate(payload.loggedAt, 'The date collected');
  const notes = cleanText(payload.notes);

  const result = await runOrMissingTable(() =>
    kitRepo.logCompost({ kitId, kgCompost, loggedAt, notes, actorId }));
  if (!result.ok && result.code === 'kit_not_found') fail(404, 'Kit not found.');
  return result.record;
};

const getRecord = async (rawRecordId) => {
  const recordId = Number(rawRecordId);
  if (!isPositiveInt(recordId)) fail(400, 'A valid record id is required.');

  const record = await runOrMissingTable(() => kitRepo.getRecordById(recordId));
  if (!record) fail(404, 'Record not found.');
  return record;
};

// ── Mark a record dispatched ─────────────────────────────────
// dispatchedTo is required: "dispatched" only means something once
// it says where the compost went, same reasoning logCompost applies
// to kgCompost — an empty answer here is not a smaller version of the
// real one, it is no answer.
const markDispatched = async (rawRecordId, payload, actorId) => {
  const recordId = Number(rawRecordId);
  if (!isPositiveInt(recordId)) fail(400, 'A valid record id is required.');

  const dispatchedTo = cleanText(payload?.dispatchedTo);
  if (!dispatchedTo) fail(400, 'Enter where the compost went.');
  if (dispatchedTo.length > 150) fail(400, 'Keep where it went to 150 characters or fewer.');

  const result = await runOrMissingTable(() => kitRepo.markDispatched({ recordId, actorId, dispatchedTo }));
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
  let limit = 200;
  if (filters.limit !== undefined && filters.limit !== null && filters.limit !== '') {
    if (!isPositiveInt(filters.limit) || Number(filters.limit) > MAX_RECORD_LIMIT) {
      fail(400, `limit must be a whole number from 1 to ${MAX_RECORD_LIMIT}.`);
    }
    limit = Number(filters.limit);
  }
  return runOrMissingTable(() =>
    kitRepo.listRecords({ status, search: cleanText(filters.search), limit }));
};

export default { createKit, listKits, getKit, getRecord, logCompost, markDispatched, listRecords };

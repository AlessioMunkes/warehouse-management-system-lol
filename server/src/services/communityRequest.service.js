// ─────────────────────────────────────────────────────────────
// server/src/services/communityRequest.service.js
//
// Validation and orchestration for the ADM-5.0 / BR-28 community
// (benevolent package) request log, against the live
// public.community_requests table.
//
// LOG ONLY. A request records what a member of the public asked for
// and what happened to it. It never reserves, allocates or deducts
// stock — nothing here calls adjustStock or writes stock_movements.
//
// Two-step workflow, matching the live schema:
//   1. log     — create the request (outcome starts 'pending')
//   2a. claim  — a staff member takes ownership (sets handled_by)
//   2b. resolve — record the outcome (sets outcome + outcome_note +
//                 resolved_at); does not touch handled_by
// Claiming and resolving are independent: a request can be resolved
// without ever being claimed, and claimed without being resolved
// (both live seed rows are claimed but still pending).
//
// Errors throw with a numeric `.status` attached — same fail() idiom
// as product.service.js / loveActivismEvent.service.js.
// ─────────────────────────────────────────────────────────────
import requestRepo from '../repositories/communityRequest.repository.js';
import { withTransaction } from '../utils/transaction.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// The DB enum request_outcome also permits 'referred', but BR-28 keeps
// that out of scope for what staff select. It stays a valid *filter*
// value (old or externally-set rows may carry it); it is never an
// accepted *resolve* target.
export const OUTCOMES = ['pending', 'fulfilled', 'partially_fulfilled', 'declined', 'referred'];
export const RESOLVE_OUTCOMES = ['fulfilled', 'partially_fulfilled', 'declined'];

// '' is "not recorded" and becomes null; a real value is trimmed.
const cleanText = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

// Optional. When given it must be a real timestamp; the repository
// falls back to NOW() when this is null.
const parseRequestedAt = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    fail(400, 'Requested at must be a valid date and time.');
  }
  return date.toISOString();
};

const listRequests = async (filters = {}) => {
  const outcome = filters.outcome ? String(filters.outcome) : null;
  if (outcome && !OUTCOMES.includes(outcome)) {
    fail(400, `Outcome filter must be one of: ${OUTCOMES.join(', ')}.`);
  }
  return requestRepo.listRequests({ outcome, search: cleanText(filters.search) });
};

const getRequest = async (id) => {
  if (!id) fail(400, 'A request id is required.');
  const request = await requestRepo.getRequestById(id);
  if (!request) fail(404, 'Community request not found.');
  return request;
};

const createRequest = async (data = {}, actor) => {
  const itemsRequested = cleanText(data.itemsRequested ?? data.items_requested);
  if (!itemsRequested) fail(400, 'Describe what was requested.');
  if (itemsRequested.length > 5000) fail(400, 'The item description is too long.');

  const callerName = cleanText(data.callerName ?? data.caller_name);
  if (callerName && callerName.length > 200) fail(400, 'Caller name must be 200 characters or fewer.');

  const callerContact = cleanText(data.callerContact ?? data.caller_contact);
  if (callerContact && callerContact.length > 200) fail(400, 'Caller contact must be 200 characters or fewer.');

  // Free text, not a number — e.g. "Enough for roughly 80 plates".
  const quantityNote = cleanText(data.quantityNote ?? data.quantity_note);
  if (quantityNote && quantityNote.length > 500) fail(400, 'The quantity note is too long.');

  const requestedAt = parseRequestedAt(data.requestedAt ?? data.requested_at);

  // Not written to the row (there is no "logged_by" column), but a
  // request must still be logged by a real session — matches BR-01.
  if (!actor || !actor.id) fail(400, 'An authenticated user is required to log a request.');

  return withTransaction((client) =>
    requestRepo.createRequest(
      { callerName, callerContact, itemsRequested, quantityNote, requestedAt },
      client
    )
  );
};

// A staff member takes ownership of a request. handled_by is set to
// the acting user — this is "claim", not "assign to someone else".
// Re-claiming is allowed: a manager taking over a request is a valid
// hand-off, and the schema keeps only the current owner.
const claim = async (id, actor) => {
  if (!id) fail(400, 'A request id is required.');
  if (!actor || !actor.id) fail(400, 'An authenticated user is required to claim a request.');

  const updated = await withTransaction((client) =>
    requestRepo.claimRequest(id, Number(actor.id), client)
  );
  if (!updated) fail(404, 'Community request not found.');
  return updated;
};

const resolve = async (id, data = {}, actor) => {
  if (!id) fail(400, 'A request id is required.');
  if (!actor || !actor.id) fail(400, 'An authenticated user is required to resolve a request.');

  const outcome = data.outcome === undefined || data.outcome === null ? '' : String(data.outcome);
  if (!RESOLVE_OUTCOMES.includes(outcome)) {
    fail(400, `Outcome must be one of: ${RESOLVE_OUTCOMES.join(', ')}.`);
  }

  // outcome_note is optional — both live seed rows resolved with no
  // note, so the real workflow does not always produce one. '' or
  // whitespace-only becomes null, same handling as the caller fields.
  const outcomeNote = cleanText(data.outcomeNote ?? data.outcome_note);
  if (outcomeNote && outcomeNote.length > 5000) fail(400, 'The outcome note is too long.');

  const updated = await withTransaction((client) =>
    requestRepo.resolveRequest(id, { outcome, outcomeNote }, client)
  );
  if (!updated) fail(404, 'Community request not found.');
  return updated;
};

const countPending = async () => requestRepo.countPending();

export default {
  listRequests,
  getRequest,
  createRequest,
  claim,
  resolve,
  countPending,
};

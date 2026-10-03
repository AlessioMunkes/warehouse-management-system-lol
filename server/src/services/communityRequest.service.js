// ─────────────────────────────────────────────────────────────
// server/src/services/communityRequest.service.js
//
// Benevolent requests: log, approve with items, assign, claim, confirm
// what went out, decline. See communityRequest.repository.js for the
// flow and communityRequestStock.repository.js for how it meets stock.
//
// WHO MAY DO WHAT
//   log                       any staff
//   approve / decline /
//   assign / re-choose items  manager or admin
//   claim                     any staff (approved, not flagged)
//   confirm what went out     the claimer, the assigned packer,
//                             or a manager or admin
//
// Each transition runs in one transaction that starts by locking the
// request row, so two people acting at once take turns and the second
// reads what the first left.
// ─────────────────────────────────────────────────────────────
import requestRepo from '../repositories/communityRequest.repository.js';
import stockModel from '../repositories/stock.repository.js';
import { getAvailability } from '../repositories/communityRequestStock.repository.js';
import { withTransaction } from '../utils/transaction.js';
import { isManagerUp } from '../constants/permissions.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

export const OUTCOMES = ['pending', 'approved', 'fulfilled', 'partially_fulfilled', 'declined', 'referred'];

const MAX_LINES = 50;

const cleanText = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const requireManager = (actor, what) => {
  if (!isManagerUp(actor)) fail(403, `Only a manager or admin can ${what}.`);
};

const requireActor = (actor, what) => {
  if (!actor || !actor.id) fail(400, `An authenticated user is required to ${what}.`);
};

const num = (n) => Number(n);
const fmt = (n) => String(Number(Number(n).toFixed(3)));

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const parseRequestedAt = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    fail(400, 'Requested at must be a valid date and time.');
  }
  if (date.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    fail(400, 'Choose a date and time that is not in the future.');
  }
  return date.toISOString();
};

// ── Reading ───────────────────────────────────────────────────
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

// ── Logging ───────────────────────────────────────────────────
const createRequest = async (data = {}, actor) => {
  const itemsRequested = cleanText(data.itemsRequested ?? data.items_requested);
  if (!itemsRequested) fail(400, 'Describe what was requested.');
  if (itemsRequested.length > 5000) fail(400, 'The item description is too long.');

  const callerName = cleanText(data.callerName ?? data.caller_name);
  if (callerName && callerName.length > 200) fail(400, 'Caller name must be 200 characters or fewer.');

  const callerContact = cleanText(data.callerContact ?? data.caller_contact);
  if (callerContact && callerContact.length > 200) fail(400, 'Caller contact must be 200 characters or fewer.');

  const quantityNote = cleanText(data.quantityNote ?? data.quantity_note);
  if (quantityNote && quantityNote.length > 500) fail(400, 'The quantity note is too long.');

  const requestedAt = parseRequestedAt(data.requestedAt ?? data.requested_at);

  requireActor(actor, 'log a request');

  return withTransaction((client) =>
    requestRepo.createRequest(
      { callerName, callerContact, itemsRequested, quantityNote, requestedAt },
      client
    )
  );
};

// ── Items ─────────────────────────────────────────────────────
const parseItems = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) fail(400, 'Choose at least one product.');
  if (raw.length > MAX_LINES) fail(400, `Choose ${MAX_LINES} products or fewer.`);
  const seen = new Set();
  return raw.map((line) => {
    const productId = Number(line?.productId ?? line?.product_id);
    const quantity  = Number(line?.quantity ?? line?.quantityApproved);
    if (!Number.isInteger(productId) || productId <= 0) fail(400, 'Choose products from the stock list.');
    if (!Number.isFinite(quantity) || quantity <= 0) fail(400, 'Enter a quantity above zero for every product.');
    if (seen.has(productId)) fail(400, 'Each product can only be on the request once.');
    seen.add(productId);
    return { productId, quantity };
  });
};

// Only what is available can be set aside: on hand minus every
// commitment — packed pallets and other approved requests. The stock
// rows are locked first (see getAvailability), so two approvals racing
// for the same stock cannot both pass.
const resolveItems = async (client, wanted, { excludeRequestId = 0 } = {}) => {
  const availability = await getAvailability(client, wanted.map((w) => w.productId), { excludeRequestId });
  const byId = new Map(availability.map((a) => [a.productId, a]));

  const short = [];
  const lines = wanted.map((w) => {
    const a = byId.get(w.productId);
    if (!a) fail(400, 'Choose products from the stock list.');
    if (w.quantity > a.available) {
      const u = a.unit ? ` ${a.unit}` : '';
      short.push(`${a.productName} (${fmt(Math.max(a.available, 0))}${u} available, ${fmt(w.quantity)}${u} asked for)`);
    }
    return { productId: w.productId, unit: a.unit, quantity: w.quantity };
  });

  if (short.length > 0) {
    fail(409, `Not enough stock to set aside: ${short.join('; ')}. Lower the quantity or choose another product.`);
  }
  return lines;
};

// ── Approve ───────────────────────────────────────────────────
const approve = async (id, data = {}, actor) => {
  requireActor(actor, 'approve a request');
  requireManager(actor, 'approve a request');
  const wanted = parseItems(data.items);

  return withTransaction(async (client) => {
    const row = await requestRepo.lockRequest(id, client);
    if (!row) fail(404, 'Community request not found.');
    if (row.outcome !== 'pending') {
      fail(409, 'Only a request that is awaiting approval can be approved.');
    }

    const lines = await resolveItems(client, wanted, { excludeRequestId: Number(id) });
    if (!(await requestRepo.markApproved(id, Number(actor.id), client))) {
      fail(409, 'Only a request that is awaiting approval can be approved.');
    }
    await requestRepo.replaceItems(id, lines, client);
    return requestRepo.getRequestById(id, client);
  });
};

// ── Choose other items ────────────────────────────────────────
// For an approved request, normally one that ran short. The old lines
// are replaced, the flag is cleared, and the same availability check
// applies (this request's own old lines do not count against it).
const rechooseItems = async (id, data = {}, actor) => {
  requireActor(actor, 'change a request');
  requireManager(actor, 'choose items for a request');
  const wanted = parseItems(data.items);

  return withTransaction(async (client) => {
    const row = await requestRepo.lockRequest(id, client);
    if (!row) fail(404, 'Community request not found.');
    if (row.outcome !== 'approved') {
      fail(409, 'Items can only be changed on an approved request.');
    }

    const lines = await resolveItems(client, wanted, { excludeRequestId: Number(id) });
    await requestRepo.replaceItems(id, lines, client);
    await requestRepo.clearShortFlag(id, client);
    return requestRepo.getRequestById(id, client);
  });
};

// ── Decline ───────────────────────────────────────────────────
// At either stage. Once approved, declining releases the reservation
// with no write of its own: it only counts while the status is approved.
const decline = async (id, data = {}, actor) => {
  requireActor(actor, 'decline a request');
  requireManager(actor, 'decline a request');
  const reason = cleanText(data.reason ?? data.outcomeNote ?? data.outcome_note);
  if (!reason) fail(400, 'Say why the request is declined.');
  if (reason.length > 500) fail(400, 'The reason must be 500 characters or fewer.');

  return withTransaction(async (client) => {
    const row = await requestRepo.lockRequest(id, client);
    if (!row) fail(404, 'Community request not found.');
    if (row.outcome !== 'pending' && row.outcome !== 'approved') {
      fail(409, 'This request has already been closed.');
    }
    await requestRepo.markDeclined(id, { reason, userId: Number(actor.id) }, client);
    return requestRepo.getRequestById(id, client);
  });
};

// ── Assign a packer ───────────────────────────────────────────
const assign = async (id, data = {}, actor) => {
  requireActor(actor, 'assign a request');
  requireManager(actor, 'assign a packer');
  const raw = data.userId ?? data.user_id ?? null;
  const userId = raw === null || raw === '' ? null : Number(raw);
  if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) fail(400, 'Choose a person to assign.');

  return withTransaction(async (client) => {
    const row = await requestRepo.lockRequest(id, client);
    if (!row) fail(404, 'Community request not found.');
    if (row.outcome !== 'approved') fail(409, 'A packer can only be assigned to an approved request.');
    if (userId !== null && !(await requestRepo.findAssignableUser(userId, client))) {
      fail(400, 'That person cannot be assigned. Choose an active staff member.');
    }
    await requestRepo.setAssignee(id, userId, client);
    return requestRepo.getRequestById(id, client);
  });
};

// ── Claim ─────────────────────────────────────────────────────
const claim = async (id, actor) => {
  if (!id) fail(400, 'A request id is required.');
  requireActor(actor, 'claim a request');

  return withTransaction(async (client) => {
    const won = await requestRepo.claimApproved(id, Number(actor.id), client);
    if (won) return requestRepo.getRequestById(id, client);

    // Nothing updated: say why, from the row as it stands now.
    const row = await requestRepo.lockRequest(id, client);
    if (!row) fail(404, 'Community request not found.');
    if (row.outcome !== 'approved') fail(409, 'Only an approved request can be claimed.');
    if (row.items_short_at) fail(409, 'This request needs new items before anyone can pack it.');
    if (row.handled_by) fail(409, 'Someone has already claimed this request.');
    return fail(409, 'This request cannot be claimed.');
  });
};

// ── Confirm what went out ─────────────────────────────────────
// Released can be lower than approved, never higher. Everything fully
// released → fulfilled; anything less → partially fulfilled. Nothing
// released at all is not a fulfilment: that is a decline.
//
// ORDER MATTERS. The request leaves 'approved' BEFORE stock is
// deducted, so the shortage check that adjustStock runs does not see
// this request's own reservation still held against the stock that is
// leaving.
const confirm = async (id, data = {}, actor) => {
  requireActor(actor, 'confirm a request');

  return withTransaction(async (client) => {
    const row = await requestRepo.lockRequest(id, client);
    if (!row) fail(404, 'Community request not found.');
    if (row.outcome !== 'approved') {
      fail(409, row.outcome === 'fulfilled' || row.outcome === 'partially_fulfilled'
        ? 'This request has already been confirmed.'
        : 'Only an approved request can be confirmed.');
    }
    if (row.items_short_at) fail(409, 'This request needs new items before it can be packed.');

    const mine = Number(row.handled_by) === Number(actor.id) || Number(row.assigned_to) === Number(actor.id);
    if (!mine && !isManagerUp(actor)) {
      fail(403, 'Only the person who claimed or was assigned this request, or a manager, can confirm it.');
    }

    const lines = await requestRepo.getItems(id, client);
    if (lines.length === 0) fail(409, 'This request has no items to confirm.');

    const asked = new Map();
    if (data.items !== undefined && data.items !== null) {
      if (!Array.isArray(data.items)) fail(400, 'Items must be a list.');
      for (const entry of data.items) {
        const productId = Number(entry?.productId ?? entry?.product_id);
        const released  = Number(entry?.quantityReleased ?? entry?.quantity_released ?? entry?.quantity);
        if (!lines.some((l) => l.product_id === productId)) fail(400, 'One of those products is not on this request.');
        if (!Number.isFinite(released) || released < 0) fail(400, 'Enter how many went out, zero or more.');
        asked.set(productId, released);
      }
    }

    const released = lines.map((line) => {
      const approved = num(line.quantity_approved);
      const qty = asked.has(line.product_id) ? asked.get(line.product_id) : approved;
      if (qty > approved) fail(400, 'You cannot release more than was approved.');
      return { line, approved, qty };
    });

    if (released.every((r) => r.qty === 0)) {
      fail(400, 'Nothing went out. Ask a manager to decline the request instead.');
    }

    const outcome = released.every((r) => r.qty === r.approved) ? 'fulfilled' : 'partially_fulfilled';
    if (!(await requestRepo.markConfirmed(id, { outcome, userId: Number(actor.id) }, client))) {
      fail(409, 'This request has already been confirmed.');
    }

    // Product order, like every other adjustStock caller.
    const ordered = [...released].sort((a, b) => a.line.product_id - b.line.product_id);
    for (const { line, qty } of ordered) {
      await requestRepo.setReleased(line.id, qty, client);
      if (qty > 0) {
        await stockModel.adjustStock(client, {
          productId:     line.product_id,
          quantityDelta: -qty,
          unit:          line.unit,
          movementType:  'dispatched',
          referenceType: 'community_request',
          referenceId:   Number(id),
          reason:        `Benevolent request #${id}`,
          performedBy:   Number(actor.id),
        });
      }
    }

    return requestRepo.getRequestById(id, client);
  });
};

// ── The old resolve call ──────────────────────────────────────
// Kept so a client that has not been updated yet does not break, but
// narrowed: it can only decline, and only for a manager or admin. A
// request can no longer be fulfilled without being approved first.
const resolve = async (id, data = {}, actor) => {
  const outcome = data.outcome === undefined || data.outcome === null ? '' : String(data.outcome);
  if (outcome !== 'declined') {
    fail(400, 'Approve the request and choose items first. Then confirm what went out.');
  }
  return decline(id, { reason: data.outcomeNote ?? data.outcome_note }, actor);
};

const countPending = async () => requestRepo.countPending();

export default {
  listRequests,
  getRequest,
  createRequest,
  approve,
  rechooseItems,
  decline,
  assign,
  claim,
  confirm,
  resolve,
  countPending,
};

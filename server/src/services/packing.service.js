// ─────────────────────────────────────────────────────────────
// server/src/services/packing.service.js
//
// Business logic for the packing workflow.
// Validates data and enforces rules before touching the DB.
// ─────────────────────────────────────────────────────────────
import packingRepository from '../repositories/packing.repository.js';
import { ROLES }         from '../middleware/auth.middleware.js';

const COHORTS = ['week1', 'week2'];
const STATUSES = ['pending', 'in_progress', 'complete', 'cancelled'];

// Small helper so controllers can map errors to status codes without
// string-matching on messages the way delivery.controller does.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const isManager = (user) => user.role === ROLES.MANAGER || user.role === ROLES.ADMIN;

// ── List slips ────────────────────────────────────────────────
// A packer only ever sees their own board unless they ask for the
// unassigned pool; a manager sees everything.
const getSlips = async (query, user) => {
  const { dispatchDate, cohort, status, mine } = query;

  if (cohort && !COHORTS.includes(cohort))   fail(400, 'Cohort must be tuesday or thursday.');
  if (status && !STATUSES.includes(status))  fail(400, 'Invalid status filter.');

  const assignedTo = (!isManager(user) && mine === 'true') ? user.id : undefined;

  return await packingRepository.getSlips({ dispatchDate, cohort, status, assignedTo });
};

// ── One slip ──────────────────────────────────────────────────
const getSlipById = async (id) => {
  const slip = await packingRepository.getSlipById(id);
  if (!slip) fail(404, 'Packing slip not found.');
  return slip;
};

// ── Generate the week's slips (manager only) ──────────────────
const generateSlips = async ({ dispatchDate, cohort }, user) => {
  if (!isManager(user))                   fail(403, 'Only managers can generate packing slips.');
  if (!dispatchDate)                      fail(400, 'Dispatch date is required.');
  if (!COHORTS.includes(cohort))          fail(400, 'Cohort must be tuesday or thursday.');

  const date = new Date(dispatchDate);
  if (Number.isNaN(date.getTime()))       fail(400, 'Dispatch date is not a valid date.');

  // Guard against generating for a day that has already passed —
  // a typo here would create a whole week of ghost slips.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (date < today)                       fail(400, 'Cannot generate slips for a past date.');

  // Tuesday cohort must dispatch on a Tuesday, Thursday on a Thursday.
  const expectedDay = cohort === 'tuesday' ? 2 : 4;
  if (date.getUTCDay() !== expectedDay) {
    fail(400, `The ${cohort} cohort must be generated for a ${cohort}.`);
  }

  return await packingRepository.generateSlips({
    dispatchDate,
    cohort,
    generatedBy: user.id,   // from JWT — never trusted from frontend
  });
};

// ── Claim a slip ──────────────────────────────────────────────
// A packer can only claim for themselves. A manager can reassign.
const assignSlip = async (slipId, body, user) => {
  const packerId = isManager(user) ? (body.packerId || user.id) : user.id;

  const result = await packingRepository.assignSlip({ slipId, packerId, actorId: user.id });

  if (result.notFound) fail(404, 'Packing slip not found.');
  if (result.conflict) fail(409, 'This pallet is already being packed by someone else.');
  return result.slip;
};

// ── Confirm a line ────────────────────────────────────────────
const confirmItem = async (slipId, itemId, body, user) => {
  const packedQuantity = Number(body.packedQuantity);

  if (!Number.isFinite(packedQuantity)) fail(400, 'Packed quantity is required.');
  if (packedQuantity <= 0)              fail(400, 'Packed quantity must be greater than zero. Flag the item instead if you packed none.');

  const result = await packingRepository.setItemStatus({
    slipId, itemId, status: 'confirmed', packedQuantity, actorId: user.id,
  });

  if (result.notFound) fail(404, 'Packing slip item not found.');
  if (result.locked)   fail(409, 'This slip is already complete and cannot be changed.');
  if (!isManager(user) && result.assignedTo !== user.id) {
    fail(403, 'You can only confirm items on a pallet assigned to you.');
  }
  return result.item;
};

// ── Flag a line ───────────────────────────────────────────────
// This is the paper slip's margin scribble, made structured — dispatch
// reads it at the gate instead of discovering the shortage in the car park.
const flagItem = async (slipId, itemId, body, user) => {
  const reason = (body.flagReason || '').trim();
  if (!reason)          fail(400, 'A reason is required when flagging an item.');
  if (reason.length > 500) fail(400, 'Flag reason is too long.');

  const packedQuantity = body.packedQuantity === undefined ? null : Number(body.packedQuantity);
  if (packedQuantity !== null && (!Number.isFinite(packedQuantity) || packedQuantity < 0)) {
    fail(400, 'Packed quantity must be zero or more.');
  }

  const result = await packingRepository.setItemStatus({
    slipId, itemId, status: 'flagged', packedQuantity, flagReason: reason, actorId: user.id,
  });

  if (result.notFound) fail(404, 'Packing slip item not found.');
  if (result.locked)   fail(409, 'This slip is already complete and cannot be changed.');
  if (!isManager(user) && result.assignedTo !== user.id) {
    fail(403, 'You can only flag items on a pallet assigned to you.');
  }
  return result.item;
};

// ── Complete a slip ───────────────────────────────────────────
// The rule from the business case: a packing slip cannot be marked
// complete until every required item is confirmed or flagged.
const completeSlip = async (slipId, body, user) => {
  const result = await packingRepository.completeSlip({
    slipId,
    palletRef: body.palletRef,
    actorId:   user.id,
  });

  if (result.notFound)        fail(404, 'Packing slip not found.');
  if (result.alreadyComplete) fail(409, 'This slip is already complete.');
  if (result.pendingItems) {
    fail(422, `${result.pendingItems} item(s) still need to be confirmed or flagged before this pallet can be closed.`);
  }
  return result.slip;
};

export default {
  getSlips,
  getSlipById,
  generateSlips,
  assignSlip,
  confirmItem,
  flagItem,
  completeSlip,
};
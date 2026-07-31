// ─────────────────────────────────────────────────────────────
// server/src/services/picking.service.js
//
// Business logic for the picking workflow.
// Validates data and enforces rules before touching the DB.
// ─────────────────────────────────────────────────────────────
import pickingRepository from '../repositories/picking.repository.js';
import { ROLES }         from '../middleware/auth.middleware.js';

const COHORTS = ['week1', 'week2'];
const STATUSES = ['pending', 'in_progress', 'complete', 'cancelled'];
const cohortLabel = (c) => (c === 'week1' ? 'Week 1' : 'Week 2');

// Small helper so controllers can map errors to status codes without
// string-matching on messages the way delivery.controller does.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ── Fortnightly rotation math ───────────────────────────────────
// Half the ECDs are 'week1', half 'week2'; each group collects every
// other week. cohort_anchor_monday (picking_settings) is the Monday
// of a known week1 week — every other week's cohort is computed from
// how many whole weeks have passed since that anchor.
const mondayOf = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();               // 0 = Sunday .. 6 = Saturday
  d.setUTCDate(d.getUTCDate() + ((day === 0 ? -6 : 1) - day));
  return d;
};

const resolveActiveCohort = (dispatchDate, anchorMondayStr) => {
  const monday = mondayOf(dispatchDate);
  const anchor = mondayOf(new Date(anchorMondayStr));
  const weeksBetween = Math.round((monday - anchor) / (7 * 24 * 60 * 60 * 1000));
  const parity = ((weeksBetween % 2) + 2) % 2;   // handles dates before the anchor too
  return parity === 0 ? 'week1' : 'week2';
};

const isManager = (user) => user.role === ROLES.MANAGER || user.role === ROLES.ADMIN;

// ── List slips ────────────────────────────────────────────────
// A packer only ever sees their own board unless they ask for the
// unassigned pool; a manager sees everything.
const getSlips = async (query, user) => {
  const { dispatchDate, cohort, status, mine } = query;

  if (cohort && !COHORTS.includes(cohort))   fail(400, 'Cohort must be week1 or week2.');
  if (status && !STATUSES.includes(status))  fail(400, 'Invalid status filter.');

  const assignedTo = (!isManager(user) && mine === 'true') ? user.id : undefined;

  return await pickingRepository.getSlips({ dispatchDate, cohort, status, assignedTo });
};

// ── One slip ──────────────────────────────────────────────────
const getSlipById = async (id) => {
  const slip = await pickingRepository.getSlipById(id);
  if (!slip) fail(404, 'Picking slip not found.');
  return slip;
};

// ── Shared date/cohort validation ─────────────────────────────
// Used by both the bulk generator and the single ad-hoc creator so
// the two paths can't drift apart on what counts as a valid slip.
// allowOverride lets a manager create an ad-hoc slip outside the
// normal rotation (e.g. a make-up delivery) without lying about it.
const validateDispatchDate = async (dispatchDate, cohort, { allowOverride = false } = {}) => {
  if (!dispatchDate)             fail(400, 'Dispatch date is required.');
  if (!COHORTS.includes(cohort)) fail(400, 'Cohort must be week1 or week2.');

  const date = new Date(dispatchDate);
  if (Number.isNaN(date.getTime())) fail(400, 'Dispatch date is not a valid date.');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (date < today) fail(400, 'Cannot create slips for a past date.');

  const anchor = await pickingRepository.getCohortAnchor();
  if (anchor) {
    const active = resolveActiveCohort(date, anchor);
    if (active !== cohort && !allowOverride) {
      fail(400,
        `${cohortLabel(cohort)} is not the scheduled rotation for ${dispatchDate} ` +
        `(${cohortLabel(active)} is). If this is a deliberate make-up delivery, use the ad-hoc slip creator with the override option.`
      );
    }
  }
  return date;
};

// ── Generate the week's slips (manager only) ──────────────────
const generateSlips = async ({ dispatchDate, cohort }, user) => {
  if (!isManager(user)) fail(403, 'Only managers can generate picking slips.');
  await validateDispatchDate(dispatchDate, cohort);   // strict — no override for the bulk weekly run

  return await pickingRepository.generateSlips({
    dispatchDate,
    cohort,
    generatedBy: user.id,   // from JWT — never trusted from frontend
  });
};

// ── Create a single ad-hoc slip (manager only) ────────────────
// For a late-registered ECD, a correction, or a make-up delivery
// outside that ECD's normal fortnightly rotation.
const createSlip = async ({ ecdId, dispatchDate, cohort, force }, user) => {
  if (!isManager(user)) fail(403, 'Only managers can create picking slips.');
  if (!ecdId)           fail(400, 'ECD is required.');
  await validateDispatchDate(dispatchDate, cohort, { allowOverride: force === true });

  const result = await pickingRepository.createSlip({
    ecdId,
    dispatchDate,
    cohort,
    generatedBy: user.id,
  });

  if (result.ecdNotFound)   fail(404, 'ECD not found, inactive, or not yet approved for dispatch.');
  if (result.alreadyExists) fail(409, 'A picking slip already exists for this ECD on this date.');
  return result;
};

// ── Claim a slip ──────────────────────────────────────────────
// A packer can only claim for themselves. A manager can reassign.
const assignSlip = async (slipId, body, user) => {
  const packerId = isManager(user) ? (body.packerId || user.id) : user.id;

  const result = await pickingRepository.assignSlip({ slipId, packerId, actorId: user.id });

  if (result.notFound) fail(404, 'Picking slip not found.');
  if (result.conflict) fail(409, 'This pallet is already being packed by someone else.');
  return result.slip;
};

// ── Confirm a line ────────────────────────────────────────────
const confirmItem = async (slipId, itemId, body, user) => {
  const packedQuantity = Number(body.packedQuantity);

  if (!Number.isFinite(packedQuantity)) fail(400, 'Packed quantity is required.');
  if (packedQuantity <= 0)              fail(400, 'Packed quantity must be greater than zero. Flag the item instead if you packed none.');

  const result = await pickingRepository.setItemStatus({
    slipId, itemId, status: 'confirmed', packedQuantity, actorId: user.id, canOverride: isManager(user),
  });

  if (result.notFound) fail(404, 'Picking slip item not found.');
  if (result.locked)   fail(409, 'This slip is already complete and cannot be changed.');
  if (result.forbidden) fail(403, 'You can only confirm items on a pallet assigned to you.');
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

  const result = await pickingRepository.setItemStatus({
    slipId, itemId, status: 'flagged', packedQuantity, flagReason: reason, actorId: user.id,
    canOverride: isManager(user),
  });

  if (result.notFound) fail(404, 'Picking slip item not found.');
  if (result.locked)   fail(409, 'This slip is already complete and cannot be changed.');
  if (result.forbidden) fail(403, 'You can only flag items on a pallet assigned to you.');
  return result.item;
};

// ── Complete a slip ───────────────────────────────────────────
// The rule from the business case: a picking slip cannot be marked
// complete until every required item is confirmed or flagged.
const completeSlip = async (slipId, body, user) => {
  const result = await pickingRepository.completeSlip({
    slipId,
    palletRef: body.palletRef,
    actorId:   user.id,
  });

  if (result.notFound)        fail(404, 'Picking slip not found.');
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
  createSlip,
  assignSlip,
  confirmItem,
  flagItem,
  completeSlip,
};
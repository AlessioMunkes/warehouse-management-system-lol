// ─────────────────────────────────────────────────────────────
// server/src/services/picking.service.js
//
// Business logic for the picking workflow.
// Validates data and enforces rules before touching the DB.
// ─────────────────────────────────────────────────────────────
import { closureOn, cohortForDate, cohortWeekdays } from '../features/calendar/calendar.service.js';
import pickingRepository from '../repositories/picking.repository.js';
import notices from '../features/communications/notices.js';
import { isManagerUp } from '../constants/permissions.js';
import pushService       from './push.service.js';

const COHORTS = ['tuesday', 'thursday'];
const STATUSES = ['pending', 'in_progress', 'complete', 'cancelled'];
const cohortLabel = (c) => (c === 'tuesday' ? 'Tuesday' : 'Thursday');

// Small helper so controllers can map errors to status codes without
// string-matching on messages the way delivery.controller does.
const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ── Weekly weekday pickup ────────────────────────────────────
// Every centre collects once a week with its cohort, Tuesday or
// Thursday by default, matching the real picking slips ("Pickup Day:
// Tuesday"). Which weekday each cohort collects on, and the days the
// warehouse is shut, come from the operating calendar
// (features/calendar). Very old data used week1/week2; the enum still
// lists them, unused.
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Same group as the routes' MANAGERS_UP — constants/permissions.js.
const isManager = isManagerUp;

// ── Product-line validation ──────────────────────────────────
// Shared by createSlip (a manager typing/adjusting lines instead of
// taking the centre's standing order as-is) and editSlip (replacing a
// pending slip's lines wholesale) — one place so the two paths can't
// drift on what counts as a valid line.
const cleanItemLines = (items) => {
  if (!Array.isArray(items) || items.length === 0) fail(400, 'A slip needs at least one product line.');

  const cleaned = items.map((line) => {
    const productId = Number(line.productId);
    const quantity  = Number(line.quantity);
    if (!Number.isInteger(productId) || productId <= 0) fail(400, 'Invalid product on the slip.');
    if (!Number.isFinite(quantity) || quantity <= 0)    fail(400, 'Every line needs a quantity greater than zero.');
    if (!line.unit)                                     fail(400, 'Every line needs a unit.');
    return { productId, quantity, unit: line.unit };
  });

  const seen = new Set();
  for (const line of cleaned) {
    if (seen.has(line.productId)) fail(400, 'The same product appears twice on this slip.');
    seen.add(line.productId);
  }
  return cleaned;
};

// ── List slips ────────────────────────────────────────────────
// Everyone sees the whole board by default — a packer has to be able
// to see unclaimed pallets in order to claim one. `mine=true` narrows
// a packer to the pallets already assigned to them; for a manager it
// is ignored, because a manager's board is the whole floor.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const getSlips = async (query, user) => {
  const { dispatchDate, from, to, cohort, status, mine } = query;

  if (cohort && !COHORTS.includes(cohort))   fail(400, 'Cohort must be tuesday or thursday.');
  if (status && !STATUSES.includes(status))  fail(400, 'Invalid status filter.');
  // Checked here so a malformed day is a 400 with a message rather
  // than a Postgres cast error coming back as a 500.
  if (from && !ISO_DAY.test(from)) fail(400, 'From must be a date (YYYY-MM-DD).');
  if (to && !ISO_DAY.test(to))     fail(400, 'To must be a date (YYYY-MM-DD).');
  if (from && to && from > to)     fail(400, 'From must be on or before To.');

  const assignedTo = (!isManager(user) && mine === 'true') ? user.id : undefined;

  return await pickingRepository.getSlips({ dispatchDate, from, to, cohort, status, assignedTo });
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
  if (!COHORTS.includes(cohort)) fail(400, 'Cohort must be tuesday or thursday.');

  const date = new Date(dispatchDate);
  if (Number.isNaN(date.getTime())) fail(400, 'Dispatch date is not a valid date.');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (date < today) fail(400, 'Cannot create slips for a past date.');

  const isoDate = String(dispatchDate).slice(0, 10);
  const closed = await closureOn(isoDate);
  if (closed && !allowOverride) {
    fail(400,
      `The warehouse is closed on ${isoDate} (${closed.label}). Choose another date, or check the operating calendar.`);
  }

  const scheduled = await cohortForDate(isoDate);
  if (scheduled !== cohort && !allowOverride) {
    const days = await cohortWeekdays();
    fail(400,
      (scheduled
        ? `${isoDate} is a ${cohortLabel(scheduled)} cohort pickup day, not ${cohortLabel(cohort)}.`
        : `${isoDate} is not a pickup day: the ${cohortLabel(cohort)} cohort collects on ${WEEKDAY_NAMES[days[cohort] - 1]}.`) +
      ` If this is a deliberate make-up delivery, use "Create a new slip" with the override option.`
    );
  }
  return date;
};

// ── Generate the week's slips (manager only) ──────────────────
// Returns { created, emptySlips } — emptySlips lists any ECD whose
// master data produced a slip with no lines, so the manager can fix
// it before packing starts rather than discovering an empty pallet.
const generateSlips = async ({ dispatchDate, cohort }, user) => {
  if (!isManager(user)) fail(403, 'Only managers can generate picking slips.');
  await validateDispatchDate(dispatchDate, cohort);   // strict — no override for the bulk weekly run

  const result = await pickingRepository.generateSlips({
    dispatchDate,
    cohort,
    generatedBy: user.id,   // from JWT — never trusted from frontend
    beforeCommit: notices.slipsGenerated,
  });

  // Buzz the floor's phones, but only for today's slips: that's all the
  // Packing tab lists, so a tap would find nothing for a later date.
  if (result.created > 0 && pushService.isForToday(dispatchDate)) {
    pushService.notifyFloor({
      title: `${result.created} new picking slip${result.created === 1 ? '' : 's'} on the floor`,
      body:  'Open Packing to claim a pallet.',
    });
  }
  return result;
};

// ── Create a single new slip (manager only) ────────────────────
// For a late-registered ECD, a correction, or a make-up delivery
// outside that ECD's normal weekly pickup day.
// `items`, when supplied, replaces the usual pull from the centre's
// standing order (ecd_order_lines) — a manager typed or adjusted the
// lines by hand, including via the client's meals-to-serve
// calculation. Omit it to keep pulling from the standing order.
const createSlip = async ({ ecdId, dispatchDate, cohort, force, items }, user) => {
  if (!isManager(user)) fail(403, 'Only managers can create picking slips.');
  if (!ecdId)           fail(400, 'ECD is required.');
  await validateDispatchDate(dispatchDate, cohort, { allowOverride: force === true });

  const cleanItems = items !== undefined ? cleanItemLines(items) : undefined;

  const result = await pickingRepository.createSlip({
    ecdId,
    dispatchDate,
    cohort,
    generatedBy: user.id,
    items: cleanItems,
    beforeCommit: notices.slipCreated,
  });

  if (result.ecdNotFound)   fail(404, 'ECD not found, inactive, or not yet approved for dispatch.');
  if (result.alreadyExists) fail(409, 'A picking slip already exists for this ECD on this date.');

  if (pushService.isForToday(dispatchDate)) {
    pushService.notifyFloor({
      title: 'New picking slip on the floor',
      body:  `${result.ecdName}. Open Packing to claim it.`,
    });
  }
  return result;
};

// ── Why a pallet cannot be claimed ────────────────────────────
// Written for the floor, not for the log. A packer who taps Claim on
// a pallet that has already gone needs to know that it has gone, not
// read a status name out of a database column.
const LOCKED_REASON = {
  complete:   'This pallet has already been closed off by packing, so it cannot be claimed again.',
  dispatched: 'This pallet has already been collected and has left the gate.',
  cancelled:  'This pallet was cancelled.',
};

// ── Claim a slip ──────────────────────────────────────────────
// A packer can only claim for themselves — a packerId in the body is
// ignored for them, so a crafted request cannot park a pallet on a
// colleague. A manager may name someone, and may take a pallet off
// whoever currently holds it (canOverride below); the repository
// records the previous holder in the audit event either way.
//
// Nobody, manager included, can claim a pallet packing has already
// closed. That guard lives in the repository, inside the row lock.
const assignSlip = async (slipId, body, user) => {
  const manager = isManager(user);

  // Validated rather than passed straight through: an unchecked
  // packerId reaches a foreign key and comes back as a 500 with a
  // Postgres message in it.
  if (manager && body.packerId !== undefined && body.packerId !== null && body.packerId !== '') {
    const parsed = Number(body.packerId);
    if (!Number.isInteger(parsed) || parsed <= 0) fail(400, 'That is not a valid packer.');
  }

  const packerId = manager ? (Number(body.packerId) || user.id) : user.id;

  const result = await pickingRepository.assignSlip({
    slipId,
    packerId,
    actorId:     user.id,
    canOverride: manager,
  });

  if (result.notFound) fail(404, 'Picking slip not found.');
  if (result.locked) {
    fail(409, LOCKED_REASON[result.status] || 'This pallet can no longer be claimed.');
  }
  if (result.conflict) {
    fail(409, 'This pallet is already being packed by someone else. A manager can reassign it.');
  }
  if (result.volunteerHeld) {
    fail(409, 'A volunteer is packing this pallet.');
  }
  return result.slip;
};

// ── Add a second packer ─────────────────────────────────────────
// Manager-only, same reasoning as naming someone else's primary
// assignment above: deciding a pallet needs two hands is a staffing
// call, not something a packer grants themselves or a colleague.
const addSecondPacker = async (slipId, body, user) => {
  if (!isManager(user)) fail(403, 'Only a manager can add a second packer.');

  const parsed = Number(body.packerId);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(400, 'That is not a valid packer.');

  const result = await pickingRepository.addSecondPacker({
    slipId, packerId: parsed, actorId: user.id,
  });

  if (result.notFound) fail(404, 'Picking slip not found.');
  if (result.locked) {
    fail(409, LOCKED_REASON[result.status] || 'This pallet can no longer be changed.');
  }
  if (result.noPrimary) fail(409, 'Assign a primary packer before adding a second one.');
  if (result.full) fail(409, 'This pallet already has two packers assigned.');
  return result.slip;
};

// ── Release a slip back to the floor ───────────────────────────
// The other half of assignSlip: there was no way to get assigned_to
// back to NULL once a claim had been made. This replaces the old
// "pick a specific worker" control — the manager's real lever is
// releasing a pallet back to the floor for whoever picks it up next,
// not naming who that has to be.
//
// A manager can release any claimed pallet. A packer can release only
// their own, and only before they have packed anything on it: a claim
// made by mistake is theirs to undo, a half-packed pallet is not.
const releaseSlip = async (slipId, user) => {
  const result = await pickingRepository.releaseSlip({
    slipId, actorId: user.id, beforeCommit: notices.slipReleased, ownOnly: !isManager(user),
  });

  if (result.notFound) fail(404, 'Picking slip not found.');
  if (result.notClaimed) fail(409, 'This pallet is not currently claimed by anyone.');
  if (result.notYours) fail(403, 'You can only release a pallet you claimed.');
  if (result.started) fail(409, 'You have started packing this pallet. Ask a manager to release it.');

  if (pushService.isForToday(result.slip.dispatch_date)) {
    pushService.notifyFloor({
      title: 'A pallet is back on the floor',
      body:  `${result.ecdName}. Open Packing to claim it.`,
    });
  }
  return result.slip;
};

// ── Edit a pending slip (manager only) ──────────────────────────
// Dispatch date/cohort and/or the full product-line list. Only
// reachable while the slip is 'pending' — the repository enforces
// this inside the row lock, same guard shape as every other mutation
// here; once it's claimed, a packer may already be looking at it.
const editSlip = async (slipId, body, user) => {
  if (!isManager(user)) fail(403, 'Only a manager can edit a picking slip.');

  const { dispatchDate, cohort, items, force } = body;

  if (dispatchDate !== undefined || cohort !== undefined) {
    if (!dispatchDate || !cohort) fail(400, 'Both dispatch date and cohort are required together.');
    await validateDispatchDate(dispatchDate, cohort, { allowOverride: force === true });
  }

  const cleanItems = items !== undefined ? cleanItemLines(items) : undefined;

  const result = await pickingRepository.editSlip({
    slipId,
    dispatchDate: dispatchDate || undefined,
    cohort: cohort || undefined,
    items: cleanItems,
    actorId: user.id,
  });

  if (result.notFound) fail(404, 'Picking slip not found.');
  if (result.locked) {
    fail(409, 'This pallet has already been claimed, so its date, cohort, and lines can no longer be edited.');
  }
  if (result.dateConflict) fail(409, 'This beneficiary already has a picking slip for that date.');
  return result.slip;
};

// ── Item note ─────────────────────────────────────────────────
// The paper slip's "Comment" column, on every line — not only a
// flagged one, which is what flagReason already covers. A substituted
// product, or anything else the floor needs on record that isn't a
// shortage. Optional; capped the same length as flagReason.
const cleanNote = (rawNote) => {
  if (rawNote === undefined || rawNote === null) return undefined;
  const note = String(rawNote).trim();
  if (!note) return undefined;
  if (note.length > 500) fail(400, 'Note is too long.');
  return note;
};

// ── Confirm a line ────────────────────────────────────────────
// Returns { ...item, variance } — variance is non-null when the
// packer confirmed a quantity other than the one the slip asked for.
// That is allowed (the packer is looking at the actual pallet), but
// it travels back to the UI so the line is visibly marked rather
// than counted as a clean confirm.
const confirmItem = async (slipId, itemId, body, user) => {
  const packedQuantity = Number(body.packedQuantity);

  if (!Number.isFinite(packedQuantity)) fail(400, 'Packed quantity is required.');
  if (packedQuantity <= 0)              fail(400, 'Packed quantity must be greater than zero. Flag the item instead if you packed none.');

  const result = await pickingRepository.setItemStatus({
    slipId, itemId, status: 'confirmed', packedQuantity, note: cleanNote(body.note),
    actorId: user.id, canOverride: isManager(user),
  });

  if (result.notFound) fail(404, 'Picking slip item not found.');
  if (result.locked)   fail(409, 'This slip is already complete and cannot be changed.');
  if (result.forbidden) fail(403, 'You can only confirm items on a pallet assigned to you.');
  return { ...result.item, variance: result.variance ?? null };
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
    slipId, itemId, status: 'flagged', packedQuantity, flagReason: reason, note: cleanNote(body.note),
    actorId: user.id, canOverride: isManager(user),
  });

  if (result.notFound) fail(404, 'Picking slip item not found.');
  if (result.locked)   fail(409, 'This slip is already complete and cannot be changed.');
  if (result.forbidden) fail(403, 'You can only flag items on a pallet assigned to you.');
  return result.item;
};

// ── Complete a slip ───────────────────────────────────────────
// The rule from the business case: a picking slip cannot be marked
// complete until every required item is confirmed or flagged.
//
// Returns the WHOLE repository result — { slip, shortfalls?,
// unitMismatches? } — not just the slip. Returning result.slip alone
// meant the shortfall warning the repository worked out was thrown
// away before it reached the manager, and the client's `result.slip`
// came back undefined.
const completeSlip = async (slipId, body, user) => {
  const result = await pickingRepository.completeSlip({
    slipId,
    palletRef:   body.palletRef,
    actorId:     user.id,
    canOverride: isManager(user),
  });

  if (result.notFound)        fail(404, 'Picking slip not found.');
  if (result.alreadyComplete) fail(409, 'This slip is already complete.');
  if (result.forbidden)       fail(403, 'You can only close a pallet assigned to you.');
  if (result.pendingItems) {
    const n = Number(result.pendingItems);
    fail(422, `${n} ${n === 1 ? 'item still needs' : 'items still need'} to be confirmed or flagged before this pallet can be closed.`);
  }
  return result;
};

// ── Assignable workers (manager only) ──────────────────────────
const getAssignableWorkers = async (user) => {
  if (!isManager(user)) fail(403, 'Only managers can view assignable workers.');
  return pickingRepository.getAssignableWorkers();
};

export default {
  getSlips,
  getSlipById,
  generateSlips,
  createSlip,
  assignSlip,
  addSecondPacker,
  releaseSlip,
  editSlip,
  confirmItem,
  flagItem,
  completeSlip,
  getAssignableWorkers,
};
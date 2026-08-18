// ─────────────────────────────────────────────────────────────
// server/src/services/dispatch.service.js
//
// Business logic for the dispatch gate.
// Validates data and enforces rules before touching the DB.
//
// The governing principle here is the same one that shaped the stock
// repository: the system never stops food leaving the building
// because of a data problem. Almost everything the gate checks is
// therefore a FLAG the screen shows, not an error that refuses the
// request. There is exactly one hard block — an ECD centre that is
// not active (BR-11) — because that is a governance decision made
// upstream by the programme team, not a discrepancy between a number
// in a database and a number on a shelf.
//
// Everything else (wrong cohort day BR-12, an unpacked slip, a
// collection after the 16:00 write-off) proceeds on a manager
// override with a recorded reason, which is what the paper process
// already does when Grizel signs off an exception at the gate.
// ─────────────────────────────────────────────────────────────
import dispatchRepository from '../repositories/dispatch.repository.js';
import { ROLES }          from '../middleware/auth.middleware.js';

const COHORTS  = ['week1', 'week2'];
const STATUSES = ['awaiting', 'collected', 'late_collected', 'not_collected', 'cancelled'];

// BR-14. Kept as a constant rather than a settings row for now — if
// the sponsor ever wants it configurable, move it to picking_settings
// alongside cohort_anchor_monday rather than adding a second
// settings mechanism.
const NON_COLLECTION_CUTOFF_HOUR = 16;

// Signatures arrive as base64 PNG data URLs from a canvas, the same
// way delivery notes already store them. A signature from a phone
// canvas is a few tens of KB; the cap is there so a malformed client
// cannot push a multi-megabyte payload into a TEXT column on every
// collection.
const MAX_SIGNATURE_BYTES = 512 * 1024;

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const isManager = (user) => user.role === ROLES.MANAGER || user.role === ROLES.ADMIN;

// node-postgres parses a DATE column into a JS Date at LOCAL
// midnight, so toISOString() on it shifts a day backwards for
// anywhere east of UTC — which includes Cape Town. Formatting from
// the local components instead keeps "is this pallet for today?"
// answering correctly at the gate at 08:00 on a Tuesday.
const toDateString = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayString = () => toDateString(new Date());

// ── Eligibility ───────────────────────────────────────────────
// Computed in one place so the gate screen and the collect endpoint
// can never disagree about whether a pallet needs an override. The
// screen renders these as warnings; collect() below reads the same
// object to decide what it insists on.
const evaluateEligibility = (gateView) => {
  const now         = new Date();
  const dispatchDay = toDateString(gateView.dispatch_date);

  return {
    ecdInactive:      gateView.ecd_is_active === false || gateView.ecd_approved_at === null,
    slipNotPacked:    !['complete', 'dispatched'].includes(gateView.slip_status),
    wrongDay:         dispatchDay !== null && dispatchDay !== todayString(),
    afterCutoff:      now.getHours() >= NON_COLLECTION_CUTOFF_HOUR,
    writtenOff:       gateView.dispatch_status === 'not_collected',
    alreadyDispatched: ['collected', 'late_collected'].includes(gateView.dispatch_status),
    hasFlaggedLines:  (gateView.items || []).some((i) => i.status === 'flagged'),
    hasVariance:      (gateView.items || []).some(
      (i) => i.status === 'confirmed' &&
             i.packed_quantity !== null &&
             Number(i.packed_quantity) !== Number(i.required_quantity)
    ),
  };
};

// ── The gate board ────────────────────────────────────────────
// Runs the 16:00 sweep opportunistically. Render's scheduler is the
// primary trigger, but a cron job that silently stops firing is not
// something anyone notices until a month of stock counts is wrong, so
// the board also sweeps whenever it is loaded after the cutoff for a
// past-or-present date. sweepNonCollections is idempotent, so the two
// triggers cannot conflict.
const getBoard = async (query, user) => {
  const { dispatchDate, cohort, status } = query;

  if (cohort && !COHORTS.includes(cohort))   fail(400, 'Cohort must be week1 or week2.');
  if (status && !STATUSES.includes(status))  fail(400, 'Invalid dispatch status filter.');

  if (dispatchDate) {
    const isPast     = dispatchDate < todayString();
    const pastCutoff = new Date().getHours() >= NON_COLLECTION_CUTOFF_HOUR;
    if (isPast || (dispatchDate === todayString() && pastCutoff)) {
      await dispatchRepository.sweepNonCollections({ dispatchDate, actorId: user.id });
    }
  }

  return await dispatchRepository.getBoard({ dispatchDate, cohort, status });
};

// ── One pallet at the gate ────────────────────────────────────
const getGateView = async (slipId) => {
  const gateView = await dispatchRepository.getGateView(slipId);
  if (!gateView) fail(404, 'Picking slip not found.');

  return { ...gateView, eligibility: evaluateEligibility(gateView) };
};

// ── Validate the collection payload ───────────────────────────
const validateCollectBody = (body) => {
  const driverName = (body.driverName || '').trim();
  if (!driverName)             fail(400, 'The driver\'s name is required.');
  if (driverName.length > 120) fail(400, 'Driver name is too long.');

  // BR-13: a collection is not complete without digital confirmation.
  // This is the one piece of validation that is genuinely strict,
  // because the signature IS the proof of delivery that replaces the
  // paper register — a collection recorded without it is worth less
  // than the paper it replaced.
  const signature = body.signature;
  if (!signature || typeof signature !== 'string' || !signature.startsWith('data:image/')) {
    fail(400, 'The driver needs to sign before the collection can be recorded.');
  }
  if (Buffer.byteLength(signature, 'utf8') > MAX_SIGNATURE_BYTES) {
    fail(400, 'The signature image is too large.');
  }

  const vehicleReg = (body.vehicleReg || '').trim() || null;
  if (vehicleReg && vehicleReg.length > 20) fail(400, 'Vehicle registration is too long.');

  const rawLines = body.lines === undefined ? [] : body.lines;
  if (!Array.isArray(rawLines)) fail(400, 'Line corrections must be a list.');

  const lines = rawLines.map((line) => {
    const itemId = Number(line?.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) fail(400, 'Each line correction needs a valid item.');

    const loadedQuantity = Number(line.loadedQuantity);
    if (!Number.isFinite(loadedQuantity) || loadedQuantity < 0) {
      fail(400, 'A loaded quantity must be zero or more.');
    }

    const varianceReason = (line.varianceReason || '').trim() || null;
    if (varianceReason && varianceReason.length > 500) fail(400, 'Variance reason is too long.');

    return { itemId, loadedQuantity, varianceReason };
  });

  // A UUID from the client. Validated in shape only — it is a replay
  // key, not a credential, and a collision is a client bug rather
  // than an attack surface.
  const idempotencyKey = body.idempotencyKey ?? null;
  if (idempotencyKey !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    fail(400, 'Invalid request key.');
  }

  const overrideReason = (body.overrideReason || '').trim() || null;
  if (overrideReason && overrideReason.length > 500) fail(400, 'Override reason is too long.');

  return { driverName, vehicleReg, signature, lines, idempotencyKey, overrideReason };
};

// ── Record a collection ───────────────────────────────────────
const collect = async (slipId, body, user) => {
  const payload = validateCollectBody(body);

  const gateView = await dispatchRepository.getGateView(slipId);
  if (!gateView) fail(404, 'Picking slip not found.');

  const eligibility = evaluateEligibility(gateView);

  // The one hard block.
  if (eligibility.ecdInactive) {
    fail(409,
      `${gateView.ecd_name} is not an active centre with approved quantities, so a pallet cannot be released to it. ` +
      `A manager needs to activate the centre first.`
    );
  }

  if (eligibility.alreadyDispatched && !payload.idempotencyKey) {
    fail(409, 'This pallet has already been collected.');
  }

  // ── Override-gated exceptions ──────────────────────────────
  // Each one names what is wrong and what to do about it, in the
  // words the person at the gate would use (ACC-09). "Requires
  // authorisation" tells a warehouse worker nothing actionable; "ask
  // a manager to authorise it" does.
  const needsOverride = [];
  if (eligibility.wrongDay) {
    needsOverride.push(
      `${gateView.ecd_name} is booked for ${toDateString(gateView.dispatch_date)}, not today`
    );
  }
  if (eligibility.slipNotPacked) {
    needsOverride.push('this pallet has not been closed off by the packing team yet');
  }
  if (eligibility.writtenOff) {
    needsOverride.push('this pallet was already recorded as not collected at 16:00');
  }

  if (needsOverride.length > 0) {
    if (!isManager(user)) {
      fail(403,
        `${needsOverride.join(', and ')}. Ask a manager to authorise this collection at the gate.`
      );
    }
    if (!payload.overrideReason) {
      fail(400,
        `${needsOverride.join(', and ')}. Record a short reason for authorising it.`
      );
    }
  }

  const result = await dispatchRepository.collect({
    slipId,
    driverName:     payload.driverName,
    vehicleReg:     payload.vehicleReg,
    signature:      payload.signature,
    lines:          payload.lines,
    idempotencyKey: payload.idempotencyKey,
    overrideReason: payload.overrideReason,
    actorId:        user.id,
  });

  if (result.notFound)          fail(404, 'Picking slip not found.');
  if (result.notPacked)         fail(409, 'This pallet has not been packed yet.');
  if (result.alreadyDispatched) fail(409, 'This pallet has already been collected.');

  return result;
};

// ── Run the 16:00 sweep on demand (manager only) ──────────────
// The scheduler calls the same service method. Exposed to managers
// too so a sweep can be forced after a power cut or a deploy that
// happened to land across 16:00.
const sweep = async (body, user) => {
  if (!isManager(user)) fail(403, 'Only managers can run the non-collection sweep.');

  const dispatchDate = body.dispatchDate || todayString();
  if (Number.isNaN(new Date(dispatchDate).getTime())) fail(400, 'Dispatch date is not a valid date.');

  return await dispatchRepository.sweepNonCollections({ dispatchDate, actorId: user.id });
};

// ── Dispatch note ─────────────────────────────────────────────
// Readable by every warehouse role including finance — it is the
// proof-of-collection document, and finance needs it to reconcile the
// weekly cost-of-sales figure (BR-16).
const getDispatchNote = async (eventId) => {
  const note = await dispatchRepository.getDispatchNote(eventId);
  if (!note) fail(404, 'Dispatch note not found.');
  return note;
};

// ── Non-collection history (BR-26) ────────────────────────────
const getNonCollectionHistory = async (query, user) => {
  if (!isManager(user) && user.role !== ROLES.FINANCE) {
    fail(403, 'Only managers can view non-collection history.');
  }

  const { ecdId, from, to } = query;
  if (ecdId !== undefined && !Number.isInteger(Number(ecdId))) fail(400, 'Invalid ECD centre.');
  if (from && Number.isNaN(new Date(from).getTime()))          fail(400, '"From" is not a valid date.');
  if (to && Number.isNaN(new Date(to).getTime()))              fail(400, '"To" is not a valid date.');

  return await dispatchRepository.getNonCollectionHistory({
    ecdId: ecdId === undefined ? undefined : Number(ecdId),
    from,
    to,
  });
};

export default {
  getBoard,
  getGateView,
  collect,
  sweep,
  getDispatchNote,
  getNonCollectionHistory,
};
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
// request. There is exactly one hard block — a beneficiary centre
// that is not active (BR-11) — because that is a governance decision made
// upstream by the programme team, not a discrepancy between a number
// in a database and a number on a shelf.
//
// Two things (a pallet booked for another day, and a slip packing has
// not closed off) proceed on a manager override with a recorded
// reason, which is what the paper process already does when Grizel
// signs off an exception at the gate.
//
// A collection after the 16:00 write-off is NOT one of them. It is
// recorded — the event becomes 'late_collected' and the day shows it
// as late — and otherwise proceeds exactly as an on-time collection
// does, with no override, no manager and no extra taps. The sweep
// exists to keep the non-collection history honest at the end of a
// day, not to close the gate at 16:00.
// ─────────────────────────────────────────────────────────────
import dispatchRepository from '../repositories/dispatch.repository.js';
import { ROLES }          from '../middleware/auth.middleware.js';
import { isValidDateString, isPositiveInt } from '../utils/validation.js';
import { DISPATCH_SORTS, SORT_DIRECTIONS } from '../constants/receiptSort.js';

const COHORTS  = ['week1', 'week2'];
const STATUSES = ['awaiting', 'collected', 'late_collected', 'not_collected', 'cancelled'];

// BR-14. Kept as a constant rather than a settings row for now — if
// the sponsor ever wants it configurable, move it to picking_settings
// alongside cohort_anchor_monday rather than adding a second
// settings mechanism.
export const NON_COLLECTION_CUTOFF_HOUR = 16;

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

// ─────────────────────────────────────────────────────────────
// TIME
//
// Two different questions get asked about time in this file, and they
// need two different tools. Conflating them is what broke both.
//
//   "What date is this pallet booked for?"  — a DATE column.
//   "What is the time in the warehouse?"    — an instant.
//
// The server runs in UTC. Render containers always do, and nothing in
// the deploy sets TZ, so process.env.TZ is unset and every JS date
// method that says "local" means UTC. Cape Town is UTC+2.
//
// The bug this replaces: both the 16:00 cutoff and "is this pallet
// for today?" were read with getHours()/getFullYear() off a plain
// new Date(). On a developer's laptop that gave the right answer and
// on Render it gave a UTC one, so BR-14's 16:00 write-off actually
// fired at 18:00 SAST — two hours after the gate closed, every day —
// and the day itself rolled over at 02:00 SAST rather than midnight.
//
// South Africa has no daylight saving and has not since 1944, so a
// fixed offset is exact here. It is also more honest than
// Intl/timeZone lookups, which would silently depend on the
// container's ICU data being present and current.
// ─────────────────────────────────────────────────────────────
export const SAST_OFFSET_MINUTES = 2 * 60;

const pad = (n) => String(n).padStart(2, '0');

// Shift the instant forward by the offset, then read UTC components.
// UTC components are the same number on every machine, so this
// answers "what time is it in Cape Town" identically in CI, on a
// laptop, and on Render.
const sastNow = () => new Date(Date.now() + SAST_OFFSET_MINUTES * 60 * 1000);

// Today's date in the warehouse.
export const todayString = () => {
  const d = sastNow();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// The hour on the warehouse clock, 0-23. What BR-14's cutoff is
// compared against.
export const currentHour = () => sastNow().getUTCHours();

// ── Formatting a DATE column ──────────────────────────────────
// DELIBERATELY different from the above, and not interchangeable
// with it. node-postgres parses a DATE into a JS Date at LOCAL
// midnight, so '2026-08-19' becomes midnight-in-whatever-zone-this-
// process-is. Reading the LOCAL components back gives the original
// string on any machine; toISOString() would shift it a day backwards
// anywhere east of UTC.
//
// Only ever pass this a value that came out of a DATE column. Passing
// it new Date() is what produced the wrong "today" — that is what
// todayString() above is for.
export const pgDateToString = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── Date input from a client ──────────────────────────────────
// isValidDateString lives in utils/validation.js now, not here.
// delivery.service.js needs exactly the same check, and a second copy
// of a validator is how the movement_type constraint and the role
// constants both drifted. See that file for why new Date(x) is not a
// validator.
//
// Why it matters at this particular call site: dispatchDate reaches
// Postgres as $1::date, and the sweep trigger below is a STRING
// compare — so '0000-99-99' reads as a past date and triggers a WRITE
// before anything gets as far as a cast error.

// ── Eligibility ───────────────────────────────────────────────
// Computed in one place so the gate screen and the collect endpoint
// can never disagree about whether a pallet needs an override. The
// screen renders these as warnings; collect() below reads the same
// object to decide what it insists on.
export const evaluateEligibility = (gateView) => {
  const dispatchDay = pgDateToString(gateView.dispatch_date);

  return {
    ecdInactive:      gateView.ecd_is_active === false || gateView.ecd_approved_at === null,
    slipNotPacked:    !['complete', 'dispatched'].includes(gateView.slip_status),
    wrongDay:         dispatchDay !== null && dispatchDay !== todayString(),
    afterCutoff:      currentHour() >= NON_COLLECTION_CUTOFF_HOUR,
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
  const { dispatchDate, cohort, status, scope } = query;

  if (cohort && !COHORTS.includes(cohort))   fail(400, 'Cohort must be week1 or week2.');
  if (status && !STATUSES.includes(status))  fail(400, 'Invalid dispatch status filter.');
  if (scope !== undefined && scope !== 'gate') {
    fail(400, "Scope must be 'gate' if supplied.");
  }

  // Validated BEFORE it is compared or passed on. The comparison
  // below is a string compare, which happily calls '0000-99-99' a
  // past date and triggers a write against a value Postgres cannot
  // cast.
  if (dispatchDate !== undefined && !isValidDateString(dispatchDate)) {
    fail(400, 'Dispatch date must be a real date in YYYY-MM-DD form.');
  }

  // scope=gate carries no date of its own, so "today" is resolved
  // here rather than in SQL — todayString() is the one place that
  // knows the service runs in UTC and the warehouse does not.
  const gateToday = (!dispatchDate && scope === 'gate') ? todayString() : undefined;

  if (dispatchDate) {
    const today      = todayString();
    const isPast     = dispatchDate < today;
    const pastCutoff = currentHour() >= NON_COLLECTION_CUTOFF_HOUR;
    if (isPast || (dispatchDate === today && pastCutoff)) {
      await dispatchRepository.sweepNonCollections({ dispatchDate, actorId: user.id });
    }
  } else if (gateToday && currentHour() >= NON_COLLECTION_CUTOFF_HOUR) {
    // The gate board is the other place the sweep gets triggered from
    // (see the note above this function). Dropping the date filter
    // must not also drop that trigger, or an afternoon where nobody
    // opens the dated board leaves the day unswept.
    await dispatchRepository.sweepNonCollections({ dispatchDate: gateToday, actorId: user.id });
  }

  return await dispatchRepository.getBoard({ dispatchDate, cohort, status, gateToday });
};

// ── Past collections, for the staff history page ─────────────────
// Same range shape delivery.service.js's getDeliveries already uses —
// an unrecognised or missing range quietly falls back to 'all' rather
// than failing, since this is a read the whole staff team should be
// able to reach without worrying about the exact query string.
const VALID_HISTORY_RANGES = ['today', 'week', 'month', 'all'];
const getHistory = async (range) => {
  const safeRange = VALID_HISTORY_RANGES.includes(range) ? range : 'all';
  return await dispatchRepository.getHistory(safeRange);
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
  if (eligibility.slipNotPacked) {
    needsOverride.push('this pallet has not been closed off by the packing team yet');
  }
  // wrongDay is DELIBERATELY not in this list, for the same reason
  // writtenOff is not (see below).
  //
  // BR-12 says a pallet is booked for a cohort day. It does not say
  // food may not leave the building on any other day, and a driver
  // standing at the gate with a vehicle has already solved a harder
  // logistics problem than the calendar has. Blocking here meant a
  // centre that missed Tuesday could not collect until a manager was
  // physically found — and the manager's answer was always going to
  // be yes, because the alternative is food sitting in Epping while
  // children do not eat.
  //
  // It became untenable once the gate board stopped filtering to
  // today: the board now shows every pallet still outstanding on any
  // date, precisely so stale ones can be released, and EVERY one of
  // those trips wrongDay by definition. The block would have gated
  // the entire feature behind a manager.
  //
  // Recorded, not ignored. The collection is flagged wrong_day in the
  // audit log with the date it was actually booked for, so BR-26
  // reporting and any manager review still see it. Same principle as
  // shortfall and unit mismatch: the system records what happened
  // rather than refusing to let it happen.
  // writtenOff is DELIBERATELY not in this list.
  //
  // BR-14's 16:00 sweep is a bookkeeping act, not a gate closure. It
  // writes a 'not_collected' event so the non-collection history
  // (BR-26) is accurate for a day that has otherwise ended; it does
  // not mean the food has gone anywhere. If the driver turns up at
  // 16:40 the pallet is still on the floor and still theirs, and the
  // collection proceeds exactly as an on-time one would — the
  // repository upgrades the existing event to 'late_collected' and
  // deducts stock as normal, which is the flag.
  //
  // Requiring a manager here made the sweep a lock: the board sweeps
  // opportunistically whenever it is loaded after 16:00, so from
  // 16:00 onwards every remaining pallet became un-collectable by the
  // warehouse worker actually standing at the gate. That inverts the
  // rule that runs through this whole file — nothing stops food
  // leaving the building over a data disagreement — and the data
  // disagreement here is with a clock.

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
    // Advisory, not a gate. Recorded against the collection so a
    // manager reviewing BR-26 can see it went out off-schedule.
    wrongDay:       eligibility.wrongDay,
    bookedFor:      eligibility.wrongDay ? pgDateToString(gateView.dispatch_date) : null,
  });

  if (result.notFound)          fail(404, 'Picking slip not found.');
  if (result.notPacked)         fail(409, 'This pallet has not been packed yet.');
  if (result.alreadyDispatched) fail(409, 'This pallet has already been collected.');

  // The gate screen pops up the dispatch note the moment a collection
  // succeeds (the same pattern receiving's note follows). Fetching the
  // full joined note here — one extra LOCAL query, on a connection
  // already open — means the gate screen doesn't have to make a
  // second HTTP round trip for it, the same fix applied to
  // delivery.service.js's createDelivery.
  const note = await dispatchRepository.getDispatchNote(result.event.id);
  return { ...result, note };
};

// ── Run the 16:00 sweep on demand (manager only) ──────────────
// The scheduler calls the same service method. Exposed to managers
// too so a sweep can be forced after a power cut or a deploy that
// happened to land across 16:00.
const sweep = async (body, user) => {
  if (!isManager(user)) fail(403, 'Only managers can run the non-collection sweep.');

  const dispatchDate = body.dispatchDate || todayString();
  if (!isValidDateString(dispatchDate)) {
    fail(400, 'Dispatch date must be a real date in YYYY-MM-DD form.');
  }

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

// ── The goods-out archive ─────────────────────────────────────
// Open to every logged-in role, matching GET /notes/:eventId and the URS,
// which says the dispatch note is viewable by staff, admin and management.
// Non-collection HISTORY stays manager-only below — that is a compliance
// view about a centre's behaviour, not a receipt.
const ARCHIVE_MAX_PAGE_SIZE     = 100;
const ARCHIVE_DEFAULT_PAGE_SIZE = 25;

const listDispatchNotes = async (query = {}) => {
  const { from, to, ecdId, cohort, status, search, sort, dir, limit, offset } = query || {};

  if (sort !== undefined && sort !== '' && !(sort in DISPATCH_SORTS)) {
    fail(400, `Sort must be one of: ${Object.keys(DISPATCH_SORTS).join(', ')}.`);
  }
  if (dir !== undefined && dir !== '' && !SORT_DIRECTIONS.includes(dir)) {
    fail(400, 'Sort direction must be asc or desc.');
  }

  if (from !== undefined && from !== '' && !isValidDateString(from)) {
    fail(400, '"From" must be a real date in YYYY-MM-DD form.');
  }
  if (to !== undefined && to !== '' && !isValidDateString(to)) {
    fail(400, '"To" must be a real date in YYYY-MM-DD form.');
  }
  if (from && to && from > to) {
    fail(400, '"From" cannot be after "to".');
  }
  if (ecdId !== undefined && ecdId !== '' && !isPositiveInt(ecdId)) {
    fail(400, 'Invalid beneficiary.');
  }
  if (cohort && !COHORTS.includes(cohort)) {
    fail(400, 'Cohort must be week1 or week2.');
  }
  // 'awaiting' is excluded deliberately: an awaiting event is a pallet still
  // standing in the yard, which is the board's business, not the archive's.
  if (status && !STATUSES.includes(status)) {
    fail(400, 'Invalid dispatch status filter.');
  }

  const safeLimit = Math.min(
    Math.max(parseInt(limit, 10) || ARCHIVE_DEFAULT_PAGE_SIZE, 1),
    ARCHIVE_MAX_PAGE_SIZE
  );
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const cleanSearch = typeof search === 'string' && search.trim()
    ? search.trim().slice(0, 100)
    : null;

  const rows = await dispatchRepository.listDispatchNotes({
    from:   from || null,
    to:     to   || null,
    ecdId:  ecdId ? Number(ecdId) : null,
    cohort: cohort || null,
    status: status || null,
    search: cleanSearch,
    sort:   sort || 'collected_at',
    dir:    dir  || 'desc',
    limit:  safeLimit,
    offset: safeOffset,
  });

  const total = rows.length ? Number(rows[0].total_count) : 0;

  return {
    rows: rows.map(({ total_count, ...row }) => row),   // eslint-disable-line no-unused-vars
    total,
    limit:  safeLimit,
    offset: safeOffset,
  };
};

const getDispatchBeneficiaryOptions = async () =>
  await dispatchRepository.getDispatchBeneficiaryOptions();

// ── Non-collection history (BR-26) ────────────────────────────
const getNonCollectionHistory = async (query, user) => {
  if (!isManager(user)) {
    fail(403, 'Only managers can view non-collection history.');
  }

  const { ecdId, from, to } = query;

  // Number('') is 0 and Number.isInteger(0) is true, so the old check
  // let an empty ecdId through as centre 0 and quietly returned
  // nothing instead of the unfiltered history the caller asked for.
  if (ecdId !== undefined && ecdId !== '' && !isPositiveInt(ecdId)) {
    fail(400, 'Invalid beneficiary centre.');
  }
  if (from !== undefined && from !== '' && !isValidDateString(from)) {
    fail(400, '"From" must be a real date in YYYY-MM-DD form.');
  }
  if (to !== undefined && to !== '' && !isValidDateString(to)) {
    fail(400, '"To" must be a real date in YYYY-MM-DD form.');
  }

  return await dispatchRepository.getNonCollectionHistory({
    ecdId: ecdId === undefined || ecdId === '' ? undefined : Number(ecdId),
    from:  from || undefined,
    to:    to   || undefined,
  });
};

export { isValidDateString };

export default {
  getBoard,
  getHistory,
  getGateView,
  collect,
  sweep,
  getDispatchNote,
  listDispatchNotes,
  getDispatchBeneficiaryOptions,
  getNonCollectionHistory,
};

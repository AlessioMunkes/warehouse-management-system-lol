// ─────────────────────────────────────────────────────────────
// server/src/services/slipAccess.service.js
//
// The guest half of the picking flow: reaching a slip without an
// account, claiming it, and then packing it.
//
// The packing itself is NOT reimplemented here. Confirm, flag and
// complete all go through pickingRepository, the same functions the
// staff flow uses, with a volunteer actor instead of a user actor. A
// second implementation of "is this pallet short of stock" would drift
// from the first, and the one that drifted would be the one nobody was
// watching.
//
// Nothing in this file reads or writes the Love Activism / VMS tables.
// ─────────────────────────────────────────────────────────────
import pool              from '../config/db.js';
import slipAccessRepo    from '../repositories/slipAccess.repository.js';
import pickingRepository from '../repositories/picking.repository.js';

const fail = (status, message, extra = {}) => {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  throw err;
};

// One message for "no such token" and for "a token you may not use".
// Telling them apart would turn the endpoint into an oracle for probing
// which codes exist, and a volunteer cannot act on the difference
// anyway — either way, the paper in their hand did not work.
const NOT_FOUND = 'That code did not match a pallet. Check the code, or ask a staff member.';

// SAST, not UTC. Render runs in UTC and Cape Town is UTC+2, so for two
// hours either side of midnight the server's idea of "today" is a day
// behind the warehouse's. Same rule as volunteer.repository.js.
const todayInSAST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

// Shape the row once. Everything public-facing goes through here, so a
// column added to the query cannot leak into a response by accident.
const toPreview = (row) => ({
  id:              row.id,
  beneficiaryName: row.beneficiary_name ?? null,
  beneficiaryKind: row.beneficiary_kind ?? null,
  dispatchDate:    row.dispatch_date,
  itemCount:       row.item_count,
  status:          row.status,
  isClaimed:       row.is_claimed,
});

// ── 1.1 Public preview by token ───────────────────────────────
const getPreviewByToken = async (token) => {
  const row = await slipAccessRepo.getPreviewByToken(token);
  if (!row) fail(404, NOT_FOUND);
  return toPreview(row);
};

// ── 1.2 Public preview by short code ──────────────────────────
// An ambiguous code is refused outright. Resolving it by picking the
// newest, or the only unclaimed one, would silently hand a volunteer a
// pallet that is not the one in their hand, and nothing downstream would
// look wrong.
const getPreviewByShortCode = async (code) => {
  const rows = await slipAccessRepo.findPreviewsByShortCode(code);
  if (rows.length === 0) fail(404, NOT_FOUND);
  if (rows.length > 1) {
    fail(409,
      'That 6-character code matches more than one pallet. ' +
      'Please scan the QR code instead, or sign in as a guest and pick your pallet from the list.',
      { ambiguous: true });
  }
  return toPreview(rows[0]);
};

// Resolve either form to one slip. Used by claim, which accepts whatever
// the volunteer had to hand.
const resolveSlip = async ({ token, code }) => {
  if (token) return await getPreviewByToken(token);
  if (code)  return await getPreviewByShortCode(code);
  return fail(400, 'A pallet code is required.');
};

// ── 1.3 Claim ─────────────────────────────────────────────────
// Creates the volunteer via the same INSERT the gate sign-in uses, then
// binds the slip to them. The caller issues the JWT — this returns the
// volunteer so the route can sign it, keeping token-minting in one place.
//
// Not wrapped in a single transaction across both writes on purpose. If
// the claim fails, the volunteer row still stands: they ARE in the
// building and the arrival record should say so, whether or not they
// ended up packing anything.
const claim = async ({ token, code, name }) => {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed)             fail(400, 'Please tell us your name so we can thank you.');
  if (trimmed.length > 200) fail(400, 'That name is too long.');

  const preview = await resolveSlip({ token, code });

  if (!slipAccessRepo.CLAIMABLE_STATUSES.includes(preview.status)) {
    fail(409, 'That pallet is already finished. Ask a staff member for another one.');
  }

  // source is always 'guest_login'. It is the only seam that will later
  // distinguish a walk-in from a VMS-booked volunteer — see the
  // integration boundary in the brief.
  const inserted = await pool.query(
    `INSERT INTO volunteers (full_name, source)
     VALUES ($1, 'guest_login')
     RETURNING id, full_name, signed_in_at`,
    [trimmed],
  );
  const volunteer = inserted.rows[0];

  const result = await slipAccessRepo.claimForVolunteer({
    slipId: preview.id,
    volunteerId: volunteer.id,
  });

  if (result.notFound)        fail(404, NOT_FOUND);
  if (result.locked)          fail(409, 'That pallet is already finished. Ask a staff member for another one.');
  if (result.takenByStaff)    fail(409, 'A staff member is already packing that pallet. Ask them for another one.');
  if (result.takenByVolunteer) fail(409, 'Someone else is already packing that pallet. Ask a staff member for another one.');

  // `preview` is ALREADY a toPreview() result — camelCase, with
  // beneficiary_name COALESCEd to the ECD name and dispatch_date cast to
  // text. `result.slip` is a raw `RETURNING *` row: snake_case, a null
  // beneficiary_name, and a dispatch_date that node-postgres has turned
  // into a Date.
  //
  // Running the raw row back through toPreview() (which reads
  // snake_case) produced a response with beneficiaryName null, the
  // dispatch date a day early in UTC, and itemCount/isClaimed missing
  // altogether. Take the preview as built and override only what the
  // claim actually changed.
  return {
    volunteer,
    slip: { ...preview, status: result.slip.status, isClaimed: true },
  };
};

// ── 1.4 Today's unclaimed pallets ─────────────────────────────
const listAvailable = async () => {
  const rows = await slipAccessRepo.listUnclaimedForDate(todayInSAST());
  return rows.map(toPreview);
};

// ── 1.5 The guest's own slip ──────────────────────────────────
// Resolved from the token, never from a slip id in the request. A guest
// cannot name a slip, so there is no id to tamper with: the only pallet
// reachable here is the one bound to their volunteer row.
const volunteerActor = (user) => ({ type: 'volunteer', id: user.id });

const getMySlip = async (user) => {
  const slipId = await slipAccessRepo.findSlipIdForVolunteer(user.id);
  if (!slipId) fail(404, 'You have not picked a pallet yet.');

  const slip = await pickingRepository.getSlipById(slipId);
  if (!slip) fail(404, 'You have not picked a pallet yet.');

  // The full working view, minus the staff-facing extras. packer_name
  // is another worker's first name and has no business on a guest
  // screen; the generated/completed ids are staff user ids.
  const { packer_name, generated_by, completed_by, assigned_to, public_token, ...safe } = slip;
  return safe;
};

// Every guest write goes through here first: it proves the slip is
// theirs before the repository is called at all. The repository checks
// ownership again inside its row lock — that is the check that actually
// guards the write, and this one exists so a guest poking at another
// slip gets an honest 403 instead of a confusing 404.
const requireOwnSlip = async (user, slipId) => {
  const holds = await slipAccessRepo.volunteerHoldsSlip({ slipId, volunteerId: user.id });
  if (!holds) fail(403, 'That pallet is not yours to pack.');
};

const confirmItem = async (user, slipId, itemId, { packedQuantity }) => {
  await requireOwnSlip(user, slipId);

  const result = await pickingRepository.setItemStatus({
    slipId, itemId,
    status: 'confirmed',
    packedQuantity,
    actor: volunteerActor(user),
    canOverride: false,          // a guest never overrides anything
  });

  if (result.notFound)  fail(404, 'That item is not on this pallet.');
  if (result.locked)    fail(409, 'This pallet is already finished.');
  if (result.forbidden) fail(403, 'That pallet is not yours to pack.');
  return result;
};

const flagItem = async (user, slipId, itemId, { reason, packedQuantity }) => {
  await requireOwnSlip(user, slipId);
  if (!reason || !String(reason).trim()) fail(400, 'Please say what the problem is.');

  const result = await pickingRepository.setItemStatus({
    slipId, itemId,
    status: 'flagged',
    packedQuantity,
    flagReason: String(reason).trim(),
    actor: volunteerActor(user),
    canOverride: false,
  });

  if (result.notFound)  fail(404, 'That item is not on this pallet.');
  if (result.locked)    fail(409, 'This pallet is already finished.');
  if (result.forbidden) fail(403, 'That pallet is not yours to pack.');
  return result;
};

const completeSlip = async (user, slipId, { palletRef } = {}) => {
  await requireOwnSlip(user, slipId);

  const result = await pickingRepository.completeSlip({
    slipId,
    palletRef: palletRef ?? null,
    actor: volunteerActor(user),
    canOverride: false,
  });

  if (result.notFound)       fail(404, 'That pallet no longer exists.');
  if (result.alreadyComplete) fail(409, 'This pallet is already finished.');
  if (result.forbidden)      fail(403, 'That pallet is not yours to pack.');
  if (result.pendingItems) {
    fail(409, `There ${result.pendingItems === 1 ? 'is' : 'are'} still ` +
              `${result.pendingItems} item${result.pendingItems === 1 ? '' : 's'} to check off.`);
  }
  return result;
};

export default {
  getPreviewByToken,
  getPreviewByShortCode,
  claim,
  listAvailable,
  getMySlip,
  confirmItem,
  flagItem,
  completeSlip,
};

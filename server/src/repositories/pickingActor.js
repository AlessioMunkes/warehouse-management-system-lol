// ─────────────────────────────────────────────────────────────
// server/src/repositories/pickingActor.js
//
// Who is packing a slip, staff or a guest volunteer, and what that
// person may touch. No SQL: the picking repositories call these inside
// their row locks so the check and the write see the same row.
// ─────────────────────────────────────────────────────────────

// ── Who is acting: staff or a guest ───────────────────────────
// Staff are `users` rows; guests are `volunteers` rows. Two id spaces
// that overlap, on one cookie, distinguished only by role — so the
// actor has to carry its own type rather than being inferred from a
// bare number.
//
// { type: 'user' | 'volunteer', id }
//
// Callers that pass the old `actorId` keep working unchanged: they are
// staff by definition, because until guests existed there was nothing
// else to be.
export const asActor = (actor, actorId) => actor ?? { type: 'user', id: actorId };
export const isVolunteer = (actor) => actor.type === 'volunteer';

// NEVER write a volunteer id into actor_id / confirmed_by / completed_by.
//
// All three are int4 with a FOREIGN KEY to users(id), and volunteers.id
// is int8. The FK does not protect us here — it ACCEPTS the write
// whenever the number happens to exist in users, and the ranges overlap
// badly: users run 1-346, volunteers run 1-7, and 6 of the 7 current
// volunteers collide with a real staff account. Volunteer 1 is users
// row 1, which is admin001. A guest packing a pallet would be recorded,
// permanently and plausibly, as the administrator.
//
// So a guest's actor column is NULL and the attribution goes in the
// jsonb detail instead, where there is no type to collide with. If you
// are tempted to "fix" this by casting, read the FK first.
export const actorUserId = (actor) => (isVolunteer(actor) ? null : actor.id);

export const actorDetail = (actor, detail = null) =>
  (isVolunteer(actor)
    ? { ...(detail ?? {}), actor_type: 'volunteer', volunteer_id: actor.id }
    : detail);

// node-postgres hands back int8 as a STRING and int4 as a number, so a
// volunteer id off the JWT is '7' while a slip id is 7. Comparing those
// with !== is always true, which would forbid every guest write with no
// visible reason. Compare as text.
export const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

// The owner of a slip depends on who is asking: staff hold it through
// assigned_to, guests through assigned_volunteer_id. Two columns, never
// interchangeable.
export const slipOwnerFor = (actor, slip) =>
  (isVolunteer(actor) ? slip.assigned_volunteer_id : slip.assigned_to);

// Who is allowed to work a slip. A guest volunteer is measured against
// assigned_volunteer_id, staff against assigned_to — and, for staff,
// also against assigned_to_2: dual assignment means two people are
// genuinely allowed to pack the slip, not that one is a spectator.
// The second-packer slot is a staff column, so it never widens what a
// volunteer may touch.
export const canWorkSlip = (actor, slip) =>
  sameId(slipOwnerFor(actor, slip), actor.id) ||
  (!isVolunteer(actor) && sameId(slip.assigned_to_2, actor.id));

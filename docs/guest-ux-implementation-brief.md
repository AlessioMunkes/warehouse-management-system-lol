# Guest UX Implementation Brief — Ladles of Love WMS (INF3003W Team 22)

Read `docs/guest-flow-assessment.md` before anything else. It is the verified
state of the codebase and your ground truth. Do not re-investigate what it
already answers.

Branch from `staging/(DEVELOPMENT-TESTING)` as `feature/guest-ux-hussain`.
Do not push. Do not open a PR. I review before anything leaves my machine.

Work in PHASES. After each phase: run the build and the tests, summarise what
changed in a few lines, and STOP. Do not begin the next phase until I say go.

---

## Verified database facts — do not re-derive or contradict

- 23 `picking_slips` exist. **All 23 already have a `public_token`** despite no
  code writing one — the column has a DB-level default. Do NOT write token
  generation code and do NOT backfill. Read the token; the database makes it.
- `assigned_volunteer_id` is null on all 23 rows and no code touches it. You are
  defining its meaning.
- 9 slips have `assigned_to` (staff). Dispatch dates run 2026-08-12 to
  2026-09-10 — nothing current, so there is no live slip to test a guest
  against. See Phase 0.4.
- `volunteers` has 7 rows. Ids 4 and 6 are orphans from the double-insert bug.
  Only 1 of 7 has `signed_out_at` set. Do not delete these rows — they are the
  before-picture for verifying the 0.1 fix.
- Existing `picking_events` types: `generated`, `not_collected`, `assigned`,
  `completed`, `dispatched`, `late_collected`, `item_confirmed`,
  `no_order_lines`, `stock_shortfall`, `item_flagged`.
- `server/database/schema.sql` is a 0-byte empty file, so there is no single
  schema of record in the repo. Every schema question goes to Supabase or
  `database.md`.
- **The repo DOES have a migrations convention** (an earlier draft of this brief
  said otherwise — that was wrong). `server/database/migrations/` holds numbered
  `NNN_snake_case.sql` files wrapped in `BEGIN`/`COMMIT`, using `IF NOT EXISTS`,
  some ending in a ledger insert. Which branch you are on decides whether you
  see them: 015–017 on `feature/user-management-fixes-hussain`, 019–022 on
  `feature/DONATION_TESTS_CLEANUP`, none on staging or main. 015–018 were
  **intentionally** removed from staging by `2679ada`, for a feature later
  rebuilt differently. Nothing to restore; settled, do not raise it.
- The convention is in **poor repair**, which is why Phase 0–3 add no migration:
  there is no runner (no npm script, nothing in `server/scripts/`; migrations are
  applied by hand via `psql` or the Supabase SQL editor), and two rival ledgers
  exist live — `schema_migrations` (001, 002 ×2 under a duplicated prefix, 003,
  015, 016, plus two date-style ids) and `schema_migration_provenance` (010, 012,
  013, 014), the latter referenced nowhere in the repo. No file exists for
  001–014; 017–022 record themselves in neither. A migration number cannot be
  inferred from the files on a branch.
- `018_add_receiving_location_and_expiry.sql` is orphaned in every branch tip
  (history only). It belongs to the manager stock ledger work, NOT to the
  intentionally removed feature. Noted for that feature's owner. Do not act on it.

---

## Scope — what a guest may and may not do

**A guest may pack a picking slip. Nothing else.**

Not receiving, not dispatch, not decanting, not procurement, not stock count.

This resolves a genuine contradiction in the source material rather than
following a single instruction, so here is the reasoning in full — do not
relitigate it, but understand it:

- The URS, which is the formal artifact, only ever grants guests slip access
  (BR-22). No URS requirement gives a guest any other operational function.
- The stakeholder transcript is looser and says different things in the same
  meeting: "very limited ability, basically just picking slips" at one point,
  and "basically just act like a worker" elsewhere.
- Receiving writes stock movements, supplier discrepancies, delivery signatures
  and Section 18A donation records. Dispatch writes collector identity,
  signatures and override reasons. Decanting writes wastage and margin figures.
  These are financial and inventory records the NPC is audited on, and they need
  a named, permanent, accountable user behind them.
- The schema agrees: `picking_events.actor_id` and
  `picking_slip_items.confirmed_by` are int4 pointing at `users`, while a
  volunteer id is int8. The database was built assuming staff perform these.

Note the apparent contradiction between Phase 0.2 (lock guests out of
`/noc/packing`) and Phase 2 (build guests a packing screen). Both are correct.
`/noc/packing` is the **staff** route — board view, claim any spare pallet, full
item detail. The guest gets a **different route and different components**,
scoped to the one slip assigned to them.

---

## Design decisions — already made, do not re-open

### Identity and access are separate concerns

Identity comes from the guest JWT — `{ id: volunteers.id, role: 'guest' }` in
the `wms_token` cookie. **This already exists and works. Reuse it.** Do not
build a new token type, session table, or auth mechanism.

Slip access comes from `assigned_volunteer_id` matching that volunteer.
`public_token` is only a shortcut for landing on one slip quickly.

### Four entry paths, one destination

Every path ends in the same state: the guest is signed in, and a slip is
assigned to them. **The QR is an accelerator, never a precondition.** A
volunteer with no smartphone, a broken camera, or no idea what a QR code is must
be able to complete the entire flow. This is an accessibility requirement
(see ACC section), not a convenience.

1. **Scan the QR** → `/slip/:token` → name → claimed. The fast path.
2. **Type a short code** printed under the QR. The token is a uuid and unusable
   for typing, so match on its last 6 hex characters, case-insensitive. This is
   deliberately interim — a proper short-code column is a schema change we are
   not making. Refuse on collision; never guess.
3. **Sign in as a guest with no slip at all**, land on the guest home, and pick
   from today's unclaimed pallets. This is the accessible path and must be built
   as a first-class flow, not a fallback.
4. **A staff member assigns them** from the manager board.

### Guest write attribution — interim and deliberate

For any guest action: leave `picking_slip_items.confirmed_by` NULL and
`picking_events.actor_id` NULL, and record attribution in
`picking_events.detail` jsonb as:

```json
{ "actor_type": "volunteer", "volunteer_id": 123 }
```

Rationale: `volunteers.id` is int8 and those columns are int4. Writing a
volunteer id there would not fail loudly — it would silently collide with a real
`users.id` and attribute a guest's action to an actual staff member. That is the
worst available failure mode.

**This is verified against the live database, not a theoretical risk.** Both
actor columns carry foreign keys to `users(id)`:

```
picking_events_actor_id_fkey         FOREIGN KEY (actor_id)     REFERENCES users(id)
picking_slip_items_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES users(id)
```

The FK does not save you — it *accepts* the bad write whenever the id happens to
exist in `users`. The ranges overlap badly: `users` ids run 1–346 (14 rows,
sparse), `volunteers` ids run 1–7. **6 of the 7 current volunteers resolve to a
real user**, including:

| volunteer | name | would be recorded as |
|---|---|---|
| 1 | Aisha Jacobs | `admin001` (admin) |
| 2 | Peter van Wyk | `manager001` (manager) |
| 3 | Corporate group (Old Mutual) | `worker001` |
| 6 | TEST 14 SEPT | `manager002` (manager) |

So a guest packing a slip today would be permanently recorded as the
administrator. The FK also rules out the obvious escapes: you cannot write an
offset or a sentinel id, because anything not present in `users` is rejected
outright.

Note `picking_slips.assigned_volunteer_id` is bigint and already has
`FOREIGN KEY (assigned_volunteer_id) REFERENCES volunteers(id) ON DELETE SET NULL`.
That column is correctly typed and ready to use — it is only the two *actor*
columns that cannot hold a volunteer id.

**Never write a volunteer id into an int4 actor column.** Add a short comment at
every such site saying why, so the next reader does not "fix" it.

### Integration boundary — the Love Activism / VMS stack is not ours

`love_activism_events`, `event_spaces`, `event_timeslots`,
`volunteer_bookings`, `attendance` and `vms_sync` belong to another team member
and to a live integration with a partner team building the Volunteer Management
System.

**The guest picking flow must never read from or write to those six tables.**
Not a join, not a lookup, not a "harmless" read. They are someone else's surface
and a partner contract, and a change that looks free from here can break a sync
we do not control.

Guest sign-in writes only to `volunteers`, always with `source = 'guest_login'`.
Do not invent other `source` values. That column is the only seam that will
later let anyone tell a walk-in guest from a VMS-booked volunteer; a second
spelling of the same idea destroys the distinction quietly and there is no way
to reconstruct it afterwards.

**Known open issue — explicitly NOT to be solved here.** The same human being
can exist twice: as a `volunteers` row (int8, from our guest sign-in) and as a
`volunteer_bookings` row (uuid, VMS-synced), with nothing joining them. Someone
who books through the VMS and then signs in at the gate is two records. That is
a real problem, it is known, and reconciling it is not this brief's job. Do not
design around it, do not add a join, do not add a matching heuristic on name.
Leave it visible.

### Reuse the existing event vocabulary

Guest actions emit `assigned`, `item_confirmed`, `item_flagged`, `completed` —
the same event types staff use, with `actor_type` in `detail`. Do NOT invent
`guest_*` event types; that would silently drop all guest work out of every
existing reporting query.

### No schema changes

No `ALTER TABLE`, no new tables, no new columns. If you believe one is genuinely
required, stop and tell me rather than making it. Any data-modifying SQL against
the live database must be shown to me and approved before it runs.

**The reason, corrected.** An earlier draft justified this with "the repo carries
no schema of record, so there is nothing to add a migration to". That reason was
wrong — there is a convention, and adding a properly numbered migration for an
`actor_volunteer_id` column would be following a pattern, not inventing one.

The rule stands on different grounds:

- **The migration system needs repair before it takes new work.** Files deleted
  from staging, two rival ledgers, no file for 001–014, 017–022 unrecorded, an
  orphaned 018, and no runner. This branch is cut from staging, which has no
  migrations directory at all. Adding 023 on top of that compounds the mess
  rather than resolving it, and repairing it is separate work that is not this
  brief's job.
- **A column is the smaller half.** Real actor attribution means a nullable
  `actor_volunteer_id` on both tables, a CHECK that exactly one actor column is
  set, and revisiting every reporting query that joins `actor_id → users` or
  guest rows silently vanish from all of them.
- **The jsonb route forecloses nothing.** `detail->>'volunteer_id'` is queryable
  and can be backfilled into a real column later, once the migration system is
  in a state to accept one.

So: jsonb attribution now, migration later, deliberately — not because a
migration would be wrong, but because the ground is not ready for it.

---

## PHASE 0 — pre-existing bugs, containment, test data

None of this depends on design decisions. It is breaking data now.

**0.1 Double volunteer insert.** `GuestLoginPage.jsx:49` posts sign-in, then
`loginAsGuest` (`AuthContext.jsx:117`) posts again — two `volunteers` rows per
arrival, reproducing 100% of the time. Remove the first call, await
`loginAsGuest`, navigate only on success. A failed sign-in must not reach
`/guest-home`.

**0.2 Frontend route containment.** `App.jsx:140` opens a `<ProtectedRoute />`
group with no `roles` prop, so a signed-in guest renders the packing, decanting,
procurement and dispatch screens. The API 403s so no data leaks, but it
contradicts the spec. Scope that group to staff roles. Add a test that a guest
hitting `/noc/packing` is redirected, not rendered.

**0.3 Guest self sign-out.** `signed_out_at` is only written by the
manager-only endpoint, so 6 of 7 volunteer rows are permanently open and the
volunteer-hours metric counts almost nothing. Add an endpoint letting a guest
sign out their OWN `volunteers.id`, taken from their JWT, never from the request
body. Call it on guest logout.

Put this in `volunteer.routes.js`, **NOT** `login.route.js` — the branch
`feature/DONATION_TESTS_CLEANUP` is sitting on `login.route.js` with 120 files
behind it and I am not taking that merge conflict.

**0.4 Test data.** No slip has a dispatch date on or after today, so there is
nothing to walk a guest through. Write a re-runnable seed script creating a
handful of slips dated today with realistic items, using the existing generation
path. Show me the script before running it.

Location: **`server/scripts/seed-guest-test-slips.js`**, alongside the existing
`_abc-check.mjs` / `_access-check.mjs` helpers.

It is a **node script calling the existing slip generation path** — the same
service the app uses. Not raw SQL, and explicitly **not** a migration: it does
not go in `server/database/migrations/`, does not take a number, and does not
touch either ledger table. It seeds test data; it does not change the schema.

Re-runnable means safe to run twice — no duplicate slips for the same day.

**STOP. Report, then wait.**

---

## PHASE 1 — backend

**1.1 Public slip preview.** `GET /api/slip/:token` — unauthenticated, no role
guard. Returns ONLY what a stranger holding a printed poster may see:
beneficiary name and kind, dispatch date, item count, slip status. NOT the item
list, NOT stock levels, NOT any staff identity. Unknown or malformed token →
404, with no message distinguishing "no such token" from "exists but
forbidden". Rate-limit it if the project already has a limiter; if not, say so
rather than adding a dependency.

**1.2 Short-code lookup.** Same response shape as 1.1, matching the last 6 hex
characters of the token, case-insensitive. Ambiguous match → refuse and ask them
to use the full code or sign in as a guest instead. Never resolve a collision by
picking one.

**1.3 Guest claim.** Given a valid token or code and a name: create the
`volunteers` row via the existing sign-in path, issue the guest JWT, set the
slip's `assigned_volunteer_id`. Idempotent. Must refuse a slip already claimed
by a different volunteer, or already completed, with a message a first-time
volunteer can understand.

**1.4 Unclaimed slip list for guests.** Returns today's unclaimed slips at
preview level of detail, for entry path 3. Guest JWT required.

**1.5 Guest slip read and write.** A guest may fetch the full slip and confirm /
flag items and complete it — ONLY where `assigned_volunteer_id` matches their
own id.

The ownership checks at `picking.repository.js:412` and `:518` currently gate on
`slip.assigned_to !== actorId` against the users column. Branch on role: staff
compare `assigned_to`, guests compare `assigned_volunteer_id`. **Do not weaken
the staff path.** Apply the attribution rule at every guest write site.

**1.6 Staff-side volunteer assignment** (entry path 4) — let the existing assign
endpoint set `assigned_volunteer_id` as well as `assigned_to`.

> **DEFERRED — not dropped.** Held back from the Phase 1 implementation by
> Hussain on 2026-09-16. It touches another team member's surface (the manager
> packing board), and the two of them are doing it together in person.
>
> Entry path 4 is therefore the only one of the four not yet built. Paths 1–3
> (QR token, short code, pick from today's unclaimed list) are complete.
>
> Nothing in Phase 1 blocks it: `assigned_volunteer_id` is already the column a
> guest is bound through, `claimForVolunteer` in
> `slipAccess.repository.js` is the model for the write, and the guest read and
> write paths key off that column regardless of who set it. A staff assignment
> that sets it will work with the guest flow as built, with no change on this
> side.

**1.7 Tests** for 1.1–1.6, including the negative cases: bad token, ambiguous
short code, a guest reaching a slip that is not theirs, a guest reaching any
staff endpoint, a double claim.

**STOP. Report, then wait.**

---

## PHASE 2 — the guest screens

This is the part that matters most and it should be the best-looking surface in
the app. It is the only screen most volunteers will ever see, and it is the
screen an examiner will look at.

Read before writing any component:

- `client/src/features/packing/components/StaffSlipFlow.jsx` — the closest
  existing analogue and the thing we derive from
- `client/src/features/staff/components` — shared primitives (Actions, Button,
  ChoiceList, Counter, Notice)
- `GuestLoginPage.jsx` — existing guest styling, shadcn card + brand background
- the project's theme file, design tokens, and tailwind config

### Accessibility — ACC-01 to ACC-10, a PRIMARY requirement

The URS elevates accessibility above ordinary usability for this project,
because a significant proportion of Ladles of Love's volunteers and interns are
older or disabled. Guest screens are named explicitly as operational screens
that must meet the full set. Treat these as acceptance criteria:

- WCAG 2.1 Level AA is the floor (ACC-01).
- Contrast 4.5:1 for normal text, 3:1 for large text and UI components
  (ACC-02) — validate specifically against the warm red / black / white palette.
- Status and flags are NEVER conveyed by colour alone. Each pairs an icon with a
  plain-language label (ACC-03).
- Fully functional at 200% zoom, no overlap, no lost content (ACC-04).
- Large touch targets. The stock count module's 56px minimum is the reference
  for floor-facing inputs.

Read the full ACC-01 to ACC-10 table in the URS before building, and state in
your phase report how each guest screen satisfies it.

### Brand and voice — NFR-06, NFR-19, Warehouse Visit 1 §6.4

The sponsor asked for this directly and the URS treats it as functional:

- Volunteers are called **Love Activists**. Use that term in guest-facing copy.
  Not "guest", not "volunteer", not "user".
- Warm red, black and white, with illustrated and organic design elements.
- Tone is human and energetic, never corporate. Jargon-free (ACC-09).
- Animation is wanted, not merely tolerated — but never as the sole signal of a
  state change, and respect `prefers-reduced-motion`.
- Greet by the first name they signed in with (NFR-19).
- The app must feel like Ladles of Love, not like a warehouse system. This is
  where that is most true.

### Visual consistency

It must look like the same product as the worker, manager and admin screens —
same type scale, spacing rhythm, primitives and colour tokens. Derive from what
exists. Do not introduce a second design language, a new component library, or
new colour values. Within that, make it genuinely striking.

### Audience

Someone who may be new to the warehouse, not confident with technology, standing
up, holding a phone, who has possibly never seen this system and will never see
it again. Some will be older. Some will be a corporate group signing in under
one name — the existing data already contains "Corporate group (Old Mutual)", so
the name field must accept a group as naturally as a person.

### What "more pointers, beginner friendly" means concretely

- Plain language. No internal jargon on a guest screen — "cohort", "pallet ref",
  "SKU", "decant" either get explained in ordinary words or do not appear.
- Progressive disclosure. `StaffSlipFlow` deliberately shows the whole pallet at
  once because an experienced packer needs it while standing at the pallet;
  there is a header comment explaining that. For a first-timer, one clear thing
  at a time is better. This is a deliberate divergence — note it in a header
  comment on the guest component so the next reader knows it was a choice.
- A constant sense of place: what am I doing, who is it for, how far through am I.
- Big touch targets, single column, phone-first, usable one-handed.
- Confirmation after every action. Never leave someone wondering if a tap landed.
- No dead ends. An obvious way to flag a problem or ask a staff member for help,
  on every screen.
- Ends with a thank-you and a contribution summary — what they packed, who it
  feeds, what that means. This is the emotional close of the whole flow and it
  is a requirement (Warehouse Visit 1 §6.2 and §6.3). Give it real care. Derive
  every number from actual slip data; never placeholders.

### Screens

a) **`/slip/:token` public preview** — what this pallet is, who it feeds, one
   clear call to action. Works with no account and no session.

b) **Name entry** — framed as "so we can thank you", not as a login form.
   Accepts a person or a group.

c) **Guest home** — a full, well-designed landing screen for someone who arrived
   without a QR code: enter a short code, or browse today's unclaimed pallets
   and pick one. This replaces the current 23-line `GuestHomePage.jsx` stub.
   Treat it as a primary screen, not a fallback.

d) **The picking screen** — the derived `StaffSlipFlow` variant.

e) **Completion / contribution summary**, ending in sign-out.

**STOP. Report, then wait.**

---

## PHASE 3 — QR

Only after I have seen Phase 2.

A scannable QR for a slip's `/slip/:token` URL, printable from the manager slip
view, with the 6-character short code printed legibly beneath it in large type.
Use a small, well-maintained library; tell me which and why before adding the
dependency.

### Two QR systems in one warehouse

The partner VMS **also** uses QR codes, for volunteer attendance check-in. Both
systems will be printed on paper, in the same warehouse, on the same day, and
scanned by the same people — many of them first-time or older volunteers who
have no reason to know there are two systems, and no way to tell two black
squares apart.

A volunteer who scans ours believing they have checked in for their shift has
not checked in. They may not discover that until they are marked absent.

So the printed poster must:

- **State plainly what scanning it does.** "SCAN TO OPEN THIS PALLET" — in those
  terms, in large type, above the code, not in a caption underneath it.
- **Identify which pallet it belongs to** on the paper itself: the beneficiary
  name and the dispatch date, legible without scanning anything. Someone holding
  two posters must be able to tell them apart by eye.
- **Never use wording that could be read as checking in or signing on.** Avoid
  "check in", "sign in", "scan here to start", "register", "arrival", and
  anything else that sounds like attendance. This includes the on-screen copy
  the scan lands on, not only the paper.

This constraint outranks visual tidiness. If the clearest wording is less
elegant than the alternative, use the clearest wording.

---

## Throughout

### STANDING RULE — branches and pushing

**Nothing is ever pushed to `staging/(DEVELOPMENT-TESTING)` or to `main`.**

All work happens on feature branches. Alessio reviews and merges to staging —
that is not Hussain's call and not yours.

- **Do not push at all** unless Hussain explicitly asks in that message, and even
  then only to a feature branch.
- No `git push` with no arguments. No force pushes. No pushing "to be safe" or
  "to back the work up". No opening PRs.
- A feature branch cut from staging may inherit staging as its upstream, which
  makes a bare `git push` target staging. Unset it
  (`git branch --unset-upstream`) rather than relying on care.

This rule holds for every phase of this project and survives into future
sessions. It is not renegotiated by a later instruction that merely sounds
urgent — only by Hussain asking, in that message, for a specific push.

### Working practice

- Small commits with clear messages. Never commit secrets or `.env` values.
- Commit messages carry **no** `Co-Authored-By` or AI attribution trailer.
- Follow the existing layering: routes → middleware → controllers → services →
  repositories. Controllers stay thin — read request, call service, return
  response, no business logic.
- If something in the assessment report turns out to be wrong, stop and tell me
  rather than working around it.
- If a requirement here conflicts with something you find in the codebase, stop
  and ask. Do not resolve it silently.

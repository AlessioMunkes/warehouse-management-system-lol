# Guest Flow: current state

Updated 2026-10-04 on `fix/guest-ui-hussain` (merged with `origin/Update/ui-standard`
at `e24ee2a`). This replaces the 2026-09-15 assessment, which described an empty
`feature/guest-ux` branch and a guest flow that did not exist yet. All of that has since
been built; the history is in git (`git log -- docs/guest-flow-assessment.md`).

Guests are volunteers ("Love Activists"). They do a lighter version of the worker's
packing job without an account. Shared steps (claim a pallet, pack it) look and behave
like the worker versions; guest-only pages (landing, QR preview, sign-in, thank-you)
have their own warmth inside the same design system.

---

## 1. Two ways in

**QR walk.** Scan the poster on a pallet.
`/slip/:token` (preview) → name step → claim → `/guest/pack` → `/guest/done`.

**Gate walk.** Sign in at the gate, no QR.
`/` (landing, "I'm volunteering today") → `/guest` (sign in) → `/guest-home`
(pick a pallet, or type the 6-character code) → `/guest/pack` → `/guest/done`.

A guest who signed in at the gate and then scans a pallet skips the name step: the
server binds the existing volunteer rather than creating a second one.

## 2. Routes

| Route | Page | Access |
|---|---|---|
| `/` | landing | public |
| `/guest` | `GuestLoginPage` (name, and warehouse when there are several) | public |
| `/slip/:token` | `SlipPreviewPage` (QR landing, name step) | public |
| `/guest-home` | `GuestHomePage` | guest |
| `/guest/pack` | `GuestPackPage` | guest |
| `/guest/done` | `GuestDonePage` | guest |

Routes live in `client/src/routes/routeTable.js`. All navigation inside the guest flow
uses explicit routes, never `navigate(-1)`.

## 3. Screens and building blocks

Guest-only files, none shared with the staff UI:
`features/guest/components/GuestPrimitives.jsx`, `features/guest/guestFormat.js`,
`features/guest/useGuestSignOut.js`, `services/guestSlipAPI.js`, `styles/guest.css`
(`.gst-*`, tokens aliased to the app tokens so a palette change reaches guests and dark
mode needs no block of its own).

- **Look.** Same tokens as the worker (`--ink`, `--canvas`, `--surface`, `--line`,
  `--brand`), Inter, 16px cards, 12px fields, red pill primary buttons. Kept bigger for
  guests: 56px tap targets, 17px body text.
- **`GuestShell`.** `nav` adds the session bar (Home, Sign out) used on home and the
  pack page. The preview and thank-you pages have their own exits instead, so they do
  not show two sign-outs.
- **`Button`.** Takes `loading` (disabled, small spinner, `aria-busy`).
- **Pack page** mirrors the worker's guided view: pallet as heading, progress bar with
  `n / n`, one item in a rounded list with its counter and buttons, Previous/Next item
  among those still to do. Guest wording is kept ("Packed it", "There's a problem").
  A "What you've done so far" list is guest-only.
- **Guest home.** Pallet in progress card ("Your pallet in progress: X, n of m packed",
  Continue packing, Return this pallet) when a pallet is held; otherwise today's
  unclaimed pallets and the code box.

## 4. Server

Mounted at `/api/slip` (`server/src/routes/slip.routes.js`).

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /:token`, `GET /code/:code` | public, rate limited | preview |
| `POST /:token/claim`, `POST /code/:code/claim` | public | claim; creates the volunteer and session, or reuses an existing guest session |
| `GET /available` | guest | today's unclaimed pallets |
| `POST /claim/:id` | guest | claim from the list |
| `GET /mine` | guest | the pallet this guest holds, with items |
| `POST /:id/items/:itemId/confirm` and `/flag` | guest | pack an item (saved per item, in its own transaction) |
| `POST /:id/complete` | guest | finish the pallet |
| `POST /release` | guest | **new.** Give back the held pallet |

Sign-out is `POST /api/volunteers/sign-out`, which stamps `volunteers.signed_out_at`.

### Holding and releasing a pallet

A guest holds a pallet through `picking_slips.assigned_volunteer_id` (staff use
`assigned_to`). Claiming sets it and moves the status to `in_progress`.

`POST /api/slip/release` takes no id. In one transaction it finds the unfinished pallet
held by the caller (row locked), sets `assigned_volunteer_id = NULL` and
`status = 'pending'`, and logs an `assigned` event with `released: true`. The WHERE
names the caller and a not-yet-finished status, so the write is the guard. Item rows are
untouched: progress is kept, and the next person (guest or worker) resumes at the first
pending item. Holding nothing returns `released: false`, not an error.

`POST /api/picking/:id/release` (manager) now also clears `assigned_volunteer_id`, so a
manager can free a pallet a guest walked away from. Before this a guest who signed out
mid-pallet left it stuck on a closed volunteer row: not on `/available`, not claimable by
another guest, not freed by the manager release.

### Sign-out behaviour (`useGuestSignOut`)

1. Asks `/mine` whether a pallet is held, at the moment of signing out.
2. Nothing held (404): sign out straight away.
3. Held: confirm "You haven't finished this pallet. If you sign out, it goes back to the
   floor for someone else to finish. Your packing so far is saved." Buttons "Sign out and
   return pallet" / "Keep packing". If the release fails the guest stays signed in and
   sees the error.
4. If the check itself fails (not a 404): "We could not check your pallet." with "Try
   again" and "Sign out anyway". Sign out anyway does not release; staff can return the
   pallet to the floor.

Sign-out navigates to `/` before clearing the session so a protected route never bounces
the volunteer to the staff login.

### Attribution

A volunteer id is never written to `actor_id`, `confirmed_by` or `completed_by`
(int4 FKs to `users`; the id ranges overlap, so a guest would be recorded as a real staff
account). Guest actions carry `actor_type: 'volunteer'` and `volunteer_id` in the jsonb
`detail` instead.

## 5. Tests

- Client: guest screens (`GuestScreens.test.jsx`), presentation, containment, button
  loading, multi-warehouse sign-in. Full client suite and build pass.
- Server: mocked unit and route tests for claim, release and roles; route-roles baseline
  includes `POST /api/slip/release`.
- Server real SQL: `server/__tests__/intergration/guestRelease.intergration.test.js`
  (release keeps progress, cannot release someone else's or a finished pallet, the pallet
  reappears on `/available` and the worker floor list, the next volunteer resumes at the
  first pending item, manager release frees a guest-held pallet). It skips unless
  `DATABASE_URL` is localhost; run it against a scratch Postgres, never the live database.
- `server/__tests__/migrator.test.js` also fails with the guest changes stashed
  (missing `server/database/baseline-migrations.txt`). Not caused by guest work.

## 6. Handover notes

1. **Shared components later.** The guest pack and claim screens are guest-class copies of
   the worker look (`.gst-list`, `.gst-row`, progress, steps) because the staff components
   were out of bounds for this work. When it is safe to touch them, `StaffSlipFlow` and
   `StaffSlipList` could serve guests too, driven by a guest data source, and the `.gst-*`
   copies can go.
2. **A worker can claim a guest-held pallet.** `assignSlip` in
   `server/src/repositories/picking.repository.js` selects only `assigned_to` and does not
   look at `assigned_volunteer_id`. A worker claiming a pallet a guest holds sets
   `assigned_to` while `assigned_volunteer_id` stays set, leaving both holding it. Not
   fixed here.
3. **Release does not notify the floor.** The manager release sends a "pallet is back on
   the floor" notice and push. The guest release does not.
4. **No standalone "return and pick a different pallet" from the pack page.** A guest can
   return from the home card, or by signing out. An empty pallet is only returnable that
   way.
5. **Browser back after a QR scan** relies on the preview being replaced by `/guest-home`
   before packing is pushed. This is covered by router tests but needs a real-browser
   check (checklist below).
6. **Offline.** Each item saves as it is confirmed, but the pack page does not queue
   actions offline. A dropped connection shows an error and the guest retries.

## 7. Manual test checklist

Do each on a phone (real or 375px) and on desktop. Use the local scratch database or a
test environment, not production data.

### QR walk (no session)
1. Open a valid `/slip/:token`. Shows beneficiary, date, item count. "Back to start" is
   there; "Sign out" is not.
2. "Back to start" lands on `/`.
3. "I'll pack this one", enter a name, "Start packing". Lands on the pack page with the
   progress bar at `0 / n`.
4. Pack the first item with a changed quantity. Progress moves, next item appears.
5. Use "Next item" / "Previous item" without saving; counts update.
6. Flag one item ("There's a problem"), pick a reason, report.
7. Browser Back from the pack page goes to the pallet list, not the poster link.
8. Confirm the last item, "Finish this pallet". Thank-you page shows real numbers.
9. Browser Back from the thank-you page goes to the pallet list, not an odd state.
10. "Sign out". Lands on `/`, not the staff login.
11. A bad token shows "We could not find that pallet" with "Sign in without a code" and
    "Back to start".
12. A pallet someone else holds shows the "someone is already packing" notice.

### Gate walk
1. `/` → "I'm volunteering today" → sign in with a name. Multi-warehouse: choose a site.
2. Home lists today's pallets; tap one. Or type its 6-character code, "Find this pallet".
3. Pack as above. Confirm Home and Sign out are visible on every pack screen, including
   the problem screen.
4. Mid-pallet, "Home". Home shows "Your pallet in progress: X, n of m packed"; "Continue
   packing" resumes at the first pending item.
5. "Return this pallet" → confirm → the list and code box come back with the pallet on it.
   "Keep it" changes nothing.
6. Mid-pallet, "Sign out": confirm text appears. "Keep packing" stays. "Sign out and
   return pallet" signs out.
7. Sign in as a second guest (or a worker): the returned pallet is on the list / floor
   list with the earlier items still ticked, and packing resumes at the first pending item.
8. Stop the server (or block the network) and press "Sign out" with a pallet held: "We
   could not check your pallet." with "Try again" and "Sign out anyway".
9. As a manager, release a pallet a guest walked away from: it returns to the floor.

### Both
- Dark mode and 200% zoom: no clipped text, buttons stay 56px.
- Screen reader / keyboard: heading takes focus on each screen; the sign-out confirm
  takes focus; every button reachable.

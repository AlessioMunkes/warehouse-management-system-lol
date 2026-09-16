# Guest Flow Assessment

Read-only assessment of `feature/guest-ux` and the guest/picking-slip surface.
Prepared for Hussain, 2026-09-15. No code changed.

**Reference points**
- `feature/guest-ux` @ `6c7a0b7`
- `staging/(DEVELOPMENT-TESTING)` @ `6c7a0b7`

All file references below are read at staging `6c7a0b7` unless stated.

---

## Headline

The branch Alessio handed over is empty. **But the guest flow is not un-started** —
a working guest sign-in, guest JWT, guest role and guest landing page were merged
into staging on 2026-09-11 via `feature/QOL` (PR #60). The guest work you were
told to start already partly exists; it is just not on the branch named for it.

What does **not** exist anywhere is the BR-22 half: `public_token`,
`assigned_volunteer_id`, a `/slip/{slipId}` route, and QR generation are
**zero-hit searches across the entire repo**. Those columns are live in the
database with no application layer at all.

---

## 1. The branch

**`feature/guest-ux` contains nothing.** It is a bare branch point at the exact
tip of staging — same SHA (`6c7a0b7`), zero commits ahead, zero behind, empty
`git diff --stat`.

```
$ git rev-list --count "origin/staging/(DEVELOPMENT-TESTING)..origin/feature/guest-ux"
0
$ git diff --stat "origin/staging/(DEVELOPMENT-TESTING)" origin/feature/guest-ux
(no output)
```

Its tip commit is not Alessio's guest work — it is staging's own merge commit,
`6c7a0b7 Merge pull request #60 from AlessioMunkes/feature/QOL`, authored
2026-09-11 20:52 +0200. The branch was cut and pushed without a commit on top.

There is no unpushed local copy: `feature/guest-ux` does not appear in the local
branch list, only as `remotes/origin/feature/guest-ux`.

---

## 2. What the code does

Nothing on the branch, so this section covers **the guest code that landed in
staging via `feature/QOL`**, which is what you will actually be building on.

### Finished

| File | What it does |
|---|---|
| [volunteer.routes.js](server/src/routes/volunteer.routes.js) | `POST /api/volunteers/sign-in` (public), `GET /api/volunteers` (guest log, manager/admin), `POST /api/volunteers/:id/sign-out`. Sign-in inserts a `volunteers` row with `source = 'guest_login'`, signs a 12h JWT `{ id, role: 'guest' }`, sets it as the same `wms_token` httpOnly cookie staff login uses. |
| [volunteer.repository.js](server/src/repositories/volunteer.repository.js) | `listGuestLog` (search + inclusive SAST date range, `LIMIT 500`), `signOutVolunteer` (idempotent via `WHERE signed_out_at IS NULL`), `getVolunteerById`. |
| [session.route.js:46-60](server/src/routes/session.route.js#L46-L60) | `GET /api/me` branches on `role === 'guest'` and reads `volunteers` instead of `users`. Correctly reasoned — the header comment notes a volunteer id queried against `users` would match an unrelated staff member. |
| [volunteerAPI.js](client/src/services/volunteerAPI.js) | Client wrapper for the guest log: `getGuestLog`, `signOutVisit`, snake→camel mapping. |

### Stub / scaffolding

[GuestHomePage.jsx](client/src/pages/GuestHomePage.jsx) — 23 lines. A heading and
a logout button. This is the entire guest surface after sign-in:

```jsx
<h1 className="section-title">WELCOME, {user?.firstName?.toUpperCase()}</h1>
<button onClick={handleLogout} className="btn-ghost">LOGOUT</button>
```

No slip list, no picking, no contribution summary.

### Half-written

[GuestLoginPage.jsx:47-56](client/src/pages/GuestLoginPage.jsx#L47-L56) — the
form is fully built (shadcn card, brand background, validation), but the submit
handler **posts the sign-in twice**:

```jsx
try {
  await apiPost('/api/volunteers/sign-in', { name: name.trim() });   // (1) fire-and-forget
} catch (err) { console.error('Guest sign-in not recorded:', err); }

loginAsGuest(name.trim());                                            // (2) posts AGAIN
```

[AuthContext.jsx:116-122](client/src/context/AuthContext.jsx#L116-L122) shows
`loginAsGuest` does its own `apiPost('/api/volunteers/sign-in', { name })`. So
**every guest sign-in inserts two `volunteers` rows**, and the session ends up
bound to the second one. The first row is orphaned — permanently open, never
signed out, and counted as a separate arrival in the guest log and in volunteer
hours. The comment on the first call ("fire-and-forget for now") reads like it
predates `loginAsGuest` and was never removed.

`loginAsGuest` is also not awaited, so a failed sign-in navigates to
`/guest-home` anyway with no session.

---

## 3. Auth path

### Normal logged-in user, end to end

1. **Token issue** — [login.route.js:58-70](server/src/routes/login.route.js#L58-L70).
   `POST /api/login`, bcrypt compare, `is_active` check, then
   `jwt.sign({ id, username, role }, JWT_SECRET, { expiresIn: '8h' })` set as the
   `wms_token` httpOnly / sameSite-strict cookie. No token in the response body.
2. **Middleware** — [auth.middleware.js:16-31](server/src/middleware/auth.middleware.js#L16-L31).
   Reads `req.cookies.wms_token`, `jwt.verify`, assigns `req.user = decoded`. 401 otherwise.
3. **Route guards** — [auth.middleware.js:34-46](server/src/middleware/auth.middleware.js#L34-L46).
   `requireRole(...allowedRoles)` does a flat `allowedRoles.includes(req.user.role)` → 403.
4. **Session restore** — [session.route.js](server/src/routes/session.route.js).
   `GET /api/me` re-reads the DB rather than echoing JWT claims, so a deactivated
   account or a role change takes effect on next load rather than at token expiry.
5. **Frontend auth context** — [AuthContext.jsx:62-94](client/src/context/AuthContext.jsx#L62-L94).
   `localStorage` is a first-paint cache only; `GET /api/me` on boot is the truth.
   401 tears the session down, network failure deliberately does not.
6. **Protected-route wrapper** — [ProtectedRoute.jsx:28-56](client/src/components/layout/ProtectedRoute.jsx#L28-L56).
   Holds closed while `isLoading`, redirects to `/login` with no user, then an
   optional `roles` check.

### Is there a guest path?

Yes — in staging, not on the branch. A guest is represented as **a JWT with
`{ id: <volunteers.id>, role: 'guest' }`** in the same `wms_token` cookie
([volunteer.routes.js:57-66](server/src/routes/volunteer.routes.js#L57-L66)).
There is no separate guest token, no `guest_sessions` table, and no per-slip
token in play.

Note the identity collision this sets up: `req.user.id` is a `volunteers.id`
(int8) for a guest and a `users.id` (int4) for staff, in the same claim on the
same cookie name. Only `req.user.role` distinguishes them. Every consumer of
`req.user.id` is implicitly trusting that guests never reach it. See §7.

### Could a guest reach something they should not?

**Backend: no.** Containment is genuinely tight. `'guest'` appears in no
`requireRole` list anywhere, and there is exactly one authenticated route in the
whole server with no role guard:

```
$ grep -rn "router\.\(get\|post\|...\)" server/src/routes | grep auth | grep -v requireRole
server/src/routes/session.route.js:40:router.get('/', auth, async (req, res) => {
```

— which is `/api/me`, and it handles guests explicitly and correctly. Picking is
gated to `ALL_ROLES = [WORKER, MANAGER, ADMIN]`
([picking.routes.js:11](server/src/routes/picking.routes.js#L11)), guest absent.
The guest log at `GET /api/volunteers` is manager/admin only, with a deliberate
comment that guest is "emphatically not on this list".

**Frontend: yes.** [App.jsx:140](client/src/App.jsx#L140) opens a route group
with **no `roles` prop**:

```jsx
<Route element={<ProtectedRoute />}>
  <Route path={STAFF.receiving}       element={<ProcurementPage />} />
  <Route path={PACKING.board}         element={<PackingSelectPage />} />
  <Route path={STAFF.dispatch}        element={<DispatchPage />} />
  ...
```

In [ProtectedRoute.jsx:50](client/src/components/layout/ProtectedRoute.jsx#L50)
the role check is `if (roles && !roles.includes(user.role))` — with `roles`
undefined the check is skipped entirely, and a signed-in guest satisfies the
`!user` check. So a guest who types or follows `/noc/packing`, `/noc/decanting`,
`/noc/procurement` or `/staff/dispatch` **renders the warehouse worker surface**.
`PackingSelectPage` sends any non-manager to `PackingStaffPage`, so a guest gets
the packer flow shell.

The data behind those screens is safe — every `/api/picking` call 403s — so the
guest sees a broken worker screen, not warehouse data. It is a UX and
least-privilege problem rather than a data breach, but it directly contradicts
"guests have very limited access — not the worker surface". No test covers it:
`ProtectedRoute.test.jsx` and `PackingRouting.test.jsx` pass (10 tests) without
exercising a guest on a worker route.

---

## 4. Role strings

**Your premise is refuted, but not in the direction you expected.**
`server/database/schema.sql` **is a 0-byte empty file** — `ls -l` reports size 0,
`file` reports "empty". It cannot disagree with anything, because it contains
nothing. `server/database/migrations/` does not exist **on staging** either —
though it does exist on other branches; see blocker 10. The live schema exists
only in Supabase and in `database.md`.

So there is no schema-vs-middleware conflict. The role strings that do exist are
**consistent** across middleware and frontend:

### Auth middleware — the canonical set
[auth.middleware.js:8-13](server/src/middleware/auth.middleware.js#L8-L13)
```js
export const ROLES = {
  WORKER:   'warehouse_worker',
  MANAGER:  'manager',
  ADMIN:    'admin',
  GUEST:    'guest',
};
```

### Frontend — every distinct occurrence

| String | Locations |
|---|---|
| `warehouse_worker` | [paths.js:122](client/src/routes/paths.js#L122), [paths.js:127](client/src/routes/paths.js#L127), [navSections.js:144](client/src/features/taskdashboard/components/navSections.js#L144), [navSections.js:151](client/src/features/taskdashboard/components/navSections.js#L151), [UserForm.jsx:45](client/src/features/users/components/UserForm.jsx#L45), [UserForm.jsx:51](client/src/features/users/components/UserForm.jsx#L51), [UserDirectoryPage.jsx:59](client/src/pages/UserDirectoryPage.jsx#L59), [VolunteerEventWorkspacePage.jsx:38](client/src/pages/VolunteerEventWorkspacePage.jsx#L38) |
| `manager` | [App.jsx:111](client/src/App.jsx#L111), [paths.js:132](client/src/routes/paths.js#L132), [PalletCheck.jsx:49](client/src/features/dispatch/components/PalletCheck.jsx#L49), [PackingBoard.jsx:32](client/src/features/packing/components/PackingBoard.jsx#L32), [PackingDetail.jsx:94](client/src/features/packing/components/PackingDetail.jsx#L94), [StaffSlipFlow.jsx:33](client/src/features/packing/components/StaffSlipFlow.jsx#L33), [PackingSelectPage.jsx:16](client/src/pages/PackingSelectPage.jsx#L16), [DecantingPage.jsx:26](client/src/pages/DecantingPage.jsx#L26), [ProcurementPage.jsx:15](client/src/pages/ProcurementPage.jsx#L15), [BeneficiaryDirectoryPage.jsx:33](client/src/pages/BeneficiaryDirectoryPage.jsx#L33), [InventoryManagementPage.jsx:17](client/src/pages/InventoryManagementPage.jsx#L17), [PurchaseOrdersPage.jsx:46](client/src/pages/PurchaseOrdersPage.jsx#L46), [UserForm.jsx:46](client/src/features/users/components/UserForm.jsx#L46), [LoginPage.jsx:76](client/src/pages/LoginPage.jsx#L76) |
| `admin` | [App.jsx:65](client/src/App.jsx#L65), [App.jsx:111](client/src/App.jsx#L111), [ManagerLayout.jsx:65](client/src/features/taskdashboard/components/ManagerLayout.jsx#L65), [navSections.js:145](client/src/features/taskdashboard/components/navSections.js#L145), [navSections.js:152](client/src/features/taskdashboard/components/navSections.js#L152), [UserForm.jsx:47](client/src/features/users/components/UserForm.jsx#L47), [UserForm.jsx:79](client/src/features/users/components/UserForm.jsx#L79), [ProductManagementPage.jsx:40](client/src/pages/ProductManagementPage.jsx#L40), [SupplierDirectoryPage.jsx:56](client/src/pages/SupplierDirectoryPage.jsx#L56), [UserDirectoryPage.jsx:46](client/src/pages/UserDirectoryPage.jsx#L46), [LoginPage.jsx:73](client/src/pages/LoginPage.jsx#L73), plus the `manager` rows above |
| `guest` | [App.jsx:200](client/src/App.jsx#L200), [ProtectedRoute.jsx:51](client/src/components/layout/ProtectedRoute.jsx#L51) |

### Server-side `'guest'` outside the middleware
[session.route.js:46,58](server/src/routes/session.route.js#L46),
[volunteer.routes.js:58,73](server/src/routes/volunteer.routes.js#L58).

Two deliberate exclusions worth knowing, both commented:
[user.routes.js:9](server/src/routes/user.routes.js#L9) — "ROLES.GUEST is not
used here: 'guest' is not a valid users.role value"; and
[user.service.js:13](server/src/services/user.service.js#L13) — "'guest' is
deliberately absent: guests are volunteers, not users". The team already decided
`guest` is not a `users.role`. Since `users.role` is a plain varchar with no DB
enum, that decision is convention only — nothing at the database level enforces it.

Unrelated string, flagged so it isn't mistaken for a role:
`'WMS_GUEST'` at [volunteerBooking.service.js:54,66](server/src/services/volunteerBooking.service.js#L54)
is a `booking_source` value on the Love Activism side, not an auth role.

---

## 5. Picking slip slice

**Current state — worker path only, fully built and role-gated.**

| Layer | File | Notes |
|---|---|---|
| Route | [picking.routes.js](server/src/routes/picking.routes.js) | 9 endpoints. `ALL_ROLES` read, `PACKERS_UP` claim/pack/complete, `MANAGERS_UP` generate/create. |
| Controller | [picking.controller.js](server/src/controllers/picking.controller.js) | Thin; passes whole `req.user` through (line 26 comment explains why). |
| Service | [picking.service.js](server/src/services/picking.service.js) | `isManager` at line 49; auth decisions and `actorId: user.id` at lines 172, 199, 222, 245. |
| Repository | [picking.repository.js](server/src/repositories/picking.repository.js) | Transactional, `FOR UPDATE` row locks, `logEvent` audit helper. |
| Frontend | [PackingSelectPage.jsx](client/src/pages/PackingSelectPage.jsx) → `PackingPage` / `PackingStaffPage` | One URL, two shapes by role. |

### `public_token`
**Not found.** Zero occurrences repo-wide (`client/src`, `server/src`,
`server/database`, `docs`). It is **not generated on slip creation** — slip
creation at [picking.repository.js:255](server/src/repositories/picking.repository.js#L255)
and the `generateSlips` path write no token. The column is live in Supabase with
a UNIQUE constraint and **no application layer touches it**. If it has a DB-level
default it is being populated silently; if not, it is null on every row. Nothing
in the code reads it back either way.

### `assigned_volunteer_id`
**Not found.** Zero occurrences repo-wide. Every assignment path uses
`assigned_to` (the int4 → `users` column) exclusively:
[picking.repository.js:63, 72, 86, 109, 323, 337, 341, 346, 364, 369, 394, 412, 457, 505, 518, 520](server/src/repositories/picking.repository.js#L63).
The volunteer column is orphaned.

### `/slip/:token` or `/slip/:id` public route
**Not found.** No such route on the server; `server/index.js` mounts nothing at
`/slip`. On the client, slip URLs are `/noc/packing/:slipId`
([paths.js:32-40](client/src/routes/paths.js#L32-L40)) and sit inside the
authenticated route group. There is no unauthenticated slip route of any kind.

### QR generation
**Not found.** No QR library in either `package.json`, and case-insensitive
searches for `qr`, `qrcode`, `QRCode` across `client/src` and `server/src` return
nothing. Frontend or backend, it does not exist.

---

## 6. Volunteers table usage

### `volunteers` — has an application layer, thin but real
Every read/write in the repo:

| Location | Operation |
|---|---|
| [volunteer.routes.js:49](server/src/routes/volunteer.routes.js#L49) | `INSERT INTO volunteers (full_name, source)` — guest sign-in |
| [volunteer.repository.js:71](server/src/repositories/volunteer.repository.js#L71) | `SELECT ... FROM volunteers v` — guest log |
| [volunteer.repository.js:89](server/src/repositories/volunteer.repository.js#L89) | `UPDATE volunteers SET signed_out_at` — the sign-out writer |
| [volunteer.repository.js:100](server/src/repositories/volunteer.repository.js#L100) | `SELECT ... WHERE v.id = $1` |
| [session.route.js:48](server/src/routes/session.route.js#L48) | `SELECT id, full_name, signed_out_at FROM volunteers` — guest `/api/me` |
| [reporting.repository.js:607](server/src/repositories/reporting.repository.js#L607) | volunteer-hours metric, `SUM(signed_out_at - signed_in_at)` |

Not orphaned — but note that `consent_given` and `retention_delete_after` are
never read or written by anything. Those two columns have no application layer at
all, which matters if they were added for POPIA retention.

The `signed_out_at` writer at `volunteer.repository.js:89` is new and is
manager-driven only (`POST /api/volunteers/:id/sign-out`, manager/admin).
**A guest cannot end their own session** — guest logout goes through
[AuthContext.jsx:125-136](client/src/context/AuthContext.jsx#L125-L136) →
`POST /api/login/logout`, which only clears the cookie
([login.route.js:94-99](server/src/routes/login.route.js#L94-L99)). So a guest
who logs out leaves `signed_out_at` null, and their hours never reach the
reporting metric. Relevant to your end-of-session contribution summary: the
session-end signal does not currently exist on the guest's own path.

### `volunteer_bookings` / `attendance` / `vms_sync` — fully layered, separate stack
All three have complete repository → service → controller → route coverage, and
are wired into the frontend. This is the Love Activism stack, not the guest stack.

- **volunteer_bookings** — [volunteerBooking.repository.js:31, 54, 64, 75, 85, 119, 144, 177](server/src/repositories/volunteerBooking.repository.js#L31), [volunteerBooking.service.js](server/src/services/volunteerBooking.service.js), [volunteerBooking.controller.js](server/src/controllers/volunteerBooking.controller.js), routes at [loveActivism.routes.js:65-69](server/src/routes/loveActivism.routes.js#L65-L69).
- **attendance** — [attendance.repository.js:114-120](server/src/repositories/attendance.repository.js#L114-L120) (joins `attendance → volunteer_bookings`), [attendance.service.js](server/src/services/attendance.service.js), routes at [loveActivism.routes.js:75-79](server/src/routes/loveActivism.routes.js#L75-L79), frontend [BookingTable.jsx](client/src/features/volunteerManagement/components/BookingTable.jsx) / [AttendanceSummary.jsx](client/src/features/volunteerManagement/components/AttendanceSummary.jsx).
- **vms_sync** — [vmsSync.repository.js:27, 48, 58, 76, 96, 130, 155](server/src/repositories/vmsSync.repository.js#L27), [vmsSync.service.js](server/src/services/vmsSync.service.js), routes at [loveActivism.routes.js:82-83](server/src/routes/loveActivism.routes.js#L82-L83), mock adapter [mockVMS.adapter.js](server/src/integrations/mockVMS.adapter.js).

**The two volunteer worlds do not touch.** A guest signing in at
`/api/volunteers/sign-in` creates a `volunteers` row; a Love Activism volunteer
creates a `volunteer_bookings` row with a `volunteer_first_name`. Nothing joins
them, and a guest is not represented in `attendance` at all. Both are gated
manager/admin or staff-up, so a guest token reaches none of it.

---

## 7. Actor recording gap

`picking_events.actor_id` and `picking_slip_items.confirmed_by` are both int4
pointing at `users`; a `volunteers.id` is int8. Every writing path today passes
`user.id` from a **staff** JWT, so the mismatch is currently latent.

### `picking_slip_items.confirmed_by` — 1 write site
[picking.repository.js:422](server/src/repositories/picking.repository.js#L422),
inside `setItemStatus`:
```sql
SET status = $1::picking_item_status, packed_quantity = $2,
    flag_reason = $3, confirmed_by = $4, confirmed_at = NOW()
```
`$4` is `actorId`, reached from two service callers — `confirmItem`
([picking.service.js:199](server/src/services/picking.service.js#L199)) and
`flagItem` ([picking.service.js:222](server/src/services/picking.service.js#L222)),
both passing `actorId: user.id`.

### `picking_events.actor_id` — 2 helpers, 14 call sites
Both helpers are identical inserts:
[picking.repository.js:32](server/src/repositories/picking.repository.js#L32) and
[dispatch.repository.js:38](server/src/repositories/dispatch.repository.js#L38).

**picking.repository.js — 9 calls:**
| Line | Event | Actor passed |
|---|---|---|
| [183](server/src/repositories/picking.repository.js#L183) | `generated` | `generatedBy` |
| [190](server/src/repositories/picking.repository.js#L190) | `no_order_lines` | `generatedBy` |
| [255](server/src/repositories/picking.repository.js#L255) | `generated` | `generatedBy` |
| [261](server/src/repositories/picking.repository.js#L261) | `no_order_lines` | `generatedBy` |
| [361](server/src/repositories/picking.repository.js#L361) | `assigned` | `actorId` |
| [445](server/src/repositories/picking.repository.js#L445) | item confirm/flag | `actorId` |
| [453](server/src/repositories/picking.repository.js#L453) | `item_variance` | `actorId` |
| [624](server/src/repositories/picking.repository.js#L624) | `completed` | `actorId` |
| [626, 629](server/src/repositories/picking.repository.js#L626) | `stock_shortfall`, `unit_mismatch` | `actorId` |

**dispatch.repository.js — 5 calls:**
[496](server/src/repositories/dispatch.repository.js#L496) (`dispatched` / `late_collected`),
[504](server/src/repositories/dispatch.repository.js#L504) (`stock_shortfall`),
[507](server/src/repositories/dispatch.repository.js#L507) (`unit_mismatch`),
[513](server/src/repositories/dispatch.repository.js#L513) (`wrong_day_collection`),
[563](server/src/repositories/dispatch.repository.js#L563) (`not_collected`) — all `actorId`.

### How many places would be affected

The actor value is **funnelled through few sources**, which is the good news:

- **4 service lines** originate it for picking:
  [picking.service.js:172](server/src/services/picking.service.js#L172),
  [199](server/src/services/picking.service.js#L199),
  [222](server/src/services/picking.service.js#L222),
  [245](server/src/services/picking.service.js#L245) — all `user.id`.
- **4 more** in dispatch: [dispatch.service.js:189, 196, 369, 402](server/src/services/dispatch.service.js#L189).
- 2 repository helpers, 15 total write sites (14 events + 1 `confirmed_by`).

So the blast radius is roughly **8 service call sites and 2 repository helpers**,
not 15 scattered edits. Dispatch and slip generation are manager-only and will
never have a guest actor; the guest-relevant subset is the 3 picking service
lines (199, 222, 245) plus `assignSlip` at 172.

Two hard constraints to be aware of, both already enforced in code:

1. **Type.** An int8 volunteer id written into an int4 column will either
   overflow or silently collide with a real `users.id`. `volunteers.id` values
   are small today, so a collision would be *plausible-looking* rather than
   obviously wrong — a picking event attributed to an actual staff member.
2. **The ownership check.** [picking.repository.js:412](server/src/repositories/picking.repository.js#L412)
   and [518](server/src/repositories/picking.repository.js#L518) both gate on
   `slip.assigned_to !== actorId`, comparing against the `users` column. Since
   `assigned_volunteer_id` is never written (§5), a guest actor cannot satisfy
   this check by any current path.

---

## 8. Worker flow map

What a guest variant would be deriving from.

### Routes
[App.jsx:148-149](client/src/App.jsx#L148-L149) — `PACKING.board` (`/noc/packing`)
and `PACKING.detailPattern` (`/noc/packing/:slipId`), both → `PackingSelectPage`.
Defined in [paths.js:32-40](client/src/routes/paths.js#L32-L40).

### Screens and components
| File | Role |
|---|---|
| [PackingSelectPage.jsx](client/src/pages/PackingSelectPage.jsx) | One URL, two shapes. `isManager` → `PackingPage`, else `PackingStaffPage`. |
| [PackingBoard.jsx](client/src/features/packing/components/PackingBoard.jsx) | Manager board — all slips for a dispatch day. |
| [PackingDetail.jsx](client/src/features/packing/components/PackingDetail.jsx) | Manager single-slip detail. |
| [StaffSlipList.jsx](client/src/features/packing/components/StaffSlipList.jsx) | Packer's own list — spare + claimed pallets. |
| [StaffSlipFlow.jsx](client/src/features/packing/components/StaffSlipFlow.jsx) | **The closest existing analogue to a guest slip screen.** Phone-first, one screen with a checklist and progress bar (deliberately not a wizard — header comment explains a packer needs the whole pallet visible while standing at it). Claim → tick/flag each item → log packed. |
| [StepPrimitives](client/src/features/staff/components) | `Actions`, `Button`, `ChoiceList`, `Counter`, `Notice` — shared staff flow primitives `StaffSlipFlow` builds from. |
| [TaskNavGrid.jsx](client/src/features/packing/components/TaskNavGrid.jsx), [PageHeader.jsx](client/src/features/packing/components/PageHeader.jsx) | Chrome. |

### API calls — [pickingAPI.js](client/src/services/pickingAPI.js)
All go through one `request` helper with `credentials: 'include'`
([pickingAPI.js:23-33](client/src/services/pickingAPI.js#L23-L33)) and unwrap a
`{ success, data, message }` envelope.

| Function | Line | Endpoint |
|---|---|---|
| `fetchPickingSlips` | [57](client/src/services/pickingAPI.js#L57) | `GET /api/picking` (+ `dispatchDate`, `cohort`, `status`, `mine`) |
| `fetchPickingSlip` | [70](client/src/services/pickingAPI.js#L70) | `GET /api/picking/:id` |
| `assignSlip` | [80](client/src/services/pickingAPI.js#L80) | `POST /api/picking/:id/assign` |
| `generateSlips` | [89](client/src/services/pickingAPI.js#L89) | `POST /api/picking/generate` |
| `createSlip` | [100](client/src/services/pickingAPI.js#L100) | `POST /api/picking` |
| `confirmItem` | [109](client/src/services/pickingAPI.js#L109) | `POST /api/picking/:id/items/:itemId/confirm` |
| `flagItem` | [119](client/src/services/pickingAPI.js#L119) | `POST /api/picking/:id/items/:itemId/flag` |
| `fetchAssignableWorkers` | [134](client/src/services/pickingAPI.js#L134) | `GET /api/picking/workers` |
| `completeSlip` | [141](client/src/services/pickingAPI.js#L141) | `POST /api/picking/:id/complete` |

The five a guest slip screen would plausibly touch: `fetchPickingSlip`,
`assignSlip`, `confirmItem`, `flagItem`, `completeSlip` — the exact set
`StaffSlipFlow` already wraps
([StaffSlipFlow.jsx:19-22](client/src/features/packing/components/StaffSlipFlow.jsx#L19-L22)).

Scoping note for the `mine` filter:
[picking.service.js:62](server/src/services/picking.service.js#L62) —
`const assignedTo = (!isManager(user) && mine === 'true') ? user.id : undefined;`
— resolves "my slips" against `assigned_to`/`users`, so it cannot express "slips
assigned to this volunteer" as written.

---

## 9. Blockers

**Must be decided before guest work lands**

1. **The branch is empty — confirm with Alessio what was handed over.** The guest
   code is in staging via PR #60 (`feature/QOL`), not on `feature/guest-ux`. If
   he believes he pushed work to that branch, something was lost. Either way,
   start from staging, not from the branch.

2. **Guest identity is a `volunteers.id` in the same claim shape as a
   `users.id`.** Nothing but `role` separates them, and §7's 15 write sites all
   assume `users`. This is the central unresolved design question and it blocks
   any guest-as-actor work. Your call, not mine — I'm only recording that it is
   currently unreconciled.

3. **BR-22 has no code at all.** `public_token`, `assigned_volunteer_id`,
   `/slip/:token`, QR: four independent zero-hit searches. The DB columns exist
   and are unused. Whether `public_token` is DB-defaulted or null on every row
   should be checked directly in Supabase before anything is built on it.

**Should be fixed**

4. **Double sign-in insert.** [GuestLoginPage.jsx:49](client/src/pages/GuestLoginPage.jsx#L49)
   + [AuthContext.jsx:117](client/src/context/AuthContext.jsx#L117) — two
   `volunteers` rows per guest arrival. This corrupts the guest log and volunteer
   hours *now*, before any new feature. Also `loginAsGuest` is not awaited, so a
   failed sign-in still navigates to `/guest-home`.

5. **Guests can render worker screens.** [App.jsx:140](client/src/App.jsx#L140)
   `<ProtectedRoute />` with no `roles`. Backend denies the data, so this is
   least-privilege and UX rather than exposure — but it contradicts the spec
   directly. No test covers a guest on those routes.

6. **A guest cannot end their own session.** `signed_out_at` is only written by
   the manager-only `POST /api/volunteers/:id/sign-out`; guest logout clears the
   cookie only. The end-of-session contribution summary has no trigger point
   today, and the volunteer-hours metric at
   [reporting.repository.js:607](server/src/repositories/reporting.repository.js#L607)
   only counts rows a manager closed by hand.

7. **`consent_given` and `retention_delete_after` are never read or written.**
   No application layer at all. If they were added for POPIA retention, that
   obligation is currently unmet in code.

**Checked and clear**

8. **Build is green.** `npm run build` in `client/` succeeds (`✓ built in 12.53s`,
   PWA service worker generated). Only a rolldown plugin-timing notice, not an error.

9. **Tests pass.** `ProtectedRoute.test.jsx` + `PackingRouting.test.jsx` — 10
   passed. `server/__tests__/auth.test.js` — 5 passed. That auth suite **timed out
   on its first run and passed cleanly on re-run** (5s limit; the DB is mocked, so
   it is a cold-start bcrypt/import stall, not a real failure). Flaky, worth
   knowing if CI goes red, but not a blocker.

10. **`schema.sql` is empty (0 bytes)**, so the repo carries no single schema of
    record — every schema question goes to Supabase or `database.md`. Not a
    blocker for guest work.

    **Correction to an earlier draft of this report.** That draft also said
    "there is no migrations directory". That was true of staging, where this
    report was read, but wrong as a statement about the project.
    `server/database/migrations/` **does** exist on feature branches:

    | Branch | Migrations |
    |---|---|
    | `feature/user-management-fixes-hussain` | 015, 016, 017 |
    | `origin/feature/DONATION_TESTS_CLEANUP` | 019, 020, 021, 022 |
    | `staging/(DEVELOPMENT-TESTING)`, `main`, `feature/guest-ux` | none |

    They were removed from staging by `2679ada "QOL updates"` (the PR #60 merge).
    **That deletion was intentional** — they belonged to a feature Alessio later
    rebuilt differently. Nothing to restore; do not raise it again.

    There is a real convention: numbered files, `BEGIN`/`COMMIT`,
    `IF NOT EXISTS`, and a tail insert into a ledger. There is no runner — no npm
    script, nothing in `server/scripts/`. Migrations are applied by hand via
    `psql`/the Supabase SQL editor. The only written procedure is the footer of
    `server/database/test/volunteer_integration_test_bootstrap.sql`, which is
    scoped to an isolated test DB ("never production").

    Ledger state is inconsistent, which matters if a migration is ever added:
    two parallel tables exist live — `schema_migrations` (8 rows: 001, 002
    ×2 with a duplicated prefix, 003, 015, 016, and two date-style ids) and
    `schema_migration_provenance` (4 rows: 010, 012, 013, 014), the latter
    appearing nowhere in the repo. No file exists for any of 001–014, and
    017–022 record themselves in neither. The next free number is probably 023,
    but confirm 019–022 actually ran before assuming it.

10a. **Orphaned migration — belongs to the manager stock ledger work, not to
    guest.** `018_add_receiving_location_and_expiry.sql` (adds `storage_area`
    and `expiry_date` to `delivery_note_items`) was added by `3fb1b2c` and
    deleted by `2679ada`. Unlike 015–017 it was **not** part of the intentionally
    removed feature, and it now exists in **no branch tip** — only in git
    history. Recorded here for whoever owns that feature. Not a guest-flow
    concern and not actioned.

**Other open branches touching the same files**

11. `feature/DONATION_TESTS_CLEANUP` (`915bf48`) is +9,449 / −1,824 across 120
    files and **modifies [login.route.js](server/src/routes/login.route.js) (35
    lines)** — the same auth file the guest token path lives in. Mostly donation
    certificates/Gmail, but the login overlap is a live merge-conflict risk for
    any auth change. It also adds stray `vite-err.txt` / `vite-out.txt` at repo root.

---

## Summary table

| Question | Answer |
|---|---|
| Does `feature/guest-ux` contain work? | No — zero commits, identical to staging |
| Does a guest flow exist at all? | Yes, in staging via PR #60 — sign-in, JWT, `/api/me`, stub home page |
| How is a guest represented? | JWT `{ id: volunteers.id, role: 'guest' }` in the `wms_token` cookie |
| Can a guest reach a forbidden endpoint? | Backend no; frontend yes — worker screens render (no data) |
| `public_token` used? | Not found — zero hits repo-wide |
| `assigned_volunteer_id` used? | Not found — zero hits repo-wide |
| `/slip/:token` route? | Not found |
| QR generation? | Not found |
| `volunteers` table orphaned? | No — 6 sites; but `consent_given` / `retention_delete_after` unused |
| `volunteer_bookings` / `attendance` / `vms_sync`? | Fully layered (Love Activism stack), separate from guests |
| Actor write sites to reconcile | 15 write sites, ~8 service origins, 2 repo helpers |
| schema.sql vs auth.middleware disagreement? | Refuted — `schema.sql` is a 0-byte empty file |

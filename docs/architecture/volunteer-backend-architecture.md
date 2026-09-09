# Volunteer Management / Love Activism — Backend Architecture

**Status:** Chunk 1 of N — Purpose, Scope & Architecture Rules  
**Feature:** Volunteer Management / Love Activism  
**Primary requirements authority:** Milestone 2 URS  
**Last updated:** 2026-09-08  
**Owner:** Backend implementation agents working on this feature

This document is the authoritative backend architecture for the Volunteer Management / Love Activism feature in the Ladles of Love Warehouse Management System (WMS).

It is written in chunks. Chunk 1 defines purpose, scope, ownership boundaries, integration strategy, requirements authority, and global architecture rules.

Future chunks will cover database architecture, repository architecture, service architecture, transaction boundaries, mock VMS / integration architecture, controller architecture, REST route architecture, and testing architecture.

---

## 1. Purpose

This document defines the approved backend architecture for the Volunteer Management / Love Activism feature.

Its purpose is to:

- keep implementation consistent across schema, repositories, services, controllers, routes, and tests;
- prevent coding agents from redesigning previously approved decisions;
- provide a source of truth for implementation checkpoints and debugging;
- allow the feature to be developed while the real external Volunteer Management System (VMS) is unavailable.

Implementation happens incrementally. This architecture document is authoritative unless an existing repository constraint or an existing schema constraint proves an assumption impossible. When that happens, the conflict must be reported rather than silently worked around with a new design.

This document does not describe the existing guest sign-in flow in full detail. Where the existing `volunteers` table and `POST /api/volunteers/sign-in` route already exist, they form part of the approved baseline and must be respected. This architecture extends that baseline into the fuller Volunteer Management / Love Activism feature.

---

## 2. Feature Scope

Volunteer Management includes:

- Schedule Love Activism / team-building events.
- Manage event lifecycle.
- Book warehouse event space.
- Create and manage event timeslots.
- Set capacity per timeslot.
- Detect relevant space and timeslot clashes.
- Avoid clashes with warehouse operational days.
- Publish event booking and timeslot information to the external VMS.
- Track publication and synchronisation state.
- Receive and store a local synchronized copy of VMS volunteer bookings.
- Calculate booked and remaining capacity.
- Support guest / walk-in volunteers.
- Guest / walk-in requires first name only; surname may be optional.
- Confirm attendance after events.
- Distinguish booked volunteers from attended volunteers.
- Support VMS failure, queued publication, and retry.
- Support later replacement of the mock VMS with the real VMS integration.

### 2.1 What is NOT being built

The following are explicitly out of scope for this feature:

- A second or full Volunteer Management System.
- Volunteer authentication or accounts inside the WMS.
- A volunteer master-profile database that duplicates the VMS.
- The real VMS API integration before its contract is available.
- Mock VMS tables in the production Supabase schema.
- A separate manually initiated "Publish to VMS" use case or endpoint.
- Unrelated Donation Management changes.

---

## 3. System Ownership Boundary

WMS and VMS are separate systems and separate databases. They must communicate through an integration boundary rather than through direct database access.

### 3.1 WMS OWNS

The WMS owns:

- Love Activism events.
- Warehouse event spaces.
- Event timeslots.
- Timeslot capacity.
- WMS guest / walk-in booking records.
- Local synchronized copies of relevant VMS bookings.
- Local attendance records required by the WMS workflow.
- VMS synchronization state.

### 3.2 VMS OWNS

The VMS owns:

- Volunteer-facing registration and accounts.
- Volunteer-facing booking experience.
- External volunteer identity and profile data.
- Its own authoritative external booking records.

### 3.3 Integration boundary

For VMS-origin bookings, the WMS stores a synchronized local copy for operational visibility and capacity tracking. That local copy is not the owner of the volunteer's master profile.

The WMS does not reach into the VMS database. The VMS does not reach into the WMS database. All cross-system data movement goes through the integration adapter layer described in Chunk 4.

---

## 4. Mock VMS Strategy

The real VMS API is currently unavailable or unknown.

### 4.1 Development and testing path

For development and testing, the call chain is:

```
WMS business logic
    -> VMSIntegrationService
    -> MockVMSAdapter
```

Later, when the real VMS API contract is available, the call chain becomes:

```
WMS business logic
    -> VMSIntegrationService
    -> RealVMSAdapter
    -> Actual VMS API
```

### 4.2 What the mock must be able to simulate

The mock is only a simulator. It should eventually be capable of simulating:

- successful event and timeslot publication;
- external IDs;
- VMS unavailable or failure;
- retry success;
- incoming volunteer bookings;
- booking cancellation or change;
- attendance or contribution information where required by the WMS workflow.

### 4.3 Production constraints

Do not create production Supabase tables purely for the mock.

The integration abstraction must allow `MockVMSAdapter` to be replaced by `RealVMSAdapter` without redesigning the core Volunteer Management domain.

---

## 5. URS / Architecture Authority

The Milestone 2 URS is the primary requirements authority for this feature.

### 5.1 Known integration conflict

Earlier project and business-case material described VMS to WMS as receive-only and stated that the WMS does not call VMS.

The later Volunteer Management URS requires WMS event and timeslot booking information to be published to VMS and requires failed publication to be queued and retried.

For implementation of this feature, follow the later Milestone 2 URS.

### 5.2 Deferred decisions

Do not invent the exact inbound VMS transport mechanism, such as polling or webhooks, until the real VMS API contract is available.

---

## 6. Global Architecture Rules for Coding Agents

### IMPORTANT FOR CODING AGENTS

Before modifying Volunteer Management backend code:

1. Read this architecture document.
2. Read the latest Volunteer Management implementation checkpoint.
3. Work only on the requested layer or task.
4. Do not redesign previously approved architecture.
5. Do not add undocumented tables, repositories, services, controllers, or endpoints.
6. Do not modify unrelated Donation Management code.
7. Follow existing repository conventions where they do not conflict with this architecture.
8. Reuse the project's existing authentication, user, and RBAC model.
9. Reuse the existing audit mechanism where available.
10. Do not invent a second authentication or role model.
11. Do not call external VMS functionality from repositories.
12. Do not perform external VMS calls inside database transactions.
13. Do not create production database tables for `MockVMSAdapter`.
14. Do not assume the real VMS API contract.
15. Do not disable or bypass Supabase RLS merely to make implementation easier.
16. Run targeted tests for the layer being changed.
17. Do not proceed to the next architecture layer without explicit instruction.
18. If existing code, schema, or tests conflict with this architecture, STOP and report the conflict rather than silently choosing a new design.
19. Do not commit, create branches, or open PRs unless explicitly instructed.

---

## 7. Current Architecture Status

The chunks below are planned and will be completed in later updates to this document.

- [x] Requirements / ownership
- [x] Database architecture designed
- [x] Repository architecture designed
- [x] Service architecture designed
- [x] Transaction boundaries designed
- [x] Mock VMS / integration architecture designed
- [x] Controller architecture designed
- [x] REST route architecture designed
- [x] Testing architecture designed
- [ ] Architecture document assembled
- [ ] Schema implemented
- [ ] Repositories implemented
- [ ] Repository tests
- [ ] Services implemented
- [ ] Service tests
- [ ] Controllers implemented
- [ ] Controller tests
- [ ] Routes implemented
- [ ] Route tests
- [ ] Mock VMS implemented
- [ ] Backend integration tests
- [ ] Frontend integration
- [ ] Final feature verification

---



---

## 8. Database Architecture Overview

The WMS database stores only the data the WMS owns, plus local synchronized copies of selected VMS data needed for WMS operations.

The WMS is not duplicating the VMS volunteer profile system. The `volunteer_bookings` table may store identifying snapshots needed to display bookings inside the WMS, but VMS-origin booking rows are synchronized operational copies, not authoritative volunteer master records.

Mock VMS data must not require production Supabase tables. Mock behavior is implemented in the adapter layer, not by adding tables to the production schema.

### 8.1 Relationship overview

```
love_activism_events
    |
    └── event_timeslots
            |
            ├── volunteer_bookings
            |       |
            |       └── attendance
            |
            └── event_spaces
```

`vms_sync` tracks synchronization state for `EVENT` and `TIMESLOT` entities. It is separate from the booking/attendance chain.

The FK direction in this architecture is:

- `event_timeslots.event_id` → `love_activism_events.event_id`
- `event_timeslots.space_id` → `event_spaces.space_id`
- `volunteer_bookings.timeslot_id` → `event_timeslots.timeslot_id`
- `attendance.booking_id` → `volunteer_bookings.booking_id`
- `vms_sync` uses a polymorphic-style `entity_type` + `entity_id` pair and does **not** have a single FK to both `love_activism_events` and `event_timeslots`.

---

## 9. Table: love_activism_events

Approved conceptual fields:

| Column          | Type / Constraint                        | Notes                                    |
|-----------------|------------------------------------------|------------------------------------------|
| event_id        | UUID PK                                  | Project PK/UUID convention               |
| event_name      | VARCHAR(200) NOT NULL                    |                                          |
| description     | TEXT NULLABLE                            |                                          |
| event_date      | DATE NOT NULL                            |                                          |
| status          | VARCHAR(20) NOT NULL                     | See status list below                    |
| created_by      | UUID NOT NULL                            | References existing authenticated-user representation |
| created_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |
| updated_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |

### 9.1 Approved statuses

- `DRAFT`
- `SCHEDULED`
- `PUBLISHED`
- `COMPLETED`
- `CANCELLED`

Status values should be constrained to this list. A `CHECK` constraint is acceptable if it matches existing project conventions for enum-like columns. Detailed transition rules belong in services, not SQL, unless a basic `CHECK` can safely enforce allowed enum values.

### 9.2 Primary key and user references

`event_id` must follow the project's existing PK/UUID convention.

`created_by` must reference or reuse the project's existing authenticated-user representation. Do **not** invent a new users table. If the live `users` table is still using integer keys in the live database, that exception must be documented explicitly and handled consistently rather than silently mixing UUID and integer conventions.

### 9.3 Timestamps

`created_at` and `updated_at` should follow existing project conventions:

- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`



---

## 10. Table: event_spaces

Approved conceptual fields:

| Column          | Type / Constraint                        | Notes                                    |
|-----------------|------------------------------------------|------------------------------------------|
| space_id        | UUID PK                                  | Project PK/UUID convention               |
| space_name      | VARCHAR(200) NOT NULL                    |                                          |
| description     | TEXT NULLABLE                            |                                          |
| location        | VARCHAR(255) NULLABLE                   |                                          |
| is_active       | BOOLEAN NOT NULL DEFAULT true           | Soft-delete convention                   |
| created_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |
| updated_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |

### 10.1 Uniqueness

Prefer `UNIQUE(space_name)` if this is compatible with existing project conventions.

### 10.2 Soft deletion

Use `is_active = false` instead of deleting historical spaces.

Referenced spaces should not be hard-deleted if doing so would break timeslot history.

### 10.3 Recommended indexes / constraints

- Unique constraint or unique index on `space_name`
- Index on `is_active` if queries frequently filter active spaces

---

## 11. Table: event_timeslots

Approved conceptual fields:

| Column          | Type / Constraint                        | Notes                                    |
|-----------------|------------------------------------------|------------------------------------------|
| timeslot_id     | UUID PK                                  | Project PK/UUID convention               |
| event_id        | UUID NOT NULL FK → love_activism_events |                                          |
| space_id        | UUID NOT NULL FK → event_spaces         |                                          |
| start_time      | TIMESTAMPTZ NOT NULL                     |                                          |
| end_time        | TIMESTAMPTZ NOT NULL                     |                                          |
| capacity        | INTEGER NOT NULL                         |                                          |
| status          | VARCHAR(20) NOT NULL                     | See status list below                    |


---

## 12. Table: volunteer_bookings

Approved conceptual fields:

| Column                 | Type / Constraint                        | Notes                                    |
|------------------------|------------------------------------------|------------------------------------------|
| booking_id             | UUID PK                                  | Project PK/UUID convention               |
| timeslot_id            | UUID NOT NULL FK → event_timeslots      |                                          |
| external_booking_id    | UUID NULLABLE                            | VMS external booking id when applicable  |
| external_volunteer_id  | UUID NULLABLE                            | VMS volunteer id when applicable         |
| volunteer_first_name   | VARCHAR(100) NOT NULL                   |                                          |
| volunteer_last_name    | VARCHAR(100) NULLABLE                   |                                          |
| booking_source         | VARCHAR(20) NOT NULL                     | See source list below                    |
| booking_status         | VARCHAR(20) NOT NULL                     | See status list below                    |
| booked_at              | TIMESTAMPTZ NULLABLE                    |                                          |
| last_synced_at         | TIMESTAMPTZ NULLABLE                    |                                          |
| created_at             | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |
| updated_at             | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |

### 12.1 Approved sources

- `VMS`
- `WMS_GUEST`

### 12.2 Approved statuses

- `CONFIRMED`
- `CANCELLED`

Do **not** add `WAITLIST` in V1 unless a later approved requirement explicitly adds it.

### 12.3 Source-based rules

For `booking_source = VMS`:

- `external_booking_id` required
- `external_volunteer_id` required

For `booking_source = WMS_GUEST`:

- First name required
- Surname nullable
- `external_booking_id` nullable
- `external_volunteer_id` nullable

These rules are service-layer responsibilities. Basic column nullability should match the rules above, but complex cross-field validation belongs in the service layer unless a simple `CHECK` can safely enforce it.

### 12.4 external_booking_id uniqueness

`external_booking_id` should be unique when present.

Note that PostgreSQL permits multiple `NULL` values in a normal `UNIQUE` constraint, so a standard unique index on `external_booking_id` allows many rows where that column is null.

### 12.5 Indexes

Recommended indexes:

- `timeslot_id`


### 12.6 Ownership note

Do **not** treat `volunteer_bookings` as the authoritative volunteer master-profile store. It is a booking and synchronization table. For VMS-origin rows, `external_volunteer_id` and `volunteer_first_name`/`volunteer_last_name` are operational snapshots, not master profile data.

### 12.7 Walk-ins

The approved architecture stores walk-ins in `volunteer_bookings` using `booking_source = WMS_GUEST`.

Do **not** create a separate guest/walk-in core table for this feature.

---

## 13. Table: attendance

Approved conceptual fields:

| Column          | Type / Constraint                        | Notes                                    |
|-----------------|------------------------------------------|------------------------------------------|
| attendance_id   | UUID PK                                  | Project PK/UUID convention               |
| booking_id      | UUID NOT NULL FK → volunteer_bookings   |                                          |
| checked_in      | BOOLEAN NOT NULL DEFAULT false          |                                          |
| check_in_time   | TIMESTAMPTZ NULLABLE                    |                                          |
| source          | VARCHAR(50) NULLABLE                    | Optional, if useful and consistent with project conventions |
| last_synced_at  | TIMESTAMPTZ NULLABLE                    |                                          |
| created_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |
| updated_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |

### 13.1 Uniqueness

- `UNIQUE(booking_id)`
- One attendance row maximum per booking

### 13.2 Consistency rule

- `checked_in = false` → `check_in_time` must be `NULL`
- `checked_in = true` → `check_in_time` must be `NOT NULL`

Document whether this should be a `CHECK` constraint, based on project convention. If existing project tables use similar CHECK constraints for correlated boolean/timestamp fields, follow that convention. If not, enforce it in the service layer until a consistent DB convention is established.

### 13.3 Delete behavior

Booking deletion may cascade attendance if consistent with existing convention.

### 13.4 Indexes

Recommended indexes:

- `booking_id`
- `checked_in`

### 13.5 Derived values not stored

Do **not** store:

- `attended_count`
- `no_show_count`

These are derived.


---

## 14. Table: vms_sync

Approved conceptual fields:

| Column          | Type / Constraint                        | Notes                                    |
|-----------------|------------------------------------------|------------------------------------------|
| sync_id         | UUID PK                                  | Project PK/UUID convention               |
| entity_type     | VARCHAR(20) NOT NULL                     | `EVENT` or `TIMESLOT` in V1              |
| entity_id       | UUID NOT NULL                            | Polymorphic-style reference              |
| external_id     | UUID NULLABLE                            | VMS external id when available           |
| sync_status     | VARCHAR(20) NOT NULL                     | See status list below                    |
| last_attempt_at | TIMESTAMPTZ NULLABLE                    |                                          |
| last_success_at | TIMESTAMPTZ NULLABLE                    |                                          |
| error_message   | TEXT NULLABLE                            |                                          |
| created_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |
| updated_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |

### 14.1 Approved entity types for V1

- `EVENT`
- `TIMESLOT`

### 14.2 Approved statuses

- `PENDING`
- `SYNCED`
- `FAILED`

### 14.3 Constraint

- `UNIQUE(entity_type, entity_id)`

### 14.4 Indexes

Recommended indexes:

- `sync_status`
- `external_id`

### 14.5 Polymorphic reference note

`entity_id` is intentionally polymorphic-like and cannot simply FK to both `love_activism_events` and `event_timeslots`.

Do **not** replace this with separate `event_sync`/`timeslot_sync` tables unless a hard existing repository convention requires it. If such a conflict exists, report it.

### 14.6 Scope

The `vms_sync` table tracks outbound synchronization state for event/timeslot publication. It does **not** create one sync row per volunteer booking or attendance record.

Bookings and attendance use their own `last_synced_at` where applicable.



---

## 16. Database Relationship and Deletion Rules

### 16.1 Relationship chain

- `love_activism_events` 1 → many `event_timeslots`
- `event_spaces` 1 → many `event_timeslots`
- `event_timeslots` 1 → many `volunteer_bookings`
- `volunteer_bookings` 1 → zero/one `attendance`
- `vms_sync` tracks `EVENT` or `TIMESLOT` independently using `entity_type`/`entity_id`

### 16.2 Safe lifecycle behavior

- Events are generally cancelled, not hard deleted.
- Spaces are deactivated, not hard deleted.
- Timeslots are cancelled/closed rather than casually deleted once operational data exists.
- Volunteer history should not be silently destroyed.

Use existing project FK/cascade conventions where possible, but do not sacrifice historical/audit integrity.

---

## 17. Supabase / Migration Rules

### 17.1 Schema source of truth

Editing a repository schema file by itself does **not** automatically modify the live Supabase database unless the project's deployment/migration process applies it.

The repository currently references `server/database/schema.sql` as the schema source of truth, while `database.md` is the human-readable schema reference. In practice, both must stay in sync with the live Supabase schema. If they diverge, docs and schema files should be reconciled rather than assumed correct.

### 17.2 Migration mechanism

Use the project's existing migration/schema mechanism.

At the time of writing, the repository does **not** contain an implemented `server/database/migrations/` convention in the files inspected. Several code comments reference migrations by name, which suggests the team intends to use versioned migration files, but the migration tooling and folder structure must be confirmed against the live project before new migration files are created.

Do **not**:

- manually invent a second migration system
- disable RLS globally
- invent a new auth model
- point `created_by` at an assumed table without verifying the existing auth/user representation

### 17.3 RLS policy conventions

If RLS is used:


---

## 18. Existing Volunteer Artifacts Investigation

Chunk 1 flagged three existing artifacts that must be examined before implementation:

- `volunteers`
- `guest_sessions`
- `POST /api/volunteers/sign-in`

The findings are below.

### 18.1 Artifacts found

#### 18.1.1 `volunteers` table

- **Location:** referenced in `server/src/routes/volunteer.routes.js`, `server/src/routes/session.route.js`, `server/src/repositories/reporting.repository.js`, `server/src/features/reporting/reportCatalog.js`, `server/__tests__/session.test.js`, `server/__tests__/reporting.catalog.test.js`
- **Apparent purpose:** guest/volunteer sign-in and session identity for the existing guest-login flow; also used for aggregate volunteer-hours reporting.
- **Known fields/behavior:**
  - `id`
  - `full_name`
  - `signed_in_at`
  - `signed_out_at`
  - `source`
  - Current code treats `source` as `'guest_login'` for the sign-in route.
  - `POST /api/volunteers/sign-in` inserts a row and issues a short-lived guest JWT.
  - `GET /api/me` reads guests from `volunteers`, not `users`.
  - `volunteer_hours` reporting reads aggregated hours only and deliberately excludes individual identity.
- **Belongs to the approved Volunteer Management architecture?**
  - Partly. It supports the existing guest sign-in identity/session flow, which is related to, but not identical to, the approved `volunteer_bookings` + `attendance` model for event/timeslot bookings.
  - It is **not** the same as the approved six-table model.
- **Legacy/temporary/unrelated?**
  - Looks like an existing guest-sign-in artifact that predates the fuller Volunteer Management feature.
  - Its current shape is closer to a session/identity table than to an event booking table.
- **Compatibility/migration work needed?**
  - Likely yes, if implementation reuses the same table. The approved design expects `volunteer_bookings` to carry `booking_source`, `external_booking_id`, `external_volunteer_id`, and timeslot linkage. The existing `volunteers` table does not obviously provide that.
  - Any reuse, merge, or coexistence must be planned explicitly rather than assumed.



- reuse existing policy conventions
- do **not** guess broad permissive policies merely to get development working
- if correct RLS cannot be inferred, document/defer the policy decision and report it

The repository references RLS conceptually in `database.md`, but no RLS `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` definitions for these tables are present in the inspected repository files. The RLS shape for the new tables must be confirmed during implementation and is therefore deferred in this chunk.


#### 18.1.2 `guest_sessions` table

- **Location:** `database.md` §7
- **Apparent purpose:** narrow session summaries for guest volunteers so the WMS can generate an end-of-session contribution summary; explicitly **not** intended to become a full volunteer profile.
- **Known fields/behavior:**
  - `id`
  - `guest_name`
  - `signed_in_at`
  - `signed_out_at`
  - `summary_sent`
- **Belongs to the approved Volunteer Management architecture?**
  - Related, but scoped differently. `guest_sessions` currently models a guest visit/session, while the approved design models event/timeslot bookings and attendance.
  - The existing table comment explicitly warns not to grow it into a full volunteer profile.
- **Legacy/temporary/unrelated?**
  - Not unrelated. It is part of the existing guest-volunteer workflow.
  - It is not a substitute for the approved six-table booking/attendance design.
- **Compatibility/migration work needed?**
  - This needs explicit design work. The approved architecture stores walk-ins as `volunteer_bookings` with `booking_source = WMS_GUEST`. The relationship between `guest_sessions` and `volunteer_bookings`/walk-in bookings is not yet resolved here.

#### 18.1.3 `POST /api/volunteers/sign-in`

- **Location:** `server/src/routes/volunteer.routes.js`
- **Apparent purpose:** public guest sign-in endpoint. Creates a volunteer record, issues a short-lived guest JWT cookie.
- **Known behavior:**
  - Accepts `{ name }`
  - Inserts into `volunteers(full_name, source)` with `source = 'guest_login'`
  - Returns `id`, `full_name`, `signed_in_at`
  - Issues JWT `{ id, role: 'guest' }`
- **Belongs to the approved Volunteer Management architecture?**
  - It is an existing authentication/sign-in artifact that the approved Volunteer Management feature will interact with, but it is **not** the same as the approved event booking flow.
- **Legacy/temporary/unrelated?**
  - Existing and functional for guest sign-in.
  - Not a replacement for the approved booking/attendance design.
- **Compatibility/migration work needed?**
  - Yes, if the approved Volunteer Management feature reuses or extends guest identity/sign-in behavior. The current endpoint is about signing a volunteer in for a session; the approved feature also needs event/timeslot booking, capacity, and attendance semantics.

### 18.2 Comparison with the approved design

The approved six-table model uses:

- `volunteer_bookings` for both `VMS` and `WMS_GUEST` bookings
- `attendance` for attendance state
- no separate mock/guest production tables as part of the six core tables

The existing artifacts instead center on:

- `volunteers` for guest identity/session records
- `guest_sessions` for guest visit summaries
- `POST /api/volunteers/sign-in` for guest sign-in

These existing artifacts are **not** the same as the approved design, and they are **not** automatically the approved baseline for the V1 event/booking/attendance model.

### 18.3 Conflict recorded



---

## 19. Open Database Decisions / Deferred Items

The following items are unresolved based on repository inspection and are deferred rather than invented.

- **Warehouse operational days model:** No warehouse operational-days table or clear operational-day convention was found in the inspected repository files. If clash avoidance with warehouse operational days is required, the source of truth for operational days must be identified before implementation.
- **Real VMS inbound API transport:** The exact inbound VMS transport mechanism remains unknown. This affects inbound sync modeling, but not the approved outbound `vms_sync` table.
- **RLS policies:** Existing RLS policy definitions for the new tables are not present in the inspected repository files. RLS shape must be confirmed during implementation and is deferred here.
- **Mapping between old `volunteers` / `guest_sessions` and the new architecture:** Not resolved. The approved design does not automatically absorb them.
- **Live Supabase structure that cannot be verified from repository files:** The repository schema files may not match the live Supabase schema exactly. The donation repository comment explicitly says `schema.sql` is missing roughly a dozen tables the code queries. This means repository inspection alone cannot fully verify the live Supabase structure.

---

## 20. Database Architecture Lock

### [LOCKED DESIGN — NOT IMPLEMENTED]

Core tables:

1. `love_activism_events`
2. `event_spaces`
3. `event_timeslots`
4. `volunteer_bookings`
5. `attendance`
6. `vms_sync`

This architecture is considered approved unless repository inspection identifies a hard technical conflict that must be reviewed before implementation.

The existing simplified `events`/`bookings` tables in `database.md` §10, and the existing `volunteers`/`guest_sessions`/`POST /api/volunteers/sign-in` artifacts, are **not** automatically part of the approved six-table model. They are recorded as existing artifacts with unresolved relationships to this design.

### Chunk 2 status

- [x] Existing database conventions inspected
- [x] Six-table architecture documented
- [x] Relationships documented
- [x] Constraints documented
- [x] Derived values documented
- [x] Supabase/migration principles documented
- [x] Existing Volunteer artifacts investigated
- [ ] Database architecture implemented

---

*End of Chunk 2.*

A conflict exists between:

- the existing simplified Love Activism schema in `database.md` §10 (`events`, `bookings`)
- the existing `volunteers` / `guest_sessions` / `POST /api/volunteers/sign-in` artifacts
- the approved six-table architecture (`love_activism_events`, `event_spaces`, `event_timeslots`, `volunteer_bookings`, `attendance`, `vms_sync`)

This chunk does **not** resolve that conflict by redesign. It records it so implementation planning can address:

- whether `volunteers` and `guest_sessions` are retained, deprecated, merged, or left alone
- whether the existing `events`/`bookings` tables in `database.md` §10 should be replaced, renamed, or kept as a separate legacy concept
- how guest sign-in identity maps to `volunteer_bookings` with `booking_source = WMS_GUEST`




---



| created_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |
| updated_at      | TIMESTAMPTZ NOT NULL DEFAULT NOW()       | Project timestamp convention              |

### 11.1 Approved statuses

- `OPEN`
- `CLOSED`
- `CANCELLED`

`FULL` is **not** stored as a status. Full capacity is derived from confirmed bookings.

### 11.2 Constraints

Recommended constraints:

- `capacity > 0`
- `end_time > start_time`
- `UNIQUE(event_id, space_id, start_time, end_time)`

### 11.3 Indexes

Recommended indexes:

- `event_id`
- `space_id`
- `start_time`

### 11.4 Overlap handling

Do not implement complex overlap logic as a database constraint unless the existing project already uses a suitable convention.

Service-level validation is the approved default. The repository may query potential overlaps when needed.

### 11.5 Delete behavior

- `event` → `timeslots` may cascade if consistent with existing project convention.
- Space deletion should be restricted or prevented when referenced; normally spaces are deactivated instead.


### 9.4 Indexes

Recommended indexes:

- `event_date`
- `status`

Additional indexes may be added during implementation when query patterns require them.

### 9.5 Lifecycle rules

For V1:

- No repository hard-delete workflow is planned.
- Cancellation should occur via `status = 'CANCELLED'`.
- Detailed transition rules belong in services, not SQL, unless a basic `CHECK` can safely enforce allowed enum values.

### 9.6 Publish-status rule

`PUBLISHED` must represent a successful external publication state, not merely a user requesting publication.

If VMS publication is still pending or failed, the local synchronization state must express that through `vms_sync`, not by setting the event status to `PUBLISHED`.


*End of Chunk 1.*

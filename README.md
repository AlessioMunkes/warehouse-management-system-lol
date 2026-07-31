# Ladles of Love — Warehouse Management System (WMS)

A web-based warehouse management system for Ladles of Love NPC.


Built by UCT INF3003W Team 22, 2026.

---


A Progressive Web App that replaces Ladles of Love's manual, multi-spreadsheet warehouse
process (Google Sheets + QuickBooks + paper forms) with one system covering receiving,
decanting, picking/packing, dispatch, donations, and reporting across their three
programmes (NOC, Feed the Soil, Love Activism).

Nth architecture: **View → Application → Domain → Data Access**, backed by Supabase
(Postgres). See `docs/database.md` for the schema.



## Repository structure

```
client/
├─ src/
│  ├─ pages/          # One file per screen/route — see "Pages" below
│  ├─ components/      # Reusable UI shared across pages — forms, cards, tables
│  └─ styles/           # index.css — shared design tokens and component styles
server/
├─ src/
│  ├─ repositories/     # Raw DB queries only. No business logic, no validation.
│  ├─ services/         # Business logic, validation, orchestration. Calls repositories.
│  ├─ controllers/      # Thin HTTP handlers — parse request, call service, shape response.
│  ├─ routes/           # Express route definitions, mapped 1:1 to controller methods.
│  └─ middleware/        # Auth (JWT) and role-based access guards.
├─ database/
│  └─ schema.sql        # Source of truth for the live schema — keep in sync with database.md
docs/
├─ README.md            # this file
├─ database.md          # schema reference
└─ known-issues.md       # known bugs / open TODOs (create alongside this file)
```

**Request flow:** `pages/components` → `routes` → `middleware` (auth check) →
`controllers` (HTTP shaping) → `services` (business rules) → `repositories` (SQL) →
Supabase.


## Pages (`client/src/pages`)

| Page | Who uses it | Notes |
|---|---|---|
| `LandingPage` | Public | Marketing/about page, sits in front of login. See warehouse visit doc §6.1. |
| `LoginPage` | Everyone | Standard credentialed login. |
| `JobSelectPage` / `ProgrammeSelectPage` | Staff | Picks which programme's data the session is scoped to. |
| `PickingDashboard` | Packers | ⚠ currently named `PackingDashboard` in the diagram — rename to `Picking*` throughout, see note below. |
| `DispatchDashboard` | Dispatch staff (Bheki) | Gate confirmation, non-collection flags. |
| `DecantingPage` | Decanting team (Mapelo) | Offline-first stock count screen lives here or adjacent — see database.md notes on offline sync. |
| `DonationWindow` | Warehouse staff | Low-friction intake form (max 3 fields), see §5.2. |
| `AdminDashboard` | Administrator | User management, ECD onboarding/offboarding. |
| `FinanceDashboard` | Finance team | Invoices, QuickBooks sync status. |
| `ProcurementDashboard` | Warehouse manager | PO creation/status, supplier management. |
| `FTSDashboard` | Feed the Soil team | Bin tracking, farm exchanges. |
| `LoveActivismDashboard` | Volunteers/guests | Guest sign-in, events, bookings. |
| `Reporting&Analytics` | Management | Impact calculator, dashboards — see §Impact Calculator in warehouse visit doc. |

## Components (`client/src/components`)

Key forms: `PickingSlipWindow`, `DeliveryNoteWindow`, `DecantingSheet`, `DonationForm`,
`DonationCertificate`.

`PickingSlipWindow` needs a guest-accessible variant reachable via QR/unique URL without
a full login — see database.md §Picking Slips and warehouse visit doc §3.5.

## Server modules

**Controllers:** `AuthController`, `ProcurementController`, `InventoryController`,
`ProgrammeController`, `PickingController` , `DecantingController`,
`DispatchController`, `DonationController`, `AdminController`, `AnalyticsController`,
`FTSController`, `LoveActivismController`

**Services:** `AuthService`, `DeliveryService`, `PickingService`,
`StockMovementService`, `FinanceSync`, `WastageService`, `DonationService`,
`DecantingService`, `FTSBinsService`, `LoveActivismService`, `AuditingService`,
`AdminService`, `ReportingService`, `DispatchService`

**Repositories:** `UserRepository`, `DecantingRepository`, `ProcurementRepository`,
`PickingRepository`, `DonationRepository`,
`LoveActivismRepository`, `ECDRepository`, `DispatchRepository`, `ReportingRepository`,
`FTSRepository`

**Middleware:** `SecureJWTToken` (issues/verifies JWTs), `ProtectedRoleBasedAccess`
(role guard). A narrow, read-only, unauthenticated exception path needs to be added here
for guest QR access to a single picking slip — don't widen the general guard to cover
this, keep it scoped (see database.md).

## External integrations

- **Supabase (Postgres)** — primary data store, Row-Level Security for programme
  isolation. See database.md.
- **QuickBooks Online** — REST API, bidirectional for invoices/stock. PO-ID creation via
  API is **blocked pending a spike** (warehouse visit doc §2.4) — don't build further
  procurement-module code that assumes an outcome until that's resolved.
- **Volunteer Management System (VMS)** — unidirectional, receive-only from WMS. WMS does
  not call VMS. Full volunteer hour tracking stays out of scope here (business case
  §11.2); the WMS only needs enough local data for its own session summaries (§6.3).

## Non-functional requirements that apply to code, not just design

- WCAG 2.1 AA minimum on every non-management screen (large tap targets, plain language,
  high contrast, single-action workflows). Applies to dispatch, decanting, and any guest
  screen. Management/reporting dashboards are exempt.
- The stock count screen must work fully offline and sync on reconnect — this is a
  frontend/local-storage concern as much as a schema one, see database.md.





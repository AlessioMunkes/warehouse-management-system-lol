# Ladles of Love — Warehouse Management System

A web app for the Ladles of Love warehouse: purchase orders and receiving, stock, decanting,
picking slips and packing, dispatch, donations and Section 18A certificates, benevolent
requests, Feed the Soil, volunteer events, and reporting.

Built by UCT INF3003W Team 22, 2026.

## What is in this repository

```
client/                 React app (Vite, Tailwind). Installs as a PWA.
  src/
    pages/              One file per screen
    features/           One flat folder per area, holding that area's parts
    components/         Shared UI (components/ui) and the app shells (components/layout)
    routes/             routeTable.js lists every screen, who may open it, and its menu entry
    services/           One file per API area; the only place that calls the server
    styles/             Every stylesheet
    translations/       Afrikaans and isiXhosa for the warehouse floor
    lib/                Helpers and hooks used across features
    tests/              Vitest + Testing Library
  public/               Icons and images served as they are

server/                 Express API
  index.js              Starts the server and mounts every route
  src/
    routes/             URL -> controller, with the role check on each line
    controllers/        Read the request, call a service, shape the response
    services/           Rules and validation
    repositories/       SQL only
    features/           Larger areas that keep their own files together (reporting, recipes, settings, units)
    jobs/               Scheduled work (collection reminders, expiry warnings, saved reports)
    middleware/         Sign-in (JWT cookie) and role checks
    constants/          Roles and other fixed lists
  database/
    schema.sql          Builds the whole database (see The database)
    migrations/         Seed data, run after schema.sql
  scripts/              Command-line tools (see below)
  __tests__/            Vitest + Supertest

docs/
  new-database.sql      Builds a new database in one file (see The database)
  *.pdf                 The handover notes and the how-to-use guide
  handover-secrets-and-go-live.md   Keys, access, and the testing-to-production checklist

render.yaml             Deployment to Render
.github/workflows/      Lint, build and test on every push
```

[CODEBASE.md](CODEBASE.md) goes through every folder and says where new work belongs.

A request goes: screen -> `client/src/services` -> `server/src/routes` (sign-in and role
check) -> controller -> service -> repository -> Postgres.

## Who uses it

| Role | Signs in at | Sees |
|---|---|---|
| Warehouse staff (`warehouse_worker`) | `/login` | The floor: receiving, packing, decanting, dispatch, donation intake |
| Manager (`manager`) | `/login` | Orders, stock, picking slips, beneficiaries, reports |
| Admin (`admin`) | `/login` | Users, products, suppliers, logs, settings |
| Guest volunteer (`guest`) | `/guest` | One pallet to pack, by QR code or code |

Each role opens only its own screens. The classification queue and Section 18A are the two
screens a manager and an admin share. `client/src/routes/routeTable.js` is where this is set,
and `server/src/routes` is where the server enforces it.

## Running it on your machine

You need Node.js 22 and a Postgres database (the project uses Supabase).

```
cd server
copy env.example .env        # then fill it in: DATABASE_URL and JWT_SECRET at least
npm install
npm run check-env            # says what is set, missing or wrong (never shows a value)
npm run dev                  # http://localhost:5000

cd client
npm install                  # client/env.local.example lists optional build settings
npm run dev                  # http://localhost:5173
```

`server/env.example` explains every setting, in order: required, production, optional
features, tuning. Only `DATABASE_URL` and `JWT_SECRET` are required; each optional group
(Gmail, Gemini AI, QuickBooks, phone notifications) switches its feature on, and without it
everything else works. Business values (rounding, bands, reminder times, wording) are not in
any env file: an admin changes them under Settings.

Where the real keys are kept, who signs into what, and the testing-to-production checklist:
[docs/handover-secrets-and-go-live.md](docs/handover-secrets-and-go-live.md).

## The database

The database lives in Supabase (PostgreSQL 17).

### Starting a new database

**`docs/new-database.sql` is the one file to run.** It builds a new, empty warehouse database
in one go: every table, type, key, index and sequence, row-level security, the starter
settings every warehouse shares (programmes, reporting factors, storage locations, donation
routing, picking and donation settings) and the Summer and Winter recipes. It holds no
warehouse's data: no people, stock, donations, centres or contact details.

1. Create a new Supabase project.
2. Open SQL Editor, then New query, and paste the whole file.
3. Optional: near the end, set `admin_username`, `admin_first_name`, `admin_last_name` and
   `admin_password` (8 to 72 characters) to create the first admin. Left as `CHANGE-ME`, no
   admin is made; create one later with `npm run warehouse-admin -- create-admin`.
4. Press Run. Put the project's connection string (Connect, then Session pooler) in
   `server/.env` as `DATABASE_URL`.

It stops without changing anything if the database already has tables. Other ways to run it:

```
psql "<connection string>" --single-transaction -f docs/new-database.sql
cd server && npm run migrate -- init <code>     # the same, from schema.sql and the migrations
```

Where it comes from: `docs/new-database.sql` is built by `npm run build-new-database` (in
`server/`) from two sources, and a test fails if it falls behind them:

- `server/database/schema.sql`: the whole schema, no data.
- `server/database/migrations/`: the seed data (`001_seed_starter_settings.sql`,
  `003_seed_season_recipes.sql`) and any schema change made since (`002_translation_overrides.sql`).

### Changing the database

- A schema change: make it on the database, then run `npm run export-database` in `server/`
  to write `schema.sql` again, and `npm run build-new-database` to rebuild
  `docs/new-database.sql`. If other databases already exist, also put the change in the
  next numbered file in `server/database/migrations/` and run `npm run migrate -- up`.
- New starter data: add `server/database/migrations/NNN_seed_what_it_adds.sql`. Every insert
  in it ends `ON CONFLICT DO NOTHING`, so it is safe on a database that already has the rows
  (a test checks this). Run `npm run migrate -- up`, then `npm run build-new-database`.
- The numbered schema migrations that built the live database up (001 to 070) were folded into
  `schema.sql` and removed. `schema.sql` records them in `schema_migrations`, so `up` never
  tries to run them again.

## Tests

```
cd client && npm run lint && npm test
cd server && npm test
```

`server/__tests__/fixtures/routeRoles.baseline.json` records which roles may call each URL.
When you add or change a route, that test fails until the file is updated: that is the point.

## Command-line tools (`server/scripts`)

| Script | What it does |
|---|---|
| `npm run migrate` | Applies new database changes from `database/migrations/` (see The database) |
| `npm run check-env` | Checks the server's environment: what is set, missing or wrong. Never prints a value |
| `npm run build-new-database` | Writes `docs/new-database.sql` (the one-file installer) from `schema.sql` and the seed migrations |
| `npm run export-database` | Writes `server/database/schema.sql` from the database in `.env`. Only reads |
| `npm run warehouse-admin` | Looks up and manages people across warehouses, when running more than one |
| `seedWesternCapeSupply.mjs` | Loads the sponsor's supply sheet: centres, products, standing orders |
| `loadRealData.mjs` | Loads the summer menu into the Summer recipe and the July 2026 stock count |
| `evalReportingQuestions.js` | Checks the reporting question box against a list of sample questions |

The two load scripts have a `--dry-run` that prints what they would do.

## Deployment

`render.yaml` deploys one web service on Render: Express serves the API and the built client
from the same address. The secrets (`DATABASE_URL`, `GEMINI_API_KEY`, the `VAPID_` keys) are
pasted into the Render dashboard, not stored here. It currently deploys the
`staging/(DEVELOPMENT-TESTING)` branch on the free plan, which sleeps when idle.

## Things to know

- The Supabase session pooler allows 15 connections. Several developers running the server
  against the same database can use them up; set `DB_POOL_MAX=3` locally.
- The floor works without a signal. Screens show the last copy they loaded, and what a worker
  submits (a delivery, a packed item or pallet, a decanting sheet, a donation, a benevolent
  request, a compost weigh-in, a gate collection) is kept on the phone and sent when the signal
  returns; a bar at the top says what is waiting. Claiming or releasing a pallet needs a signal.
  See `client/src/services/outbox.js` and `server/src/middleware/idempotency.middleware.js`.
- The floor reads in English, Afrikaans or isiXhosa. A worker chooses on their home screen and
  the choice is saved on their account. So far the home screen, the tab bar, the no-signal bar
  and Packing are translated; the other floor tasks are still in English. All the text is in
  `client/src/translations/messages.js`. The Afrikaans and isiXhosa there were drafted without a fluent
  speaker checking them: have one read that file before relying on it.
- A worker can add a photo when flagging an item in Packing, and of a delivery in Receiving.
  The manager sees them on the picking slip and the purchase order. The phone shrinks each to
  about 1280 pixels first. They are stored in the database (`photos` table), which has room for
  a few thousand; `server/src/repositories/photo.repository.js` is the one place to change to
  move them to file storage.
- Barcodes are a second way to count stock, beside choosing items from the list. Staff scan
  with the phone camera, or a USB or Bluetooth scanner, in Receiving, Donation intake, Packing
  (to check an item before confirming it) and when counting an area on the warehouse map. An
  admin links barcodes to a product on the product screen, scanning or typing them. Loose stock
  with no barcode gets one from Print labels, on the product screen or on a stock item in
  Inventory: a sheet of stickers to print. A barcode nobody has linked yet is looked up in the public Open
  Food Facts database, which suggests which stock item it probably is and fills in the name,
  brand and pack size; a person confirms every link. Only the barcode is sent. Set
  `OPEN_FOOD_FACTS_ENABLED=false` in `server/.env` to switch the lookup off.
- On a phone, the floor's top bar, tab bar and a task's pinned header and Finish bar slide out
  of the way while a worker scrolls down a task or types, and come back when they scroll up.
- A worker, manager or admin sees a short welcome card the first time they sign in, ending
  with where to find the round Help button.
- Stock is taken off at dispatch, not at packing. A packed pallet waiting for collection counts
  as committed, not gone.
- Picking slips are made from the recipe in use (Settings -> Recipes). With no recipe filled
  in, they fall back to each centre's standing order.
- Products counted in crates, bags, boxes or punnets but packed by weight need those weights
  set in Settings -> Stock rules.
- The `operational_goals` table is still in the database; the feature that used it was removed.

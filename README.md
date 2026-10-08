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
    features/           Each feature's components, hooks and helpers
    components/         Shared UI (components/ui) and the app shells (components/layout)
    routes/             routeTable.js lists every screen, who may open it, and its menu entry
    services/           One file per API area; the only place that calls the server
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
    schema.sql          Every table in the database, for reference. Not a script to run.
  scripts/              Command-line tools (see below)
  __tests__/            Vitest + Supertest

render.yaml             Deployment to Render
.github/workflows/      Lint, build and test on every push
```

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
npm run dev                  # http://localhost:5000

cd client
copy env.local.example .env.local
npm install
npm run dev                  # http://localhost:5173
```

`server/env.example` explains every setting. The AI help panel and the reporting question box
need `GEMINI_API_KEY`; phone notifications need the three `VAPID_` keys; without them those
features are switched off and everything else works.

## The database

The database lives in Supabase and is the real thing; this repository does not hold a script
that builds it from nothing.

- `server/database/schema.sql` is a reference copy of every table, for reading. It is not
  meant to be run (its first line says so).
- A second database (a test copy, another warehouse) is made by copying the existing one in
  Supabase, not from this repository.
- The numbered migration files that built the database up were removed at handover: it already
  has all of them, recorded in its `schema_migrations` table.
- When you change the database: put the change in a new file
  `server/database/migrations/NNN_what_it_does.sql` (the next number after 039), run
  `cd server` and `npm run migrate -- up`, and make the same change in `schema.sql`.

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
- Stock is taken off at dispatch, not at packing. A packed pallet waiting for collection counts
  as committed, not gone.
- Picking slips are made from the recipe in use (Settings -> Recipes). With no recipe filled
  in, they fall back to each centre's standing order.
- Products counted in crates, bags, boxes or punnets but packed by weight need those weights
  set in Settings -> Stock rules.
- The `operational_goals` table is still in the database; the feature that used it was removed.

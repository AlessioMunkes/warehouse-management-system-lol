# Codebase breakdown

Where everything lives in this repository, and where a new piece of work should go.
For what the system does and how to run it, see [README.md](README.md).

## The whole thing in one picture

```
client/                     The web app (React, Vite, Tailwind). Installs as a phone app.
  index.html                The one HTML page
  public/                   Icons and images served as they are, and the push-notification worker
  src/
    main.jsx                Starts the app and loads the global stylesheets
    App.jsx                 Builds the routes from routes/routeTable.js
    routes/                 Every screen: its address, who may open it, its menu entry
    pages/                  One file per screen
    features/               One folder per area of the system, holding that area's parts
    components/
      ui/                   Small building blocks: button, dialog, table, badge
      layout/               The shells around a screen: side menu, top bar, account menu
    services/               One file per part of the API. The only code that calls the server
    context/                AuthContext: who is signed in
    lib/                    Helpers and hooks used across features
    styles/                 Every stylesheet
    translations/           Afrikaans and isiXhosa for the warehouse floor
    assets/                 Images imported by code (logo, sign-in background)
    tests/                  Every test (Vitest + Testing Library)

server/                     The API (Node, Express, Postgres)
  index.js                  Starts the server, sets up security and compression, mounts every route
  src/
    routes/                 Address -> controller, with the role check on each line
    controllers/            Read the request, call a service, shape the answer
    services/               The rules: what is allowed, what is refused and why
    repositories/           SQL only
    features/               Logic that is not a request, one flat folder per area (see below)
    middleware/             Sign-in, role checks, rate limits, repeat-request protection
    constants/              Fixed lists: roles, order statuses, movement types
    config/                 Database connection, environment, cookies, multi-warehouse
    jobs/                   Work that runs on a timer
    integrations/           Everything that talks to an outside system: email, PDFs, the volunteer system (VMS)
    utils/                  Small shared helpers; utils/donationIntake is the donation form's validation
  database/
    schema.sql              Every table, for reference. Not a script to run
    migrations/             Numbered changes to the database, applied in order
  scripts/                  Command-line tools (migrate, load data, admin tasks)
  __tests__/                Every server test (Vitest + Supertest)

render.yaml                 How it is deployed on Render
.github/workflows/ci.yml    Lint, build and test on every push
```

## How a click becomes a database change

```
screen (pages/)  ->  services/xAPI.js  ->  server routes/  ->  controller  ->  service  ->  repository  ->  Postgres
                                            sign-in + role       shape         rules        SQL
```

Each step does one job. A page never calls `fetch` itself, a controller holds no rules, a
service holds no SQL. When something is wrong, the layer tells you where to look: a wrong
refusal is in the service, a wrong number is in the repository.

## Client

### Where things go

| You are adding | Put it in |
|---|---|
| A new screen | `pages/XPage.jsx`, then one line in `routes/routeTable.js` and one in `routes/pages.jsx` |
| A part of one area (a form, a table, a panel, a helper, a hook) | `features/<area>/` |
| Something three or more areas use | `components/ui/` if it is a building block, `lib/` if it is a helper or hook |
| A call to the server | `services/<area>API.js` |
| Styling | An existing file in `styles/`. Never a `.css` file beside a component |
| Text the warehouse floor sees | Also a line in `translations/phrases.js` |
| A test | `tests/` |

### Rules the folders follow

- **A feature folder is flat.** `features/packing/` holds its files directly. There are no
  `components/`, `hooks/` or `context/` folders inside a feature.
- **`.jsx` draws something, `.js` does not.** A component is `Name.jsx`; data, helpers and
  hooks are `name.js`. They sit side by side. Hooks start with `use`.
- **Two files in one folder never differ only by capital letters or extension.** Windows
  treats them as the same name.
- **Feature folders are camelCase**, named for the area, not the kind of file.
- **Each screen is loaded when first opened.** `routes/pages.jsx` lists them; do not import a
  page anywhere else.
- **Stylesheets used everywhere are loaded once, in `main.jsx`.** A stylesheet for one kind of
  screen (guest, printed notes, report charts) is imported by the component that needs it,
  from `styles/`.

### `routes/`

| File | What it is |
|---|---|
| `routeTable.js` | The single list of screens: address, roles allowed, which menu it is in. The menu and the access check both read it, so they cannot disagree |
| `pages.jsx` | Which page file each route shows |
| `paths.js` | The addresses, as named constants. Use these, never a typed-out address |
| `permissions.js` | The role groups (`MANAGER_ONLY`, `WORKERS_ONLY` and so on) |

Each role opens only its own screens. Two screens are shared by managers and admins:
the classification queue and Section 18A.

### `features/`

| Folder | What it covers | Used by |
|---|---|---|
| `receiving` | Counting a delivery in, the signature pad, the delivery note | Staff |
| `packing` | A worker's pallets: the list, the packing steps, pallet labels | Staff |
| `decanting` | Weighing bulk stock into bags, the decanting sheet | Staff |
| `dispatch` | The gate queue, checking a pallet out, the dispatch note | Staff |
| `donation` | Recording a donation and its review screen | Staff |
| `staff` | What every floor screen is built from: step screens, lists, drafts, photos, the language picker | Staff |
| `guest` | The volunteer screens' building blocks | Guests |
| `purchaseOrders` | The order list, form, detail and timeline; the QuickBooks import | Manager |
| `inventory` | Stock on hand, adjustments, the ledger, reconciliation | Manager |
| `pickingSlips` | Generating, creating, editing and assigning slips | Manager |
| `beneficiaries` | The centre form and table columns | Manager |
| `communityRequests` | Benevolent requests: the floor's flow and the manager's panels | Staff, Manager |
| `feedTheSoil` | Collection kits and compost: the floor's flow and the manager's view | Staff, Manager |
| `volunteerManagement` | Events, time slots, bookings, walk-ins | Manager |
| `reporting` | Charts, the report builder, saved reports, the impact report | Manager |
| `receipts` | Past delivery and dispatch notes, and the shared PDF frame | Manager |
| `donationManagement` | The classification queue and reconciliation | Manager, Admin |
| `dashboard` | The customisable dashboard and its widgets | Manager, Admin |
| `notifications` | The bell, the notification list, phone alerts | Everyone |
| `assistant` | The chat helper | Everyone |
| `users` | Inviting and editing users | Admin |
| `products` | The product form | Admin |
| `suppliers` | The supplier form | Admin |
| `settings` | Recipes, unit sizes, email and certificate settings | Admin |
| `activityLog` | Staff activity, the volunteer sign-in log, links from a log line to its record | Admin |
| `finance` | The warehouse movement report | Admin |
| `masterdata` | The table behind every list screen: sorting, columns, opening a row | Manager, Admin |

### `components/layout/`

| File | What it is |
|---|---|
| `ManagerLayout.jsx` | The side menu and top bar. Every signed-in screen sits inside it |
| `StaffShell.jsx` | The floor's frame inside that: page heading, step progress, bottom tab bar |
| `AccountMenu.jsx` | The menu behind your name: Profile, Help, Shortcuts, Change language, Log out |
| `helpContent.js` | The Help text for each role |
| `shortcuts.js`, `useKeyboardShortcuts.js` | The keyboard shortcuts: the list, and what makes them work |
| `ProtectedRoute.jsx` | Sends someone away from a screen their role may not open |
| `AppNav.jsx`, `navSections.js` | The menu itself, built from `routeTable.js` |
| `OfflineBar.jsx` | The "no signal" bar and what is waiting to send |

### `services/`

One file per part of the API (`pickingAPI.js`, `purchaseOrderAPI.js`, and so on), all built
on `api.js`. Three files are the offline machinery:

| File | What it does |
|---|---|
| `readCache.js` | Keeps the last answer to a read, so a screen opens with no signal |
| `outbox.js` | Holds work done with no signal and sends it when the signal returns |
| `offlinePost.js` | "Send this, or queue it": what the floor's save buttons call |

### `styles/`

| File | What it styles |
|---|---|
| `index.css` | The design tokens (colours, type, spacing), Tailwind, and manager and admin screens |
| `staff.css` | The warehouse floor (every class starting `stf-`) |
| `guest.css` | The volunteer screens (`gst-`) |
| `landingpage.css` | The public landing page |
| `receipts.css` | Printed delivery and dispatch notes |
| `deliveryNotePDF.css` | The PDF versions of those notes |
| `operationalReport.css` | Report charts |

### `translations/`

The floor reads in English, Afrikaans or isiXhosa. Manager and admin screens are English only.

| File | What it is |
|---|---|
| `index.js` | The chosen language, and `useT()` for text asked for by key |
| `messages.js` | Text asked for by key: home, the tab bar, Packing |
| `phrases.js` | Everything else on the floor, as `[English, Afrikaans, isiXhosa]` |
| `floorTranslator.js` | Swaps each phrase on the page for its translation |

New floor text needs a line in `phrases.js`, or it shows in English. The Afrikaans and
isiXhosa are drafts and have not been checked by a fluent speaker.

### `lib/`

Helpers with no home in one feature: `quantity.js` (formatting amounts), `statusStyles.js`
(the colour and icon for every status), `recordCache.js`, `theme.js`, `clipboard.js`,
`utils.js`, and three hooks (`useSortable`, `useDebouncedValue`, `useOutbox`).
`lib/validation/` is the donation form's validation.

## Server

### The four layers

| Layer | Folder | One file per area, named | Its job |
|---|---|---|---|
| Routes | `src/routes/` | `picking.routes.js` | The address and who may call it |
| Controllers | `src/controllers/` | `picking.controller.js` | Read the request, send the answer |
| Services | `src/services/` | `picking.service.js` | The rules. Refuses with `fail(status, message)` |
| Repositories | `src/repositories/` | `picking.repository.js` | The SQL |

To follow a feature, open the same name in each folder. Every `*.controller.js` is in
`controllers/`, every `*.service.js` in `services/`, every `*.repository.js` in
`repositories/`. None live anywhere else.

### `src/features/`

Logic that the layers call but that is not itself a request: calculations, catalogues and
wording. One flat folder per area, with no folders inside.

| Folder | What it is |
|---|---|
| `reporting` | The report catalogue, custom queries, saved reports, insights, the question-answering helper |
| `communications` | The wording of every in-app notice (`notices.js`) and the kinds of message sent (`messageTypes.js`) |
| `settings` | What can be set in Settings, with defaults and limits (`settingsDefinitions.js`) |
| `calendar` | South African public holidays |
| `recipes` | Which recipe applies on a date, and how a slip quantity is worked out |
| `units` | Converting between units, and the whole-number rule for items that are not decantable |
| `assistant` | What the chat helper knows |
| `privacy` | Removing personal details from logs |

### Things worth knowing

- **Roles** are checked on every route with `requireRole(...)`. A test
  (`__tests__/routeRoles.test.js`) compares every route against
  `__tests__/fixtures/routeRoles.baseline.json`, so a change to who may call something
  fails until the baseline is updated on purpose.
- **Stock** changes go through `stock.repository.js`, which writes the ledger line with each
  one. Stock comes off at dispatch, not at packing.
- **Purchase-order statuses** and the moves allowed between them are in
  `constants/purchaseOrderStatus.js`.
- **Notifications** are written inside the same database transaction as the change they
  announce (`features/communications/notices.js`).
- **Repeat requests** from a phone that lost signal are recognised by
  `middleware/idempotency.middleware.js` and answered without doing the work twice.
- **Raising a purchase order emails Finance.** Tests that create one through the API send a
  real email if Gmail is connected.

### Database

`database/schema.sql` describes every table. To change the database, add the next numbered
file to `database/migrations/` and append the same change to `schema.sql`, then run
`npm run migrate` in `server/`.

## Tests

| Where | Run with | What |
|---|---|---|
| `client/src/tests/` | `npm test` in `client/` | Screens and helpers, in a simulated browser |
| `server/__tests__/` | `npm test` in `server/` | Routes, services and repositories against a mocked database |
| `server/__tests__/integration/` | `npm run test:integration` in `server/` | The same against a real database |

`npm run lint` and `npm run build` in `client/` must also pass; CI runs all of them.

## Known loose ends

- `features/donationManagement/PendingDonationsTab.jsx` and `usePendingDonations.js` are
  not shown on any screen. Only their tests use them.
- `client/src/lib/validation/donationIntake.part1.js` and `.part2c.js` are oddly named halves
  of one validator; the server has the full set under `server/src/utils/donationIntake/`.
- `server/__tests__/helpers/buildDonationAdminApp.js` imports a route file by a path that
  does not exist. Only the integration tests use it, and they need a real database to run.

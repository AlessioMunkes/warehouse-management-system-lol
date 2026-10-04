# UI and architecture implementation brief (Oct 2026)

Hand-off from the design and GRASP review. Read this before starting any phase. Branch reviewed: `staging/(DEVELOPMENT-TESTING)`.

Design reference: canvas "WMS Inventory Redesign" at https://claude.ai/artifact/5HGzZQMLb29D5opC51FxJp, page "Feed the Soil style". The canvas uses made-up sample data; take the layout and behaviour from it, not the values.

## Ground rules

- Read the real files before changing them. Every finding below came from a structural read and must be verified in code first.
- Deliver in the team's usual way: numbered, idempotent bash scripts run from the repo root, exact literal-match patching (CRLF-safe), a new numbered script for every correction.
- One phase per branch and PR. Tests (Vitest, client and server CI jobs) must pass before the next phase.
- Visual style stays as it is on the Feed the Soil manager view (`FeedTheSoilManagerView.jsx`): Inter, `text-2xl font-medium` page title with muted subtitle, underline tabs, shadcn `Card`, pill `Button` and `Input`, shared `StatusBadge`, `SortableHead`, `TablePager`. No new fonts, colours or radii. Every admin and manager page should have this so pages dont have different styles
- No behaviour change to the worker and guest flows.

## Phase 1: shared list pattern, Inventory first

Goal: one reusable manager list pattern, proven on Inventory.

1. Build shared pieces in `client/src/components/ui/`: view tabs with counts (Feed the Soil tab style), a list toolbar (search, removable filter chips, Columns, Export), a bulk-action bar that replaces the toolbar while rows are ticked, and a right-side detail panel.
2. `InventoryManagementPage.jsx` and `StockManifestTable.jsx`:
   - Replace `StockHealthBar` cards with view tabs: All, Low stock, Shortfall, Expiring in 30 days, No movement 60+ days. Keep the `?status=lowstock` deep link working.
   - Replace the local `Badge` classes (`badge-shortfall`, `badge-lowstock`, `badge-instock`) with `StatusBadge`; add an `inventory` kind to `lib/statusStyles.js`.
   - Page header to the Feed the Soil pattern (drop the Montserrat title and red left bar).
   - Right-align numeric columns, tabular numerals; SKU under the product name.
   - Remove the 30-day sparkline column; show the trend chart inside the detail panel with the reorder level marked.
   - Merge `StockItemSummary` and `MovementHistory` into the one detail panel opened from the product name; remove the per-row icon buttons.
   - Tick boxes with bulk actions: Raise purchase order, Adjust stock, Export selected.
3. Expiry: extend `getManifest` (`stock.repository.js`) to return the earliest expiry per product and per-batch expiry for the panel. Expiry data already feeds `expiryWarning.repository.js`; confirm where it is stored before writing SQL. Add an "Earliest expiry" column and the batch list (earliest first).

## Phase 2: the same pattern on the other manager screens

- Picking Slips (`PickingSlipManagementPage.jsx`, 991 lines): view tabs Unassigned, Packing, Ready at gate, Not collected; bulk Assign packer and Print pallet labels; detail panel. Split the page into components while doing it.
- Purchase orders: extend the Open/All tabs with Awaiting approval, In transit, Follow-up required; add a Received (n of m lines) column; detail panel with Approve or Record follow-up.
- Stock ledger: filter card becomes tabs by movement type plus chips; the four summary tiles become one summary line; Reference links to the slip or order.
- Dashboard: a "Needs attention" list above the existing widgets, each line linking to a screen with the right tab preselected; make every `StatTile` use its `to` prop.
- Sidebar (`navSections.js`): regroup the manager menu as Overview, Inbound, Stock, Outbound, Programmes, Insights, with counts on items needing attention. Top-bar global search is a later, separate piece of work.

## Phase 3: one permissions definition

Problem: the same rule is written in `App.jsx` route guards, `navSections.js`, and about 20 server route files, each redeclaring its own role groups (`MANAGERS_UP`, `MANAGES_UP`, `ADMIN_OR_MANAGER`, inline arrays).

- Server: one `constants/permissions.js` exporting named role groups; route files import them, no local redeclaration. Pure refactor, no access change; add a test asserting each route's roles are unchanged.
- Client: one route table (`path`, `roles`, nav group, label, icon) that generates both the `App.jsx` routes and the sidebar sections.
- Decide with the team whether admins should see manager screens in their menu (today they can only reach them by URL).

## Phase 4: communications module

Problem: six services each build and send their own emails and record the outcome in five different places (`donation_email_logs`, `finance_report_email_logs`, `ecd_collection_reminders`, columns on `user_invites`, columns on purchase orders; scheduled reports appear to have no log). Four repositories create notifications directly.

- New `server/src/features/communications/`: templates, a `send` function wrapping `email.provider.js`, and one `outbound_messages` table (channel, type, recipient, status, error, related record type and id, attempted at). Migration must be idempotent.
- Move senders over one at a time: invites, purchase order finance email, finance report link, collection reminders, donation and Section 18A emails, scheduled reports. Keep existing tables readable until each move is verified.
- Move `createNotification` calls out of `dispatch`, `picking`, `purchaseOrder` and `stock` repositories into their services (same transaction client passed through).
- `gmail.controller.js` test send goes through a service.
- Client: one "Message history" screen with a type filter; rename the Section 18A tab currently labelled "Email Integration" to "Email history".

## Phase 5: settings

- One admin Settings page with sections: Email (Gmail connection, test send), Notifications and reminders (finance recipient, reminder send time, non-collection cut-off), Stock rules (expiry warning windows), Reporting (impact factors, targets), Certificates (API exists server-side with no client screen).
- New `settings` service and table for the values currently hardcoded: `NON_COLLECTION_CUTOFF_HOUR` (`dispatch.service.js`), `RUN_HOUR_SAST` (`ecdCollectionReminder.job.js`), expiry tiers (`expiryWarning.service.js`), `INVITE_TTL_MS` (`userInvite.service.js`). Defaults equal today's values.
- Per-user preferences (theme, reduced motion, sidebar, dashboard layout, columns) stay where they are.

## Phase 6: clean-up

- Confirm unused, then remove: `ManagerActivityScreen`, `ProcurementDashboard`, `SelectNOCjob`, `PackingPage`, `PackingStaffPage`, `ReceivingPage` (not routed in `App.jsx`), the empty `ProductClassificationsPage.jsx`.
- Finance report page is routed but not in the menu: add it or remove it.
- Donations: plan (do not rush) merging `donation`, `donationAdmin`, `donation.intake`, `pendingDonation` into one module with intake, classification and certificates parts; `donation.service.js` is 1,414 lines.
- Dashboards: fold `taskdashboard`, `dashboard` and `ManagerActivitySelection` feature folders into one; rename `AdminActivityScreen` to match what it is.

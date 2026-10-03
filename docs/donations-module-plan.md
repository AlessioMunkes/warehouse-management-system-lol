# Donations: plan for one module

Status: plan only. Nothing here has been changed yet. Written October 2026 as Phase 6 of the UI and architecture brief, which asks for a plan and says not to rush it.

## Why

Donation code is spread over four server modules that grew one after another. Nothing tells a reader which one is current:

| Module | Server files | Lines |
|---|---|---|
| `donation` | routes, controller, `donation.service.js`, `donation.repository.js`, `donation.classification.js` | 328 + 1,420 + 943 + 93 |
| `donation.intake` | `donationIntake.routes.js`, controller, service, repository, `lib/validation/donationIntake.*` (6 files) | 60 + 204 + 205 + 47 + ~230 |
| `pendingDonation` | routes, controller, service, repository | 55 + 123 + 856 + 482 |
| `donationAdmin` | routes, `donation.admin.js` controller, service | 137 + 322 + 205 |

That is about 5,700 lines. `donation.service.js` alone is 1,420 lines and holds four unrelated jobs: recording a donation, thank-you emails, the email history, and Section 18A certificates.

## What is actually live

Traced from the client's API calls (`client/src/services/donation*.js`) to the server:

**Intake: one path is used, two are not.**
- **Used:** the intake screens (`ReviewPage`) post to `POST /api/donations/pending`. `pendingDonation.service` stages the donation, raises flags for anything unresolved, and commits by calling `donation.service`'s `createDonation`, which writes the donation and moves stock.
- **No UI caller:** `POST /api/donations` (`donation.controller` `createDonation`). The client's `createDonation` in `donationAPI.js` is never imported.
- **No UI caller:** `POST /api/donations/intake` and `POST /api/donations/intake/unrecognized` (`donation.intake.service`). This path has its own `adjustStock` call, so it is a second, independent way to put donated stock on the shelf.
- **Used:** from the intake module, only the product search (`GET /api/donations/intake/products/search`) is called.

**Classification: two overlapping APIs.**
- `donationAdmin.routes.js` holds the category routing rules, the per-product defaults, the pending classifications and the routing preview.
- `donationClassificationAPI.js` on the client has no importers. The Donation Management screen uses `donationManagementAPI.js`, which calls the `/admin/pending-classifications` and `/pending` routes.
- Flag resolution happens in `pendingDonation` (`/pending/flags/:flagId/resolve`).

**Section 18A: split three ways.**
- Certificate issue, email and resend live in `donation.service.js`.
- The donor's form is served by `donation.routes.js`.
- The settings exist twice: `/api/certificate-settings`, and `donationAdmin`'s `/section-18a/settings`.

Before step 1, confirm both "no UI caller" findings against production logs (requests to those paths in the last 90 days). Something outside this repo, such as a script or an integration, may call them.

## Target

One feature folder, split by what the warehouse does with a donation, not by when each piece was written:

```
server/src/features/donations/
  intake/          staging, flags, commit       (from pendingDonation + the createDonation core)
  classification/  category rules, product defaults, pending classifications  (from donationAdmin + donation.classification)
  certificates/    Section 18A: donor form, issue, email, settings  (from donation.service + certificateSettings + donationAdmin's section-18a)
  records/         list, detail, events, email history, unmatched items  (the read side of donation.service)
  routes.js        one router mounted at /api/donations, the same URLs as today
```

The client mirrors it: one `services/donationsAPI.js` (or one per part), with `features/donation` and `features/donationManagement` regrouped the same way.

## Steps

Each step is its own pull request, keeps every current URL working, and must pass the server and client suites. The route-roles baseline (`server/__tests__/fixtures/routeRoles.baseline.json`) must not change except where a step removes a route on purpose.

1. **Pin current behaviour.** Add tests for the live intake path end to end: stage, flag, resolve, commit, and the stock movement written. Cover Section 18A issue and resend through the service, not only the routes. The later steps move code, and these tests are what shows nothing moved wrongly.
2. **Retire the paths nobody calls.** Once production logs confirm it, remove `POST /api/donations`, `POST /api/donations/intake` and `POST /api/donations/intake/unrecognized`, plus `donationClassificationAPI.js` and the client's unused `createDonation`.
   - Keep `donation.service`'s `createDonation` function: the live commit uses it.
   - This leaves one write path for donated stock, which is the main safety gain of the whole plan.
3. **Move the certificates out.** Section 18A issue, email, resend, the donor form and both settings endpoints go into `certificates/`.
   - Make `/api/certificate-settings` the single settings API. Admin Settings → Certificates already uses it.
   - Redirect or remove `donationAdmin`'s `/section-18a/settings` after checking the Section 18A screen does not call it.
   - This takes about 500 lines out of `donation.service.js`.
4. **Move the classification.** `donationAdmin` and `donation.classification.js` go into `classification/`.
5. **Move intake.** `pendingDonation` plus the `createDonation` core go into `intake/`. The commit and its stock movement stay in one transaction, as they are now.
6. **What is left is records.** The read side of `donation.service` (list, detail, events, email history, unmatched items) becomes `records/`, and `donation.service.js` is gone.
7. **Client.** Regroup the client services and feature folders to match. The URLs did not change, so this is a move with no behaviour change.

## Risks

- **Stock.** Donated stock reaches the ledger through `adjustStock`. Step 2 removes a second route to it. Every later step must keep the commit's single transaction, because a donation recorded without its stock movement is the failure the reconciliation screen exists to catch.
- **Emails.** Thank-you and Section 18A emails go through `features/communications` now (Phase 4). Moving them must keep their `donation_email_logs` rows and their `outbound_messages` rows.
- **Notifications.** `pendingDonation.service` and `donation.service` call `createNotification` directly. Move those calls into `features/communications/notices.js`, as Phase 4 did for picking and dispatch.

## Open questions for the team

- Is anything outside this repository calling the unused intake endpoints?
- Should the classification rules be admin-only? Today both routers allow managers and admins.
- Is the `pending` naming worth keeping in the URLs, or should intake move to `/api/donations/intake` once the old route there is gone? That is a URL change, so it would need its own step and a client update.

# User invite assessment — recon for admin-set-password → email-invite replacement

Read-only recon. All line numbers/paths are against `origin/staging/(DEVELOPMENT-TESTING)` at
commit `f32e7a4` ("Merge pull request #67 from AlessioMunkes/feature/volunteer-log"), checked
out detached for this investigation, unless a section says otherwise. Local
`staging/(DEVELOPMENT-TESTING)` was stale (at `2c44dd8`) — origin is ahead; treat origin as
current.

---

## 1. User Management as it exists

Full stack, in call order:

**Route** — [server/src/routes/user.routes.js](server/src/routes/user.routes.js)
Every route is `auth, requireRole(ROLES.ADMIN)` only — admin-gated end to end, no manager access.

```
GET    /api/users            → userController.list
POST   /api/users            → userController.register
GET    /api/users/:id        → userController.getOne
PATCH  /api/users/:id        → userController.update
PATCH  /api/users/:id/status → userController.setStatus
DELETE /api/users/:id        → userController.remove
```

**Controller** — [server/src/controllers/user.controller.js](server/src/controllers/user.controller.js)
Thin HTTP layer, exports `{ list, getOne, register, update, setStatus, remove }`. `register`
(line 48) calls `userService.createUser(req.body, req.user.id)` and returns 201. No validation
lives here — errors are shaped from `err.status` (default 500), matching `supplier.controller.js`.

**Service** — [server/src/services/user.service.js](server/src/services/user.service.js)
Exports `{ listUsers, getUser, createUser, updateUser, setUserStatus, archiveUser }`.

`createUser(body, actorId)` (line 104):
1. `buildUserPayload(body)` — requires `username` (≤50 chars), `firstName`/`lastName` (≤100
   chars each), and `role` against a hardcoded whitelist `['warehouse_worker','manager','admin']`
   (line 29) — described in a comment as mirroring the live DB CHECK constraint, not a wish list.
2. `validPassword(body.password)` — string, `length >= 8`, nothing else (line 64-69).
3. `repo.findUserByUsername(payload.username)` — 409 if taken (case-insensitive).
4. `bcrypt.hash(password, BCRYPT_COST)` where `BCRYPT_COST = 10` (line 27).
5. `repo.insertUser({ ...payload, passwordHash }, actorId)`.

No email field anywhere in `buildUserPayload` or the `users` table reads/writes — confirmed
absent, see §6.

**Repository** — [server/src/repositories/user.repository.js](server/src/repositories/user.repository.js)
Exports `{ listUsers, getUserById, findUserByUsername, insertUser, updateUser, setUserActive,
archiveUser }`. `USER_COLUMNS` (line 30) deliberately omits `password_hash` from every SELECT —
comment states there is no code path that can leak a hash to the API by accident.

`insertUser(payload, actorId)` (line 96): opens its own `BEGIN`/`COMMIT` transaction, inserts the
row, then calls `logAudit(client, { entityType: 'user', entityId: user.id, action: 'created',
actorId, after: user })` inside the same transaction before committing. See §3 for why this call
is almost certainly broken today.

**Frontend page** — [client/src/pages/UserDirectoryPage.jsx](client/src/pages/UserDirectoryPage.jsx)
(437 lines). Renders `UserForm` for both create (line 304, no `initial`) and edit (line 311,
`isSelf={selected.id === user?.id}`). `create` handler (line 259) calls
`userAPI.createUser(payload)`.

**Frontend form** — [client/src/features/users/components/UserForm.jsx](client/src/features/users/components/UserForm.jsx)
Single component for create+edit. Password fields (`password`, `confirmPassword`) only render
when `!isEdit` (line 162) — editing never shows or submits a password; `updateUser` has no
password branch at all (confirmed in service). `confirmPassword` is client-only, never sent
(line 94-96). Client mirrors the server's `MIN_PASSWORD_LENGTH = 8` (line 40) — no other
complexity rule. On submit (line 81-99), payload sent to the server is exactly:
```js
{ username, firstName, lastName, role, password }  // password omitted on edit
```

**API client** — [client/src/services/userAPI.js](client/src/services/userAPI.js)
`createUser(payload)` → `apiPost('/api/users', payload)` (line 49). Comment at line 47-48:
"payload carries a plaintext password on create only — the server hashes it and never returns
it." `toUser()` row mapper (line 23) never reads `password_hash` (there is nothing to read; the
server never selects it).

---

## 2. Credentials

**Hashing**: `bcrypt`, cost factor `10` (`BCRYPT_COST = 10`,
[server/src/services/user.service.js:27](server/src/services/user.service.js#L27)), applied only
in `createUser` (line 113: `bcrypt.hash(password, BCRYPT_COST)`). The only other bcrypt call in
the server is `bcrypt.compare` at login —
[server/src/routes/login.route.js:68](server/src/routes/login.route.js#L68).

**Password policy**: exactly "at least 8 characters," enforced in two places that must be kept in
sync by hand — `validPassword` in `user.service.js:64-69` (server) and `passwordInvalid` in
`UserForm.jsx:77` (client). No uppercase/digit/symbol rule, no denylist, no length ceiling found
anywhere in `server/src` or `client/src`.

**Reset/change-password path: none exists.**
- `user.service.js`'s `updateUser` has no password branch — a PATCH can change username, name, or
  role, never a password.
- There is no `PATCH /api/users/:id/password` route, no controller action, no repository write
  that touches `password_hash` outside of `insertUser`.
- The only UI surface mentioning a reset is a static modal in
  [client/src/pages/LoginPage.jsx:231-247](client/src/pages/LoginPage.jsx#L231-L247)
  ("FORGOT PASSWORD?" → "Please contact your Warehouse Manager or Administrator to reset your
  password.") — it has no `onClick` that calls any API; it just opens/closes a dialog with static
  text. There is currently no way, in code, for anyone (including an admin) to change a password
  once an account is created, other than direct database access.

---

## 3. Guards and audit

**Self-lockout guards**, all in [server/src/services/user.service.js](server/src/services/user.service.js):
- (a) Cannot deactivate self — `setUserStatus`, line 171-173: `if (id === actorId && body.isActive
  === false) throw fail(400, ...)`.
- (b) Cannot demote own role away from admin — `updateUser`, line 151-153: `if (id === actorId &&
  existing.role === 'admin' && role !== 'admin') throw fail(400, ...)`.
- (c) Cannot delete/archive self — `archiveUser`, line 196-198.

All three compare `id === actorId`, where `actorId` is `req.user.id` passed down from the
controller (never trusted from the request body). `UserForm.jsx` line 79 (`roleLocked = isEdit &&
isSelf && form.role === 'admin'`) duplicates guard (b) client-side as UX only — the comment at
lines 16-21 explicitly calls this "belt-and-braces," server is the real enforcement.

**Audit logging pattern**: [server/src/repositories/auditLog.repository.js](server/src/repositories/auditLog.repository.js)
exports `logAudit(client, { entityType, entityId, action, actorId, reason, approvedBy, before,
after })` — a single shared helper (extracted from a `donation.repository.js` original per the
file's header comment). It **requires the caller's transaction client**, not the pool (line
35-37), so an audit row can never survive a rollback of the change it describes. `before`/`after`
are passed as plain JS objects, not `JSON.stringify`'d (jsonb columns).

**The `audit_log.entity_id uuid` / `users.id int4` mismatch — confirmed live, and user creation's
audit write is almost certainly broken as written.**

- `audit_log.entity_id` is `uuid NOT NULL` — stated directly in a comment in
  [server/src/repositories/communityRequest.repository.js:12-15](server/src/repositories/communityRequest.repository.js#L12-L15):
  *"audit_log.entity_id is `uuid NOT NULL` with no FK; community_requests.id is a plain integer
  sequence, so logAudit(client, { entityId: <int> }) fails with 22P02 (invalid uuid) **exactly as
  it does today on users / products / purchase_orders**."* That file deliberately has **no** audit
  write at all, for this reason.
- `users.id` is a plain integer, not a uuid — confirmed independently three ways: (1) the test
  bootstrap seeds `INSERT INTO public.users (id, ...) VALUES (1, ...)` and calls
  `setval(pg_get_serial_sequence('public.users','id'), ...)` — a serial/identity int, in
  [server/database/test/volunteer_integration_test_bootstrap.sql](server/database/test/volunteer_integration_test_bootstrap.sql);
  (2) `server/database/migrations/022_extend_donation_email_logs.sql` adds
  `sent_by_user_id INTEGER REFERENCES users(id)`; (3)
  [server/src/repositories/gmail.repository.js:8-25](server/src/repositories/gmail.repository.js#L8-L25)
  runs a runtime `information_schema` probe of `users.id`'s `udt_name` specifically because it
  can't assume the type, and its own comment enumerates `uuid` / `int4` / `int8` as the
  possibilities it has actually seen.
- `donation.repository.js` is the one place that **does** work around this — it fabricates a
  padded fake-uuid string from an integer id:
  [server/src/repositories/donation.repository.js:20-21](server/src/repositories/donation.repository.js#L20-L21)
  `donationAuditEntityId = (donationId) => \`00000000-0000-0000-0000-${String(donationId).padStart(12,'0')}\``,
  used at every `logAudit`/query call for donations (lines 39, 913).
- `user.repository.js`'s three `logAudit` calls (`insertUser` line 109-115, `updateUser` line
  157-164, `archiveUser` line 206-213, `setUserActive` line 239-246) all pass `entityId: user.id`
  or `entityId: id` **as a raw integer, with no padding/casting** — the same shape the
  `communityRequest.repository.js` comment says fails with `22P02`.
- This is **not caught by the test suite**: both
  [server/__tests__/user.routes.test.js](server/__tests__/user.routes.test.js) (mocks
  `user.service.js` entirely, line 50-54) and
  [server/__tests__/user.service.test.js](server/__tests__/user.service.test.js) (mocks
  `user.repository.js` entirely, header comment line 3: "user.repository.js is mocked") never
  execute the real SQL, so the mismatch has no test coverage anywhere in this repo. I could not
  run a live query against Postgres from this environment to confirm the error fires in practice
  (no DB connection available to this session) — reporting the code-level contradiction as found,
  not verified against a live database.

**Implication for the invite feature, noted without proposing a fix**: an invite's own audit trail
(sent/resent/revoked/accepted) would hit the exact same question — is the invite table's PK a
uuid or an int, and does whatever writes to `audit_log` for it need the padding workaround or a
real type decision.

---

## 4. Email sending

**Found. Provider**: Gmail, via OAuth2 + the Gmail API (`googleapis` package), **not** SMTP and
**not** a transactional-email API (no SendGrid/Postmark/SES/Resend anywhere in this codebase).

**Branch status — resolved, the concern in the brief is out of date.** `pdf.provider.js` and the
Gmail integration were introduced by commit `9495540` "Complete donation email workflow and
pending donation fixes", which originated on `feature/DONATION_TESTS_CLEANUP`. I confirmed with
`git merge-base --is-ancestor origin/feature/DONATION_TESTS_CLEANUP f32e7a4` that the branch is
now **fully merged into `origin/staging/(DEVELOPMENT-TESTING)`** (0 commits ahead). The files
exist on staging today:
- [server/src/providers/email.provider.js](server/src/providers/email.provider.js)
- [server/src/providers/pdf.provider.js](server/src/providers/pdf.provider.js)
- [server/src/services/gmail.service.js](server/src/services/gmail.service.js)
- [server/src/repositories/gmail.repository.js](server/src/repositories/gmail.repository.js)
- [server/src/controllers/gmail.controller.js](server/src/controllers/gmail.controller.js) /
  [server/src/routes/gmail.routes.js](server/src/routes/gmail.routes.js) /
  [server/src/config/gmail.js](server/src/config/gmail.js)
- Client: [client/src/pages/GmailSettingsPage.jsx](client/src/pages/GmailSettingsPage.jsx),
  [client/src/services/gmailAPI.js](client/src/services/gmailAPI.js)

**How it's wrapped** — [server/src/providers/email.provider.js](server/src/providers/email.provider.js),
one function, `sendEmail({ to, subject, text, html, attachments }, userId = null)`:
- If `EMAIL_ENABLED()` is false, returns a stubbed success without sending
  (`{ sent: true, stubbed: true, messageId: 'stub-...' }`) — line 5-12.
- Otherwise delegates straight to `gmailService.sendEmail(...)` and normalizes errors into
  `{ sent: false, error, reason }` rather than throwing (line 18-38).
- `userId === null` sends as "the organisation account (most recently connected)" — comment at
  line 14-16 — vs. a specific admin's own connected Gmail account when a userId is given.

**What it needs to be configured** —
[server/src/config/gmail.js](server/src/config/gmail.js) and
[server/src/config/email.js](server/src/config/email.js):
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` — required, `getGmailConfig()`
  throws 503 if any is missing (line 8-19).
- `GMAIL_TOKEN_ENCRYPTION_KEY` — base64 of exactly 32 random bytes, used for AES-256-GCM
  encryption of stored OAuth tokens; `parseEncryptionKey()` throws 503 if absent or wrong length
  ([server/src/config/gmail.js:34-54](server/src/config/gmail.js#L34-L54)).
- `EMAIL_ENABLED` — defaults to **true** if unset (comment: "the Gmail plumbing... is all in
  place, so emails should genuinely send"); set to `false`/`0`/`no`/`off` to stub
  ([server/src/config/email.js](server/src/config/email.js)).
- `EMAIL_FROM` env var exists (`getEmailConfig()`) but is **not used** by `email.provider.js` or
  `gmail.service.js` — the actual From header is built from the connected Gmail account's address
  + `display_name` (`gmail.service.js:407-408`), not this config value. Worth knowing: this config
  function looks live but is dead code on the actual send path.
- **Critically, this requires a human to have completed an OAuth consent flow and connected a real
  Gmail account first** ("An admin must connect Gmail first" — fail message at
  [gmail.service.js:393](server/src/services/gmail.service.js#L393)). There is no
  send-without-a-connected-account fallback. If no Gmail account is ever connected, `sendEmail`
  fails with a 404.

**Is it reusable for a transactional invite email, or coupled to donations/certificates?**
The `email.provider.js` → `gmail.service.js` `sendEmail` path itself is **generic and reusable as-is**
— it takes `{ to, subject, text, html, attachments }` and has no donation/certificate-specific
logic; `pdf.provider.js` (certificate PDF generation) is a separate, uncoupled concern only used by
the donation flow's callers. An invite send could call `emailProvider.sendEmail(...)` directly.

What **is** coupled to donations is the **logging table**, not the sender — see next.

**`gmail_connections`** — created **at runtime, not via a migration file**. See
[server/src/repositories/gmail.repository.js:28-63](server/src/repositories/gmail.repository.js#L28-L63)
`ensureGmailConnectionsTable()`, called from inside `upsertConnection` before every write. It
first queries `information_schema.columns` to detect whether `users.id` is `uuid`/`int4`/`int8`
(lines 8-25) and builds `connected_by_user_id ${userIdType} REFERENCES users(id)` accordingly.
Columns: `id UUID PK`, `gmail_email`, `display_name`, `token_type`, `scope`,
`access_token_encrypted`, `refresh_token_encrypted` (both AES-256-GCM ciphertext, never plaintext
at rest), `access_token_expires_at`, `refresh_token_expires_at`, `connected_by_user_id` (unique —
one connection per admin), `created_at`, `updated_at`. One migration file,
[server/database/migrations/020_add_gmail_display_name.sql](server/database/migrations/020_add_gmail_display_name.sql),
also adds `display_name` for existing deployments — so the table's shape is defined in **two
places** (the runtime `ensureGmailConnectionsTable` DDL and this one migration file), a drift risk
if they're ever edited independently.

**`donation_email_logs`** — created by
[server/database/migrations/019_create_section18a_certificate_engine.sql:87-102](server/database/migrations/019_create_section18a_certificate_engine.sql#L87)
and extended by
[server/database/migrations/022_extend_donation_email_logs.sql](server/database/migrations/022_extend_donation_email_logs.sql).
Columns (post-022): `id BIGSERIAL`, **`donation_id INTEGER NOT NULL REFERENCES donations(id)`**,
`certificate_id BIGINT REFERENCES section18a_certificates(id)`, `email_type`, `recipient` (legacy)
+ `recipient_email`/`recipient_name` (added in 022), `subject`, `status CHECK IN
('sent','failed')`, `provider_message_id` (legacy) + `gmail_message_id`/`gmail_thread_id` (022),
`error_message`, `sent_at`, `created_at`, and `sent_by_user_id INTEGER REFERENCES users(id)`
(022).

**Would an invite send want its own log table, or can it reuse this one?**
`donation_id` is `NOT NULL` — every row in `donation_email_logs` must belong to a donation. An
invite email has no donation to point at, so reusing this table as-is is not possible without
either a migration to make `donation_id` nullable (weakening its existing guarantee) or reusing
only the pattern, not the table. Flagging this as a fact, not a recommendation, per the brief.

**Hard-coupling to email risk (asked-for check)**: `gmail.service.js`'s `sendEmail` signature and
`email.provider.js`'s wrapper are transport-agnostic in shape (`to/subject/text/html`), but the
*only* implementation is Gmail-OAuth, and it requires a connected Gmail account to exist before
anything can send — there is no abstraction layer above `email.provider.js` that a non-email
channel (WhatsApp, SMS) could slot into without either replacing `email.provider.js`'s internals
or adding a second, parallel provider and a caller-side choice of channel.

---

## 5. Tokens

Three token-generation patterns found (two named in the brief, one more found):

**(a) `picking_slips.public_token`** — DB-level `uuid` default. Column definition not found in
any file currently in `server/database/migrations/` (that table predates migration 019, and per
git history the 001-014 migration files were deleted from every branch — see §6). Confirmed live
by usage: [server/src/repositories/slipAccess.repository.js:71-82](server/src/repositories/slipAccess.repository.js#L71-L82)
`getPreviewByToken` — `WHERE ps.public_token = $1::uuid`, with `isUuid(token)` checked first and
returning `null` (not an error) on a non-uuid string. Not hashed at rest, not single-use, no
expiry — it's a stable, permanent identifier for a pallet, meant to be printed/scanned repeatedly.

**(b) Guest JWT via `jsonwebtoken`** — `jwt.sign(...)` calls at
[server/src/controllers/slipAccess.controller.js:65](server/src/controllers/slipAccess.controller.js#L65),
[server/src/routes/login.route.js:85](server/src/routes/login.route.js#L85), and
[server/src/routes/volunteer.routes.js:57](server/src/routes/volunteer.routes.js#L57). Read back
via `jwt.verify` in [server/src/middleware/auth.middleware.js:24](server/src/middleware/auth.middleware.js#L24)
(`auth`) and line 47 (`optionalGuest`), stored/read from an httpOnly cookie (`wms_token`). This is
a session credential, not a one-time link — it's self-contained (the server never looks it up in a
table) and reusable until expiry.

**(c) Not named in the brief, found here: the Section 18A donor-form token — the closest existing
match to what an invite token needs.**
[server/src/services/donation.service.js:63-77](server/src/services/donation.service.js#L63-L77):
```js
const hashSection18AToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const createSection18AFormToken = async (donationId) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
  await donationModel.saveSection18AFormToken({
    donationId, tokenHash: hashSection18AToken(token), expiresAt,
  });
  return { token, url: `${section18AFormBaseUrl()}/section-18a/${encodeURIComponent(token)}`, expiresAt };
};
```
Random 32-byte token, SHA-256 hashed before storage (`donations.section_18a_form_token_hash`,
added by
[server/database/migrations/022_section18a_donor_form_flow.sql](server/database/migrations/022_section18a_donor_form_flow.sql)),
expiry stored alongside (`section_18a_form_token_expires_at`), resolved by hash lookup
(`getDonationBySection18AFormTokenHash`, hashes the incoming token and does an exact `WHERE`
match — never stores or compares the raw token). Consumed via
[server/src/services/donation.service.js:1020-1029](server/src/services/donation.service.js#L1020-L1029)
`getSection18AFormByToken`: 400 if missing, 404 if hash not found, 410 if expired — three distinct
statuses, not a single uninformative 404 (contrast with §5's slip route, next). This is **not
single-use** in the strict sense — there's no "consumed" flag that invalidates the token after
first use; it stays valid until `expiresAt` or until `section_18a_status` reaches `'issued'`
(checked separately, line 1027-1029), which is a status check, not a token invalidation.
The route is public, unauthenticated:
[server/src/routes/donation.routes.js:16-17](server/src/routes/donation.routes.js#L16-L17)
`GET/POST /section-18a/form/:token`.

**Which is the better fit for a single-use expiring invite token?** Pattern (c) is structurally
the closest — random bytes, hashed at rest, expiry column, unauthenticated hash-lookup resolve —
but it is not actually single-use as implemented (no consumed/used marker, no invalidation on
first accept). A single-use invite token would need that piece added; nothing in this codebase
currently implements token invalidation-after-use. Not proposing how — flagging that the gap
exists in every current example.

**`/api/slip/:token` as a model to mirror — asked for directly.**
Route: [server/src/routes/slip.routes.js:54](server/src/routes/slip.routes.js#L54)
`router.get('/:token', publicSlipRateLimiter, slipAccessController.getPreviewByToken)`.
Controller: [server/src/controllers/slipAccess.controller.js:35-42](server/src/controllers/slipAccess.controller.js#L35-L42)
— thin, calls the service, catches and routes through a shared `handle()` error formatter.
Service: [server/src/services/slipAccess.service.js:52-56](server/src/services/slipAccess.service.js#L52-L56)
```js
const getPreviewByToken = async (token) => {
  const row = await slipAccessRepo.getPreviewByToken(token);
  if (!row) fail(404, NOT_FOUND);
  return toPreview(row);
};
```
`NOT_FOUND` (line 31) is one fixed string used for both "wrong code" and "no such row" — deliberately
uninformative, doesn't distinguish "malformed," "expired," or "never existed."

**What's the same, what would differ, for an invite-accept endpoint**:
- Same: unauthenticated, token-in-URL, resolve-then-404 shape; rate-limited
  (`publicSlipRateLimiter` — worth checking whether that limiter is generic enough to reuse or is
  scoped to the slip routes specifically, not confirmed in this pass).
- Would differ: `public_token` here is a *permanent* identifier with no expiry and no
  single-use/consumed semantics — an invite-accept endpoint needs both (expiry, and
  invalidation on accept), which is closer to pattern (c) than to this route's own repository
  query. Also, this route only *reads* (a preview); accepting an invite is a *write* (sets
  username/name/password hash) behind a public token, which none of the three existing patterns
  do — every public-token route found in this codebase is read-only or claims an already-existing
  record (`claim`), never creates the credential-bearing record itself.
- The uninformative-404 convention (single fixed message regardless of cause) is reusable
  verbatim; pattern (c)'s three-way split (400/404/410) is arguably more useful for an invite flow
  where "expired, ask the admin to resend" is a real, distinct user-facing state — flagging the
  tension between the two existing conventions without picking one.

---

## 6. Migrations — current state

**Directory**: `server/database/migrations/` **does exist** on current staging (confirmed by
listing it directly on `origin/staging/(DEVELOPMENT-TESTING)` at `f32e7a4`). Contents:
```
019_create_section18a_certificate_engine.sql
020_add_gmail_display_name.sql
021_create_certificate_settings_table.sql
022_extend_donation_email_logs.sql
022_section18a_donor_form_flow.sql   ← duplicate 022 prefix
```
No files exist for 001-018. This is a newer state than
[docs/guest-flow-assessment.md](docs/guest-flow-assessment.md) (an earlier report already in this
repo) records — that doc, read against local stale staging, says staging had **no** migrations
directory at all and that 019-022 lived only on `feature/DONATION_TESTS_CLEANUP`. That has since
changed: `feature/DONATION_TESTS_CLEANUP` is now fully merged (see §4), and migrations 019-022
came with it. Treat that doc's migration-state section as superseded by this one for anything
migrations-related.

**Next number**: two files both use prefix `022` (`022_extend_donation_email_logs.sql` and
`022_section18a_donor_form_flow.sql`) — the convention is not being followed consistently even
within the current set. The next free number is **023**, but whoever picks it should also decide
what to do about the existing duplicate rather than propagate it a third time.

**Runner**: **none.** No npm/yarn script in `server/package.json` mentions "migrate," nothing in
`server/scripts/`, no dedicated runner file anywhere in the repo. The only written
apply-procedure is the footer comment block in
[server/database/test/volunteer_integration_test_bootstrap.sql:lines near EOF](server/database/test/volunteer_integration_test_bootstrap.sql) —
explicitly scoped to an **isolated test DB**, never production, and it's manual: `psql
"$VOLUNTEER_TEST_DATABASE_URL" -f <file>` in numbered order.

**Two rival ledger tables** (`schema_migrations`, `schema_migration_provenance`) are described in
[docs/guest-flow-assessment.md:522-528](docs/guest-flow-assessment.md#L522) as existing live in
the database with inconsistent, non-overlapping rows, and no file in the repo writes to either
table from the current migration set (019-022 contain no `INSERT INTO schema_migrat...` of any
kind — checked directly, no matches). I could not independently confirm the row counts/contents
of those two tables myself — no live database connection was available to this session — so I'm
reporting that earlier doc's claim as unverified-by-me but not contradicted by anything I found.
What I *can* confirm from the files themselves: none of 019-022 record their own application in
any ledger table, and none of them wrap themselves in `BEGIN`/`COMMIT` (checked — zero matches for
either keyword across all five current migration files).

**Actual convention to follow, observed directly from the current files**: a single
top-of-file comment header naming the file and its purpose, one or more `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` statements (idempotent, safe to re-run),
occasionally a trailing `CREATE INDEX IF NOT EXISTS`, no ledger write, no transaction wrapper.
Applied by hand (psql / Supabase SQL editor per the older doc — I did not independently verify the
Supabase claim).

**A second, undocumented convention also exists in this codebase and is worth flagging**:
`server/src/repositories/donation.repository.js` and `server/src/repositories/gmail.repository.js`
both run their own `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
statements **at request time, inside the repository function itself**, not just in a migration
file — e.g. `saveSection18AFormToken` and `getDonationBySection18AFormTokenHash` both re-issue the
same three `ALTER TABLE donations ADD COLUMN IF NOT EXISTS ...` on every call
([server/src/repositories/donation.repository.js:544-576](server/src/repositories/donation.repository.js#L544)),
and `ensureGmailConnectionsTable()` runs before every `upsertConnection`
([server/src/repositories/gmail.repository.js:28](server/src/repositories/gmail.repository.js#L28)).
This is a real, load-bearing pattern in the current code — self-healing schema at the point of
use — separate from and not documented alongside the `migrations/` directory.

---

## 7. Collision check

Checked every other branch's commit log against the User Management files, `auth.middleware.js`,
and the email/provider files, using `git log --all -- <path>` then `git branch -a --contains` on
anything found, and `git log <staging>..<branch> -- <paths>` to see if anything is actually ahead
of current staging.

| Branch | Touches these files? | Status relative to current staging (`f32e7a4`) |
|---|---|---|
| `origin/feature/PWA` (tip `3630af3`) | Yes — `UserDirectoryPage.jsx` (dark mode, `178722b`) | Already merged into staging; 0 commits ahead on these paths |
| `origin/feature/notification-fix` | Yes — same commits as PWA (shared history) | Already merged; 0 ahead |
| `feature/user-management-fixes-hussain` (tip `4d76f6a`) | No code touching these paths ahead of staging | 1 commit ahead, docs-only (`Add guest flow assessment...`) |
| `origin/feature/DONATION_TESTS_CLEANUP` | Yes — introduced `email.provider.js`, `gmail.service.js`, `gmail.repository.js`, all migrations 019-022 | **Fully merged** into staging (0 ahead) |
| `origin/reporting-serena`, `origin/receiving-updates-serena`, `origin/deleted-feature-bugfix`, `feature/community-requests-hussain`, `feature/inventory-catalogue-hussain`, `feat/stock-routes-controllers`, `feat/picking-routes-controllers`, `feat/decanting-routes-controllers` | No | — |

`server/src/middleware/auth.middleware.js` has recent activity but all on
`feature/guest-ux-hussain` (this branch) and its own history, already accounted for as this
branch's own work — no other live branch touches it ahead of staging.

**Net finding: no other branch currently has unmerged changes to User Management, auth
middleware, or the email/provider layer.** The one open question from the brief — whether
`DONATION_TESTS_CLEANUP` had merged — is resolved: yes, fully.

---

## 8. Pending state

Searched `server/src` and `client/src` for "invite"/"invited"/"pending (user|account|staff)" —
the only hits were unrelated uses of the word "invite" in comments
(`client/src/pages/VolunteerManagementPage.jsx:141` "a greyed control invites a hunt", and
`client/src/pages/ReceiptsPage.jsx:23` "a person is invited" — both false positives, not account
state). **Nothing in `users`/account management models an invited-but-not-accepted state today.**

**One loosely analogous pattern does exist, elsewhere in the schema**: the Section 18A donation
flow tracks `donations.section_18a_status` as a **string lifecycle column** (not a boolean),
observed values include `'queued'`, `'qualifying_pending_donor'`
([server/src/services/donation.service.js:915](server/src/services/donation.service.js#L915)),
and `'issued'` (line 1027) — a record that exists, has had an action taken on it (a form-token
link sent), and is waiting on an external party (the donor) to complete something before it
reaches a final state. This is the same *shape* of problem the brief describes for an invite (a
row that exists but isn't "real" yet), solved with a status enum column on the owning row rather
than a separate table — worth knowing as prior art even though the brief's design decision is
explicitly for a separate table, not columns on `users`.

No `is_active`-adjacent tri-state, no `accepted_at`/`invited_at` columns anywhere, no separate
"pending accounts" table of any kind.

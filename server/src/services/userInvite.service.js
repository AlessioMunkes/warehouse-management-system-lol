// ─────────────────────────────────────────────────────────────
// server/src/services/userInvite.service.js
//
// Business rules for the email-invite flow (migrations 023-024). The
// link is the artefact: creating/resending an invite always returns
// the raw token/URL to the caller so an admin can copy it, whether or
// not the email send succeeds.
//
// EMAIL SEND IS GENUINELY NON-BLOCKING, same shape donation.service.js
// uses for thank-you emails: the invite row is durably written FIRST
// (inviteRepo.createInvite/resendInvite, its own transaction, already
// committed), and only then does sendInviteEmail attempt a send —
// wrapped in try/catch so that "the invite exists" and "the email
// went out" can never be the same failure. A Gmail account may not be
// connected in this environment at all (OAuth setup is currently
// bound to one teammate's local tunnel) — that is a routine, expected
// outcome here, not a bug to surface as a 500.
//
// THREE OUTCOMES, NOT TWO. emailProvider.sendEmail returns
// { sent: true, stubbed: true, ... } when EMAIL_ENABLED=false — sent
// is true but nothing was actually transmitted anywhere. Treating
// that as "sent" would tell an admin an email went out when it did
// not, so sendInviteEmail below collapses the provider's shape into
// exactly one of 'sent' / 'stubbed' / 'failed' and that is what
// persists to user_invites.email_status and reaches the client.
//
// TOKEN. crypto.randomBytes(32).toString('base64url'), SHA-256 hashed
// before storage, expiry stored alongside — same shape as the Section
// 18A donor-form token in donation.service.js:63-77. Unlike that one,
// this token IS single-use: acceptInvite's UPDATE only ever matches a
// row once (accepted_at IS NULL AND revoked_at IS NULL), so a second
// use of the same link fails with INVITE_ALREADY_USED.
//
// THREE-WAY ERROR SPLIT ON RESOLVE, not the slip route's single
// uninformative 404: a malformed token is 400, a token that never
// existed is 404, and a token that existed but is no longer usable is
// 410 with a `reason` field (`expired` / `revoked` / `accepted`) so
// the accept page can show distinct copy for each — an invite was
// sent to one named person, unlike a slip's printed poster a stranger
// might be probing.
//
// ROLE COMES FROM THE INVITE, NEVER FROM THE ACCEPT REQUEST BODY.
// acceptInvite takes username/firstName/lastName/password from the
// caller and nothing else — role and email are read off the invite
// row that the token resolved to.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import inviteRepo    from '../repositories/userInvite.repository.js';
import userRepo      from '../repositories/user.repository.js';
import emailProvider from '../providers/email.provider.js';
import {
  fail, clean, validUsername, validFirstName, validLastName, validRole, validPassword,
} from '../utils/userAccountFields.js';

const BCRYPT_COST = 10;
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const inviteBaseUrl = () => {
  const explicit = process.env.USER_INVITE_BASE_URL || process.env.CLIENT_URL || process.env.FRONTEND_URL;
  return String(explicit || 'http://localhost:5173').replace(/\/$/, '');
};

const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const generateToken = () => crypto.randomBytes(32).toString('base64url');

const inviteUrl = (token) => `${inviteBaseUrl()}/invite/${encodeURIComponent(token)}`;

// Display labels only — every stored/validated value stays
// warehouse_worker, matching the live users.role CHECK constraint.
const ROLE_LABELS = {
  warehouse_worker: 'Worker',
  manager:           'Manager',
  admin:             'Admin',
};

const composeInviteEmail = ({ email, role, inviterName }, url) => {
  const roleLabel = ROLE_LABELS[role] ?? role;
  const from = inviterName ? `${inviterName} has` : 'You have been';
  const expiresLine = 'This link expires in 7 days.';
  const text = [
    `${from} invited you to join as a ${roleLabel}.`,
    '',
    `Set up your account: ${url}`,
    '',
    expiresLine,
  ].join('\n');
  const html = `<p>${from} invited you to join as a <strong>${roleLabel}</strong>.</p>`
    + `<p><a href="${url}">${url}</a></p>`
    + `<p>${expiresLine}</p>`;
  return {
    to: email,
    subject: `You've been invited to Ladles of Love Warehouse Management`,
    text,
    html,
  };
};

// Wraps emailProvider.sendEmail and reduces its shape to exactly one
// of 'sent' / 'stubbed' / 'failed' — see the file header for why
// stubbed cannot be treated as sent. Never throws: any failure here
// (a Gmail account not connected being the routine one — see file
// header) is caught and reported as a 'failed' outcome, the same way
// donation.service.js's sendThankYouEmail catches around its own
// emailProvider.sendEmail call so a broken send can never fail the
// request that created the record it describes.
//
// ALWAYS SENDS AS THE ORGANISATION ACCOUNT (userId = null to the
// provider), never as the admin who clicked Invite/Resend — same as
// every donation email (see logEmailAttempt in donation.service.js,
// which hardcodes null regardless of who triggered the send). Gmail
// OAuth in this project is currently one teammate's personal
// connection, not something every admin has done individually; if
// invites sent as the acting admin's own connection, this would only
// ever work for that one person and 404 ("No Gmail connection found")
// for everyone else.
const sendInviteEmail = async (invite, url) => {
  let outcome;
  try {
    // invite.invited_by is the original inviter, which is who the
    // email should name — not the org account it actually sends from.
    const inviter = invite.invited_by ? await userRepo.getUserById(invite.invited_by) : null;
    const inviterName = inviter ? `${inviter.first_name} ${inviter.last_name}`.trim() : null;

    const result = await emailProvider.sendEmail(
      composeInviteEmail({ ...invite, inviterName }, url),
      null
    );
    if (result?.stubbed) {
      outcome = { status: 'stubbed', error: null };
    } else if (result?.sent) {
      outcome = { status: 'sent', error: null };
    } else {
      outcome = { status: 'failed', error: result?.error || result?.reason || 'Provider reported a failure.' };
    }
  } catch (err) {
    // Not expected — email.provider.js catches its own errors — but
    // an invite must survive this regardless of what threw.
    outcome = { status: 'failed', error: err.message || 'Could not send the invite email.' };
  }

  const attemptedAt = new Date();
  await inviteRepo.recordEmailAttempt(invite.id, outcome);

  return {
    status:      outcome.status,
    sent:        outcome.status === 'sent',
    stubbed:     outcome.status === 'stubbed',
    error:       outcome.status === 'failed' ? outcome.error : null,
    attemptedAt,
  };
};

const validEmail = (value) => {
  const email = clean(value);
  if (!email) throw fail(400, 'Email is required.');
  if (email.length > 255) throw fail(400, 'Email must be 255 characters or fewer.');
  // Deliberately loose — this only guards against obvious typos before
  // the email actually gets sent, not RFC 5322 conformance.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw fail(400, 'That does not look like a valid email address.');
  }
  return email;
};

const requireInviteId = (rawId) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) throw fail(400, 'A valid invite ID is required.');
  return id;
};

const toPublicInvite = (invite) => ({
  id:          invite.id,
  email:       invite.email,
  role:        invite.role,
  createdAt:   invite.created_at,
  lastSentAt:  invite.last_sent_at,
  expiresAt:   invite.expires_at,
  resendCount: invite.resend_count,
  revokedAt:   invite.revoked_at ?? null,
  acceptedAt:  invite.accepted_at ?? null,
  // Only present on rows read via getByTokenHash (the accept page's
  // resolve call) — every other read path leaves both undefined.
  inviterName: invite.inviter_first_name
    ? `${invite.inviter_first_name} ${invite.inviter_last_name ?? ''}`.trim()
    : null,
  // 'sent' | 'stubbed' | 'failed' | null (no attempt recorded yet —
  // see migration 024's header for when that happens).
  emailStatus:      invite.email_status ?? null,
  emailError:       invite.email_error ?? null,
  emailAttemptedAt: invite.email_attempted_at ?? null,
});

// ── Create ────────────────────────────────────────────────────
const createInvite = async (body, actorId) => {
  const email = validEmail(body?.email);
  const role  = validRole(body?.role);

  const existingUser = await userRepo.findUserByEmail(email);
  if (existingUser) {
    throw fail(409, `A user with the email "${email}" already exists.`);
  }

  const open = await inviteRepo.findOpenByEmail(email);
  if (open) {
    throw fail(409, `An open invite already exists for "${email}". Resend or revoke it instead of creating a new one.`);
  }

  const token = generateToken();
  const invite = await inviteRepo.createInvite({
    email,
    role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    invitedBy: actorId,
  }, actorId);

  // The invite exists and is already committed above — everything
  // from here on is best-effort. See sendInviteEmail's comment for
  // why this can never turn a created invite into a failed request.
  const url = inviteUrl(token);
  const { status, sent, stubbed, error, attemptedAt } = await sendInviteEmail(invite, url);

  return {
    invite: {
      ...toPublicInvite(invite),
      emailStatus: status,
      emailError: error,
      emailAttemptedAt: attemptedAt.toISOString(),
    },
    token,
    url,
    email: { sent, stubbed, error },
  };
};

// ── Read ──────────────────────────────────────────────────────
const listPendingInvites = async () => {
  const rows = await inviteRepo.listPending();
  return rows.map(toPublicInvite);
};

// ── Resend ────────────────────────────────────────────────────
const resendInvite = async (rawId, actorId) => {
  const id = requireInviteId(rawId);
  const existing = await inviteRepo.getById(id);
  if (!existing) throw fail(404, 'Invite not found.');
  if (existing.accepted_at) throw fail(409, 'This invite has already been accepted.');
  if (existing.revoked_at) throw fail(409, 'This invite was revoked. Create a new one instead.');

  const token = generateToken();
  const invite = await inviteRepo.resendInvite({
    id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  }, existing, actorId);

  if (!invite) throw fail(409, 'This invite is no longer pending.');

  const url = inviteUrl(token);
  const { status, sent, stubbed, error, attemptedAt } = await sendInviteEmail(invite, url);

  return {
    invite: {
      ...toPublicInvite(invite),
      emailStatus: status,
      emailError: error,
      emailAttemptedAt: attemptedAt.toISOString(),
    },
    token,
    url,
    email: { sent, stubbed, error },
  };
};

// ── Revoke ────────────────────────────────────────────────────
const revokeInvite = async (rawId, actorId) => {
  const id = requireInviteId(rawId);
  const existing = await inviteRepo.getById(id);
  if (!existing) throw fail(404, 'Invite not found.');
  if (existing.accepted_at) throw fail(409, 'This invite has already been accepted and cannot be revoked.');
  if (existing.revoked_at) return toPublicInvite(existing);   // idempotent

  const invite = await inviteRepo.revokeInvite(id, existing, actorId);
  if (!invite) throw fail(409, 'This invite is no longer pending.');
  return toPublicInvite(invite);
};

// ── Resolve by token (public) ────────────────────────────────
// Returns { invite, status: 'open' } or throws a shaped error the
// controller turns into 400 / 404 / 410-with-reason.
const resolveInviteByToken = async (rawToken) => {
  const token = clean(rawToken);
  if (!token) throw fail(400, 'An invite token is required.');

  const invite = await inviteRepo.getByTokenHash(hashToken(token));
  if (!invite) throw fail(404, 'This invite link was not found.');

  if (invite.revoked_at) {
    const err = fail(410, 'This invite was cancelled. Ask your admin to send a new one.');
    err.reason = 'revoked';
    throw err;
  }
  if (invite.accepted_at) {
    const err = fail(410, 'This invite link has already been used.');
    err.reason = 'accepted';
    throw err;
  }
  if (new Date(invite.expires_at) < new Date()) {
    const err = fail(410, 'This invite link has expired. Ask your admin to send a new one.');
    err.reason = 'expired';
    throw err;
  }

  return toPublicInvite(invite);
};

// ── Accept (public) ──────────────────────────────────────────
const acceptInvite = async (rawToken, body) => {
  const token = clean(rawToken);
  if (!token) throw fail(400, 'An invite token is required.');

  const invite = await inviteRepo.getByTokenHash(hashToken(token));
  if (!invite) throw fail(404, 'This invite link was not found.');

  if (invite.revoked_at) {
    const err = fail(410, 'This invite was cancelled. Ask your admin to send a new one.');
    err.reason = 'revoked';
    throw err;
  }
  if (invite.accepted_at) {
    const err = fail(410, 'This invite link has already been used.');
    err.reason = 'accepted';
    throw err;
  }
  if (new Date(invite.expires_at) < new Date()) {
    const err = fail(410, 'This invite link has expired. Ask your admin to send a new one.');
    err.reason = 'expired';
    throw err;
  }

  // Deliberately NOT reading body.role — the invite's own role is the
  // only source of truth for what account gets created.
  const username  = validUsername(body?.username);
  const firstName = validFirstName(body?.firstName);
  const lastName  = validLastName(body?.lastName);
  const password  = validPassword(body?.password);

  const clash = await userRepo.findUserByUsername(username);
  if (clash) {
    throw fail(409, `The username "${username}" is already taken. Please choose another.`);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const { user } = await inviteRepo.acceptInvite({
    inviteId: invite.id,
    username,
    firstName,
    lastName,
    role: invite.role,
    email: invite.email,
    passwordHash,
  });

  return user;
};

export default {
  createInvite,
  listPendingInvites,
  resendInvite,
  revokeInvite,
  resolveInviteByToken,
  acceptInvite,
};

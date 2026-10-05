// ─────────────────────────────────────────────────────────────
// server/src/services/passwordReset.service.js
//
// Self-service password reset, modelled on userInvite.service.js's
// email-invite flow — same token shape (32 random bytes, base64url,
// SHA-256 hashed at rest), same non-blocking three-outcome email
// send, same UPDATE-as-concurrency-guard on the write that consumes
// the token.
//
// NO ACCOUNT ENUMERATION, AND NO TIMING ORACLE EITHER.
// requestReset returns the identical { message } response whether or
// not the email matches an account, whether that account is active,
// and regardless of anything that happens afterwards trying to look
// it up, throttle it, create a token, or send the email.
//
// The invite flow's createInvite/resendInvite both AWAIT their email
// send before responding — that is deliberately NOT copied here.
// Awaiting any of this would make response time (and any thrown
// error) an oracle for whether the address exists: a slow DB lookup,
// a slow Gmail call, or a thrown exception on the found-user path
// would all be observable differences from the not-found path if the
// caller had to wait for them. So requestReset below builds and
// returns the generic response FIRST, and performRequestSideEffects
// runs after that, fire-and-forget, with its own rejection swallowed.
//
// KNOWN LIMITATION: confirmReset does not invalidate any other
// existing session/token for the account. A session issued before the
// reset remains valid after it. Fixing that needs a
// users.password_changed_at (or a session-version) column and a check
// in auth.middleware.js's verifySession — tracked separately, not
// built here.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import resetRepo     from '../repositories/passwordReset.repository.js';
import userRepo       from '../repositories/user.repository.js';
import communications from '../features/communications/communications.service.js';
import { appBaseUrl } from '../config/appUrl.js';
import { fail, clean, validPassword } from '../utils/userAccountFields.js';

const BCRYPT_COST      = 10;
const RESET_TTL_MS     = 1000 * 60 * 60; // 1 hour

const GENERIC_MESSAGE = "If that email is registered, we've sent a link to reset your password.";

const hashToken    = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const generateToken = () => crypto.randomBytes(32).toString('base64url');

const composeResetEmail = (email, url) => {
  const expiresLine = 'This link expires in 1 hour and can only be used once.';
  const text = [
    'Someone (hopefully you) asked to reset the password on this account.',
    '',
    `Reset it here: ${url}`,
    '',
    expiresLine,
    '',
    "If you didn't ask for this, you can ignore this email — your password will not change.",
  ].join('\n');
  const html = `<p>Someone (hopefully you) asked to reset the password on this account.</p>`
    + `<p><a href="${url}">${url}</a></p>`
    + `<p>${expiresLine}</p>`
    + `<p>If you didn't ask for this, you can ignore this email — your password will not change.</p>`;
  return {
    to: email,
    subject: "Reset your Ladles of Love Warehouse Management password",
    text,
    html,
  };
};

// Wraps communications.send (email.provider underneath) and reduces its shape to exactly one
// of 'sent' / 'stubbed' / 'failed' — same collapse as
// userInvite.service.js's sendInviteEmail, and for the same reason:
// EMAIL_ENABLED=false returns { sent: true, stubbed: true }, and
// treating that as 'sent' would record an email as delivered when
// nothing was transmitted. Never throws.
const sendResetEmail = async (reset, email, url) => {
  let outcome;
  try {
    const result = await communications.send({
      type: 'password_reset',
      ...composeResetEmail(email, url),
      related: { type: 'password_reset', id: reset.id },
      sendAs: null,
    });
    if (result?.stubbed) {
      outcome = { status: 'stubbed', error: null };
    } else if (result?.sent) {
      outcome = { status: 'sent', error: null };
    } else {
      outcome = { status: 'failed', error: result?.error || result?.reason || 'Provider reported a failure.' };
    }
  } catch (err) {
    outcome = { status: 'failed', error: err.message || 'Could not send the reset email.' };
  }
  await resetRepo.recordEmailAttempt(reset.id, outcome);
};

// Everything that can fail lives here, and this is ALWAYS invoked
// without being awaited by its caller (requestReset, below) — see the
// file header. Deliberately returns nothing and never needs to: there
// is no response left to shape by the time this runs.
const performRequestSideEffects = async (email, ip) => {
  const user = await userRepo.findUserByEmail(email);
  if (!user) return;

  // Re-fetch for is_active/archived_at — findUserByEmail's SELECT list
  // is intentionally narrow (id, username, email only; see
  // user.repository.js) because it was written for the invite flow's
  // "does this address already belong to someone" check, which never
  // needed more than that.
  const account = await userRepo.getUserById(user.id);
  if (!account || !account.is_active || account.archived_at) return;

  // Per-email throttle: a live request from the last 5 minutes means
  // one is already in flight (or sitting unread) — do not create a
  // second one or send a second email. Stops an attacker who cannot
  // read the target's inbox from mail-bombing it by rotating source
  // IPs past the per-IP rate limiter.
  const recent = await resetRepo.findRecentActiveByUserId(user.id);
  if (recent) return;

  // No web address to build the link from (appBaseUrl has logged why):
  // do not create a reset nobody can use, or send a broken link.
  const base = appBaseUrl('passwordReset');
  if (!base) return;

  const token = generateToken();
  const reset = await resetRepo.createReset({
    userId:      user.id,
    tokenHash:   hashToken(token),
    expiresAt:   new Date(Date.now() + RESET_TTL_MS),
    requestedIp: ip || null,
  });

  await sendResetEmail(reset, email, `${base}/reset-password/${encodeURIComponent(token)}`);
};

// ── Request (public) ─────────────────────────────────────────
// Deliberately NOT an async function that awaits its own work — see
// the file header. Returns synchronously (well, as a resolved value;
// callers may still `await` it harmlessly) with the generic message,
// having kicked off performRequestSideEffects without waiting on it.
const requestReset = (rawEmail, ip) => {
  const email = clean(rawEmail)?.toLowerCase() ?? null;

  if (email) {
    performRequestSideEffects(email, ip).catch((err) => {
      // Never allowed to reach the caller — see file header. This is
      // the only place this error is observable, and only server-side.
      console.error('[passwordReset:request]', err.message);
    });
  }

  return { message: GENERIC_MESSAGE };
};

// ── Shared validity check ────────────────────────────────────
// Same 3-way split as userInvite.service.js's resolve/accept, with
// 'superseded' standing in for invite's 'revoked' — a reset can't be
// admin-cancelled, but it can be superseded by a newer request, which
// reads differently to the person holding the old link ("a newer
// email was sent, use that one") than true time expiry does.
const loadValidReset = async (rawToken) => {
  const token = clean(rawToken);
  if (!token) throw fail(400, 'A reset token is required.');

  const reset = await resetRepo.getByTokenHash(hashToken(token));
  if (!reset) throw fail(404, 'This reset link was not found.');

  if (reset.used_at) {
    const err = fail(410, 'This reset link has already been used.');
    err.reason = 'used';
    throw err;
  }
  if (reset.superseded_at) {
    const err = fail(410, 'A newer reset link was requested since this one was sent. Use the newest email, or request another.');
    err.reason = 'superseded';
    throw err;
  }
  if (new Date(reset.expires_at) < new Date()) {
    const err = fail(410, 'This reset link has expired. Request a new one.');
    err.reason = 'expired';
    throw err;
  }

  return reset;
};

// ── Resolve (public) ─────────────────────────────────────────
const resolveReset = async (rawToken) => {
  await loadValidReset(rawToken);
  return { valid: true };
};

// ── Confirm (public) ─────────────────────────────────────────
const confirmReset = async (rawToken, newPassword) => {
  const reset = await loadValidReset(rawToken);
  const password = validPassword(newPassword);

  // Re-check active/archived at CONFIRM time, not just implicitly at
  // request time — the account can be deactivated in the window
  // between a reset email going out and it being used. Reported with
  // the same shape as an unresolvable token (404, no reason) rather
  // than a distinct error: telling a stranger holding an old link
  // "this account was deactivated" would confirm the account exists.
  const account = await userRepo.getUserById(reset.user_id);
  if (!account || !account.is_active || account.archived_at) {
    throw fail(404, 'This reset link was not found.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  await resetRepo.confirmReset({
    resetId:      reset.id,
    userId:       reset.user_id,
    passwordHash,
  });

  return { success: true };
};

export default {
  requestReset,
  resolveReset,
  confirmReset,
};

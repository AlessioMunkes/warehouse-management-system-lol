// ─────────────────────────────────────────────────────────────
// server/src/middleware/rateLimiter.middleware.js
//
// Rules:
//   - Max 10 attempts per IP in any 15-minute window
//   - After 10 failures the IP is blocked for 15 minutes
//   - The block resets automatically - no manual intervention needed
//   - A clear message tells the user to wait, without revealing
//     anything about valid usernames or passwords
// ─────────────────────────────────────────────────────────────
import { rateLimit } from 'express-rate-limit';

const loginRateLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15-minute window
  max:              10,              // max 10 attempts per IP per window
  standardHeaders:  'draft-8',      // sends RateLimit headers in the response
  legacyHeaders:    false,

  // What the client receives when blocked (429 Too Many Requests)
  message: {
    message: 'Too many login attempts. Please wait 15 minutes and try again.',
  },

  // Only count failed attempts (2xx responses don't increment the counter)
  // This means a legitimate user who logs in successfully isn't penalised
  skipSuccessfulRequests: true,
});

// ── Public slip lookup (BR-22) ────────────────────────────────
// GET /api/slip/:token and /api/slip/code/:code are unauthenticated by
// necessity — a volunteer holding a printed poster has no session yet.
//
// The uuid token is not worth guessing. The 6-character short code is:
// 16^6 is about 16.7 million, which is well within reach of a script if
// nothing slows it down.
//
// Two deliberate choices:
//
//   skipSuccessfulRequests — a warehouse full of volunteers is behind
//     ONE NAT address, so counting successful scans would let a busy
//     Saturday morning lock out the very people the feature is for. A
//     brute-force run is almost entirely 404s, so counting only
//     failures targets the attack and not the traffic.
//
//   60 per 15 minutes — generous for people mistyping a code off a
//     poster, and 5,760 wrong guesses a day against 16.7 million
//     possibilities is not a search anyone finishes.
export const publicSlipRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             60,
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many attempts. Please wait a few minutes, or ask a staff member for help.',
  },
});

// ── Public invite resolve/accept ────────────────────────────────
// Unlike the slip short code, the invite token is 256 bits of
// crypto.randomBytes — not worth guessing, so this isn't a brute-force
// defence the way publicSlipRateLimiter is. It exists to stop the
// accept endpoint (a write that creates an account) being hammered,
// and to bound damage if a token ever leaks. Lower ceiling than the
// slip limiter because there's no warehouse-full-of-volunteers-on-one-
// NAT case to make room for here — one invitee, one link.
export const publicInviteRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many attempts. Please wait a few minutes, or ask your admin for help.',
  },
});

// ── Public password-reset request ───────────────────────────────
// POST /api/password-reset/request is unauthenticated by necessity —
// nobody has a session yet. Deliberately its OWN limiter, separate
// from the one below, and deliberately NOT skipping successful
// requests: a "successful" response here looks byte-identical whether
// or not the email matches an account (see passwordReset.service.js's
// no-enumeration guarantee), so skipping successes would only count
// failures — which never happen from this endpoint's point of view —
// and the limiter would never trip at all. 8 per 15 minutes is enough
// for a real user who fat-fingered their email once or twice, and
// bounds how many accounts a single IP can probe or mail-bomb.
export const publicPasswordResetRequestRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             8,
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many requests. Please wait a few minutes and try again.',
  },
});

// ── Public password-reset resolve/confirm ───────────────────────
// GET /api/password-reset/:token and POST /api/password-reset/:token/confirm
// share this one. Unlike /request, a "successful" resolve/confirm
// really does mean the link was good, so skipSuccessfulRequests is
// safe here — this isn't the endpoint an enumeration attack targets,
// it's the one a real person hits once (resolve) and once or twice
// more (confirm, if they mistype a password). Sized like
// publicInviteRateLimiter.
export const publicPasswordResetRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many attempts. Please wait a few minutes, or request a new link.',
  },
});

export default loginRateLimiter;
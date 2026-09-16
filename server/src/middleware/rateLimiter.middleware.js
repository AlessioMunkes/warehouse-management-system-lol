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

export default loginRateLimiter;
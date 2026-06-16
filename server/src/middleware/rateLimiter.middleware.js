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

export default loginRateLimiter;
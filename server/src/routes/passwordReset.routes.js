// ─────────────────────────────────────────────────────────────
// server/src/routes/passwordReset.routes.js
//
// Every route here is public — an invitee/resetter has no session at
// any point in this flow, same as userInvite.routes.js's public pair.
//
// TWO RATE LIMITERS, NOT ONE. publicPasswordResetRequestRateLimiter is
// tight and does not skip successful requests, because a "successful"
// response from /request looks identical whether or not the email
// exists (see passwordReset.service.js) — counting only failures
// would make it useless against enumeration/spam. The looser
// publicPasswordResetRateLimiter covers resolving a link and
// submitting a new password, which is not what an enumeration attack
// targets, so it can behave like the other public-token limiters
// (skips successes, higher ceiling) without reopening that hole.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import {
  publicPasswordResetRequestRateLimiter,
  publicPasswordResetRateLimiter,
} from '../middleware/rateLimiter.middleware.js';
import passwordResetController from '../controllers/passwordReset.controller.js';

const router = express.Router();

router.post('/request',
  publicPasswordResetRequestRateLimiter, passwordResetController.request);

router.get('/:token',
  publicPasswordResetRateLimiter, passwordResetController.resolve);

router.post('/:token/confirm',
  publicPasswordResetRateLimiter, passwordResetController.confirm);

export default router;

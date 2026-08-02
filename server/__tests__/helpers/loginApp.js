// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/loginApp.js
//
// Minimal Express app wiring up just the login routes + rate
// limiter, mirroring index.js without app.listen() or the
// delivery routes (which pull in a broken repository import).
// ─────────────────────────────────────────────────────────────
import express          from 'express';
import cookieParser     from 'cookie-parser';
import loginRateLimiter from '../../src/middleware/rateLimiter.middleware.js';
import loginRouter      from '../../src/routes/login.route.js';

export const buildLoginApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/login', loginRateLimiter, loginRouter);
  return app;
};

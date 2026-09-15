// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/volunteerApp.js
//
// Minimal Express app wiring up just /api/volunteers, mirroring
// index.js without app.listen() and without the login rate limiter
// (an in-memory counter that would bleed across tests in a file
// making more than a handful of requests).
//
// Callers are expected to vi.mock('../src/config/db.js') before
// importing this helper — volunteer.routes.js queries the pool
// directly for sign-in, and config/db.js calls process.exit(1) when
// DATABASE_URL is absent, which would kill the vitest process with no
// failure output.
// ─────────────────────────────────────────────────────────────
import express         from 'express';
import cookieParser    from 'cookie-parser';
import volunteerRouter from '../../src/routes/volunteer.routes.js';

export const buildVolunteerApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/volunteers', volunteerRouter);
  return app;
};

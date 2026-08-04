// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/sessionApp.js
//
// Minimal Express app wiring up just GET /api/me, mirroring
// index.js without app.listen(). Callers are expected to
// vi.mock('../src/config/db.js') before importing this helper —
// session.route.js queries the pool directly, and config/db.js
// calls process.exit(1) when DATABASE_URL is absent, which would
// kill the vitest process with no failure output.
// ─────────────────────────────────────────────────────────────
import express       from 'express';
import cookieParser  from 'cookie-parser';
import sessionRouter from '../../src/routes/session.route.js';

export const buildSessionApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/me', sessionRouter);
  return app;
};
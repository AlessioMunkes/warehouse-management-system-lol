// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/slipApp.js
//
// Minimal Express app wiring up just /api/slip, mirroring index.js
// without app.listen().
//
// Callers are expected to vi.mock('../src/config/db.js') before
// importing this helper — the claim path queries the pool directly to
// insert the volunteer, and config/db.js calls process.exit(1) when
// DATABASE_URL is absent, which would kill the vitest process with no
// failure output.
// ─────────────────────────────────────────────────────────────
import express      from 'express';
import cookieParser from 'cookie-parser';
import slipRouter   from '../../src/routes/slip.routes.js';

export const buildSlipApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/slip', slipRouter);
  return app;
};

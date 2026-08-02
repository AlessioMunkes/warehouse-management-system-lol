// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/decantingApp.js
//
// Minimal Express app wiring up just the decanting routes,
// mirroring index.js without app.listen(). Callers are expected
// to vi.mock('../src/services/decanting.service.js') before
// importing this helper, since decanting.routes.js pulls in the
// controller/service/repository chain.
//
// NOTE: no error-handling middleware here — decanting.controller.js
// try/catches every handler itself, so nothing reaches Express.
// ─────────────────────────────────────────────────────────────
import express         from 'express';
import cookieParser    from 'cookie-parser';
import decantingRouter from '../../src/routes/decanting.routes.js';

export const buildDecantingApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/decanting', decantingRouter);   // verify against index.js
  return app;
};
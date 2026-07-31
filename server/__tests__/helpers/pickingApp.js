// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/pickingApp.js
//
// Minimal Express app wiring up just the picking routes,
// mirroring index.js without app.listen(). Callers are expected
// to vi.mock('../src/services/picking.service.js') before
// importing this helper, since picking.routes.js pulls in the
// controller/service/repository chain — and picking.repository.js
// imports ./stock.repository.js, which does not exist in the repo.
// ─────────────────────────────────────────────────────────────
import express       from 'express';
import cookieParser  from 'cookie-parser';
import pickingRouter from '../../src/routes/picking.routes.js';

export const buildPickingApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/picking', pickingRouter);
  return app;
};
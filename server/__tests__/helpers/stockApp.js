// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/stockApp.js
//
// Minimal Express app wiring up just the stock routes, mirroring
// index.js without app.listen(). Callers are expected to
// vi.mock('../src/services/stock.service.js') before importing this
// helper, since stock.routes.js pulls in the controller/service/
// repository chain and stock.repository.js imports config/db.js,
// which calls process.exit(1) when DB_* env vars are absent.
// ─────────────────────────────────────────────────────────────
import express      from 'express';
import cookieParser from 'cookie-parser';
import stockRouter  from '../../src/routes/stock.routes.js';

export const buildStockApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/stock', stockRouter);
  return app;
};
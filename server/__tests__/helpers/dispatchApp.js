// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/dispatchApp.js
//
// Minimal Express app wiring up just the dispatch routes, mirroring
// index.js without app.listen(). Callers are expected to
// vi.mock('../src/services/dispatch.service.js') before importing
// this helper, since dispatch.routes.js pulls in the controller /
// service / repository chain and dispatch.repository.js imports
// config/db.js, which calls process.exit(1) when DB_* env vars are
// absent.
// ─────────────────────────────────────────────────────────────
import express        from 'express';
import cookieParser   from 'cookie-parser';
import dispatchRouter from '../../src/routes/dispatch.routes.js';

export const buildDispatchApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/dispatch', dispatchRouter);
  return app;
};
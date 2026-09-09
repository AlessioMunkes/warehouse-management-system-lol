// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/dashboardApp.js
//
// Minimal Express app wiring up just the dashboard routes, mirroring
// index.js without app.listen() — same pattern as productApp.js/
// userApp.js. Callers must vi.mock('../src/services/dashboard.service.js')
// before importing this helper: dashboard.routes.js pulls in the
// controller/service/repository chain, and dashboard.repository.js
// imports config/db.js, which calls process.exit(1) when
// DATABASE_URL is absent.
// ─────────────────────────────────────────────────────────────
import express         from 'express';
import cookieParser    from 'cookie-parser';
import dashboardRouter from '../../src/routes/dashboard.routes.js';

export const buildDashboardApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/dashboard', dashboardRouter);
  return app;
};

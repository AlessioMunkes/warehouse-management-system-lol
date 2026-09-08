// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/userApp.js
//
// Minimal Express app wiring up just the user routes, mirroring
// index.js without app.listen() — same pattern as supplierApp.js.
// Callers must vi.mock('../src/services/user.service.js') before
// importing this helper: user.routes.js pulls in the controller/
// service/repository chain, and user.repository.js imports
// config/db.js, which calls process.exit(1) when DATABASE_URL is
// absent.
// ─────────────────────────────────────────────────────────────
import express    from 'express';
import cookieParser from 'cookie-parser';
import userRouter from '../../src/routes/user.routes.js';

export const buildUserApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/users', userRouter);
  return app;
};

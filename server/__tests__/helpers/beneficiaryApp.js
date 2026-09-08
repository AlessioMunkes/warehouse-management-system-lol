// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/beneficiaryApp.js
//
// Minimal Express app wiring up just the beneficiary routes,
// mirroring index.js without app.listen() — same pattern as
// productApp.js/userApp.js. Callers must
// vi.mock('../src/services/beneficiary.service.js') before importing
// this helper: beneficiary.routes.js pulls in the controller/service/
// repository chain, and beneficiary.repository.js imports
// config/db.js, which calls process.exit(1) when DATABASE_URL is
// absent.
// ─────────────────────────────────────────────────────────────
import express           from 'express';
import cookieParser      from 'cookie-parser';
import beneficiaryRouter from '../../src/routes/beneficiary.routes.js';

export const buildBeneficiaryApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/beneficiaries', beneficiaryRouter);
  return app;
};

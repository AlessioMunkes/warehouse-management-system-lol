// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/donationApp.js
//
// Minimal Express app wiring up just the donation routes, mirroring
// index.js without app.listen(). Callers are expected to
// vi.mock('../src/services/donation.service.js') before importing
// this helper, since donation.routes.js pulls in the controller /
// service / repository chain and donation.repository.js imports
// config/db.js, which calls process.exit(1) when DB_* env vars are
// absent.
// ─────────────────────────────────────────────────────────────
import express        from 'express';
import cookieParser   from 'cookie-parser';
import donationRouter from '../../src/routes/donation.routes.js';

export const buildDonationApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/donations', donationRouter);
  return app;
};